# Whisper OpenAPI Spec Implementation Plan

## Overview
OpenAPI spec'teki güvenlik ve protokol özelliklerini uygulamaya geçirme planı.

---

## Phase 1: Dual Keypair Architecture (Foundation)

**Tüm diğer güvenlik özellikleri buna bağlı - öncelikli**

### Mobile Changes

**`mobile/src/crypto/CryptoService.ts`**
```typescript
// Eklenecek methodlar:
generateSigningKeyPair(): { signingPublicKey: string; signingPrivateKey: string }
  → nacl.sign.keyPair() kullan

deriveSigningKeysFromSeed(seedPhrase: string[]): { signingPublicKey: string; signingPrivateKey: string }
  → nacl.sign.keyPair.fromSeed(seed32bytes) kullan

sign(message: Uint8Array, signingPrivateKey: string): string
  → nacl.sign.detached() ile imzala, base64 döndür

verify(message: Uint8Array, signature: string, signingPublicKey: string): boolean
  → nacl.sign.detached.verify() kullan
```

**`mobile/src/types/index.ts`**
```typescript
export interface LocalUser extends User {
  privateKey: string;           // X25519 (encryption)
  signingPublicKey: string;     // Ed25519 (signing) - YENİ
  signingPrivateKey: string;    // Ed25519 (signing) - YENİ
  seedPhrase: string[];
}
```

**`mobile/src/screens/WelcomeScreen.tsx`**
- Hesap oluşturmada her iki keypair'i generate et
- SecureStorage'a kaydet

**`mobile/src/screens/SeedPhraseScreen.tsx`**
- Seed recovery'de her iki keypair'i derive et

### Server Changes

**`server/src/types/index.ts`**
```typescript
export interface ConnectedClient {
  // ... existing fields
  signingPublicKey: string;  // YENİ
}
```

**`server/src/websocket/ConnectionManager.ts`**
- `register()` methoduna signingPublicKey ekle

---

## Phase 2: Challenge-Response Authentication

### New Server File: `server/src/services/AuthService.ts`

```typescript
class AuthService {
  private pendingChallenges: Map<string, {
    whisperId: string;
    challenge: string;
    expiresAt: number;
    signingPublicKey: string;
    publicKey: string;
    pushToken?: string;
    prefs?: PrivacyPrefs;
  }> = new Map();

  createChallenge(socketId: string, data: RegisterData): string
    → 32 byte random challenge oluştur
    → 30 saniye expiry ile sakla
    → challenge'ı base64 olarak döndür

  verifyProof(socketId: string, signature: string): VerifyResult
    → pending challenge'ı bul
    → expiry kontrolü (CHALLENGE_EXPIRED)
    → Ed25519 signature doğrula (AUTH_FAILED)
    → başarılıysa client data'yı döndür

  cleanupExpired(): void
    → Her dakika çalışır
}
```

### Server Message Flow

**`server/src/websocket/WebSocketServer.ts`**

```
register mesajı geldiğinde:
1. Format ve ban kontrolü (mevcut)
2. authService.createChallenge() çağır
3. register_challenge gönder (register_ack yerine)

register_proof mesajı geldiğinde:
1. authService.verifyProof() çağır
2. Başarılıysa: connectionManager.register() + register_ack
3. Başarısızsa: AUTH_FAILED veya CHALLENGE_EXPIRED error
```

### Mobile Changes

**`mobile/src/services/MessagingService.ts`**

```typescript
// Yeni flow:
private async register(): Promise<void> {
  this.send({
    type: 'register',
    payload: {
      whisperId: this.user.whisperId,
      publicKey: this.user.publicKey,
      signingPublicKey: this.user.signingPublicKey,  // YENİ
      pushToken: this.pushToken,
      prefs: await this.getPrivacyPrefs(),
    },
  });
  // register_challenge bekle...
}

// handleMessage'da:
case 'register_challenge':
  const { challenge } = payload;
  const signature = cryptoService.sign(
    decodeBase64(challenge),
    this.user.signingPrivateKey
  );
  this.send({
    type: 'register_proof',
    payload: { signature: encodeBase64(signature) },
  });
  break;
```

---

## Phase 3: P2P Block Enforcement

### New Server File: `server/src/services/BlockService.ts`

```typescript
class BlockService {
  private blocks: Map<string, Set<string>> = new Map();

  block(blocker: string, blocked: string): void
  unblock(blocker: string, blocked: string): void
  isBlocked(sender: string, recipient: string): boolean
  getBlockedUsers(whisperId: string): string[]
}
```

### Server Changes

**`server/src/websocket/WebSocketServer.ts`**
```typescript
// handleSendMessage içinde:
if (blockService.isBlocked(client.whisperId, toWhisperId)) {
  this.sendError(socket, 'BLOCKED', 'You are blocked by this user');
  return;
}

// handleCallInitiate içinde:
if (blockService.isBlocked(client.whisperId, toWhisperId)) {
  this.sendError(socket, 'BLOCKED', 'Cannot call blocked user');
  return;
}

// handleTyping içinde:
if (blockService.isBlocked(client.whisperId, toWhisperId)) {
  return; // Sessizce drop et
}

// Yeni handler'lar:
handleBlockUser(socket, payload): block_ack gönder
handleUnblockUser(socket, payload): unblock_ack gönder
```

---

## Phase 4: Privacy Prefs & Rate Limiting

### Privacy Prefs

**`server/src/types/index.ts`**
```typescript
export interface PrivacyPrefs {
  sendReadReceipts: boolean;
  sendTypingIndicator: boolean;
  hideOnlineStatus: boolean;
}

export interface ConnectedClient {
  // ... existing
  prefs?: PrivacyPrefs;
}
```

**`server/src/websocket/WebSocketServer.ts`**
```typescript
// handleDeliveryReceipt içinde:
if (status === 'read' && !client.prefs?.sendReadReceipts) {
  return; // Read receipt gönderme
}

// handleTyping içinde:
if (!client.prefs?.sendTypingIndicator) {
  return;
}
```

### Rate Limiting

**New File: `server/src/services/RateLimiter.ts`**
```typescript
class RateLimiter {
  private typingTimestamps: Map<string, number> = new Map();

  checkTypingLimit(sender: string, recipient: string): boolean {
    const key = `${sender}:${recipient}`;
    const now = Date.now();
    const last = this.typingTimestamps.get(key) || 0;

    if (now - last < 2000) return true; // Rate limited

    this.typingTimestamps.set(key, now);
    return false;
  }
}
```

**`server/src/websocket/WebSocketServer.ts`**
```typescript
// handleTyping içinde (en başta):
if (rateLimiter.checkTypingLimit(client.whisperId, toWhisperId)) {
  this.sendError(socket, 'RATE_LIMITED', 'Too many typing indicators');
  return;
}
```

---

## Phase 5: Cursor Pagination

**`server/src/services/MessageQueue.ts`**
```typescript
getPendingPaginated(
  whisperId: string,
  cursor?: string,
  limit: number = 50
): {
  messages: PendingMessage[];
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}
```

**`server/src/types/index.ts`**
```typescript
export interface FetchPendingMessage {
  type: 'fetch_pending';
  payload: {
    cursor?: string;
  };
}

export interface PendingMessagesMessage {
  type: 'pending_messages';
  payload: {
    messages: PendingMessage[];
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
  };
}
```

---

## Phase 6: Secure Account Deletion

**`server/src/websocket/WebSocketServer.ts`**
```typescript
handleDeleteAccount(socket, payload) {
  const { confirmation, timestamp, signature } = payload;

  // 1. Confirmation string kontrolü
  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    this.sendError(socket, 'INVALID_CONFIRMATION');
    return;
  }

  // 2. Timestamp kontrolü (5 dakika içinde)
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    this.sendError(socket, 'CHALLENGE_EXPIRED');
    return;
  }

  // 3. Signature doğrula
  const message = `DELETE_MY_ACCOUNT:${timestamp}`;
  if (!this.verifySignature(message, signature, client.signingPublicKey)) {
    this.sendError(socket, 'AUTH_FAILED');
    return;
  }

  // 4. Tüm verileri sil
  messageQueue.clearPending(client.whisperId);
  blockService.clearBlocks(client.whisperId);
  connectionManager.unregister(client.whisperId);

  // 5. Confirmation gönder ve kapat
  this.send(socket, { type: 'account_deleted', payload: { success: true } });
  socket.close();
}
```

---

## Phase 7: Group Authorization

**`server/src/websocket/WebSocketServer.ts`**
```typescript
// handleUpdateGroup içinde:
const group = groupService.getGroup(groupId);
if (group.createdBy !== client.whisperId) {
  this.sendError(socket, 'UNAUTHORIZED', 'Only group creator can update');
  return;
}
```

---

## New Error Codes

**`server/src/types/index.ts`**
```typescript
export const ErrorCodes = {
  // Existing
  PARSE_ERROR: 'PARSE_ERROR',
  INVALID_ID: 'INVALID_ID',
  NOT_REGISTERED: 'NOT_REGISTERED',
  BANNED: 'BANNED',

  // New
  AUTH_FAILED: 'AUTH_FAILED',
  CHALLENGE_EXPIRED: 'CHALLENGE_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  BLOCKED: 'BLOCKED',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;
```

---

## Files Summary

### New Server Files
1. `server/src/services/AuthService.ts` - Challenge-response
2. `server/src/services/BlockService.ts` - P2P blocking
3. `server/src/services/RateLimiter.ts` - Rate limiting

### Modified Files
| File | Changes |
|------|---------|
| `mobile/src/crypto/CryptoService.ts` | Ed25519 keypair, sign, verify |
| `mobile/src/types/index.ts` | LocalUser signing keys |
| `mobile/src/services/MessagingService.ts` | Challenge-response flow |
| `mobile/src/screens/WelcomeScreen.tsx` | Dual keypair generation |
| `mobile/src/screens/SeedPhraseScreen.tsx` | Dual keypair derivation |
| `server/src/types/index.ts` | New message types, error codes |
| `server/src/websocket/WebSocketServer.ts` | Auth flow, block checks, rate limit |
| `server/src/websocket/ConnectionManager.ts` | signingPublicKey, prefs |
| `server/src/services/MessageQueue.ts` | Cursor pagination |

---

## Implementation Order

```
Phase 1: Dual Keypair        → Foundation (tüm auth buna bağlı)
Phase 2: Challenge-Response  → Core security
Phase 3: Block Enforcement   → User safety
Phase 4: Prefs + Rate Limit  → Privacy + abuse prevention
Phase 5: Cursor Pagination   → Scalability
Phase 6: Secure Deletion     → GDPR compliance
Phase 7: Group Authorization → Enhancement
```

---

## Verification

1. **Unit Tests**:
   - CryptoService: Key generation, seed derivation, sign/verify
   - AuthService: Challenge creation, signature verification
   - BlockService: Block/unblock logic
   - RateLimiter: Timing tests

2. **Integration Tests**:
   - Full registration with challenge-response
   - Message blocked when user is blocked
   - Pagination through pending messages

3. **Manual Testing**:
   - Create account → verify both keypairs stored
   - Reconnect → verify challenge-response works
   - Block user → verify messages rejected
   - Delete account → verify all data cleared
