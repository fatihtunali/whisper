# Whisper - Privacy-First Encrypted Messaging

Whisper is a privacy-first, end-to-end encrypted messaging application. Users communicate via anonymous "Whisper IDs" (WSP-XXXX-XXXX-XXXX) without requiring phone numbers, emails, or any personal information.

## Design Philosophy

Whisper prioritizes **identity continuity**, **recoverability**, and **operational simplicity** over perfect forward secrecy. It is designed for real-world reliability under mobile constraints—not adversarial nation-state resistance. Users can recover their identity with a 12-word seed phrase, messages are encrypted with proven primitives (NaCl), and the server operates as a zero-knowledge relay. This approach favors practical privacy for everyday users over cryptographic perfection.

## Features

- **End-to-End Encryption**: X25519 key exchange + XSalsa20-Poly1305 (TweetNaCl)
- **Anonymous Identity**: No phone number or email required
- **Voice & Video Calls**: WebRTC with TURN server support
- **Group Chats**: Encrypted group messaging
- **Message Types**: Text, images, voice messages, files, reactions, replies
- **Disappearing Messages**: Per-conversation auto-delete settings
- **Native Call UI**: iOS CallKit, Android ConnectionService integration

## Repository Structure

```
whisper/
├── mobile/     # Expo React Native app (iOS/Android)
├── server/     # Node.js WebSocket backend
├── website/    # Next.js landing page
├── CLAUDE.md   # Development guidance
└── README.md   # This file
```

## Recent Updates (v21)

### iOS VoIP Push Fix
**Problem**: iOS crash on incoming calls - "unrecognized selector sent to instance" when PushKit tried to call delegate methods.

**Solution**: Created `mobile/plugins/withVoipPushDelegate.js` config plugin that:
- Adds `PKPushRegistryDelegate` conformance to AppDelegate.swift
- Creates bridging header for Objective-C module (`RNVoipPushNotificationManager`)
- Implements three delegate methods in Swift:
  - `pushRegistry(_:didUpdate:for:)` - VoIP token received
  - `pushRegistry(_:didReceiveIncomingPushWith:for:completion:)` - VoIP push received
  - `pushRegistry(_:didInvalidatePushTokenFor:)` - Token invalidated
- Adds early VoIP registration in `didFinishLaunchingWithOptions`

**Files Changed**:
- `mobile/plugins/withVoipPushDelegate.js` (new)
- `mobile/app.json` - Added plugin reference

### Android Call Notification Fix
**Problem**: Android devices weren't receiving call notifications when offline.

**Solution**:
1. **Use correct notification channel**: Call notifications now use `calls` channel instead of `messages`
   - `calls` channel has `bypassDnd: true` and `lockscreenVisibility: PUBLIC`
2. **Always send regular push**: Both VoIP (iOS) and regular push are now sent for all calls
3. **Platform info in Redis**: Platform (ios/android) is now stored in Redis for future optimizations

**Files Changed**:
- `server/src/services/PushService.ts` - Added channelId parameter, detailed logging
- `server/src/services/RedisService.ts` - Added platform storage methods
- `server/src/websocket/ConnectionManager.ts` - Added getPlatform method
- `server/src/websocket/WebSocketServer.ts` - Improved call notification logic

### Headphone Button Support
**Problem**: Users couldn't answer/end calls using headphone buttons (wired or Bluetooth).

**Solution**: Added `MediaButton` and `WiredHeadset` event listeners in CallService:
- **Single press on ringing**: Answers incoming call
- **Single press on connected**: Ends active call
- **Double press on ringing**: Rejects incoming call
- **Double press on connected**: Ends active call

**Files Changed**:
- `mobile/src/services/CallService.ts` - Added audio event listeners

## Data Persistence

| Data | Storage | Persists Across Restart |
|------|---------|------------------------|
| WebSocket connections | Memory | No (expected) |
| Push tokens | Redis | Yes |
| VoIP tokens | Redis | Yes |
| Platform info | Redis | Yes |
| Public keys | Redis | Yes |
| Signing keys | Redis | Yes |
| Pending messages | Redis (72h TTL) | Yes |
| Last seen | Redis | Yes |
| Groups | Redis | Yes |
| Bans/Reports | Memory + File | Yes |

## Development Setup

### Prerequisites
- Node.js 18+
- Expo CLI
- EAS CLI (for builds)
- Redis server

### Mobile Development
```bash
cd mobile
npm install
npm start              # Expo dev server
```

### Server Development
```bash
cd server
npm install
npm run dev            # Development with hot reload
```

### Building for Production

**iOS** (requires Mac):
```bash
cd mobile
eas build --platform ios --profile production
```

**Android**:
```bash
cd mobile
eas build --platform android --profile production
```

**Server**:
```bash
cd server
npm run build
pm2 restart whisper-server
```

## Deployment

### Server (142.93.136.228)
```bash
ssh root@142.93.136.228
cd /home/whisper/whisper/server
git pull
npm install
npm run build
pm2 restart whisper-server
pm2 logs whisper-server --lines 50  # Check logs
```

### Website
```bash
cd /home/whisper/sarjmobile
git pull
npm install
npm run build
pm2 restart sarjmobile
```

## Security Model

### Core Principles
- **Zero-knowledge server**: Only encrypted blobs pass through
- **Private keys on device only**: Never transmitted
- **Challenge-response auth**: Ed25519 signatures prevent replay attacks
- **Account deletion**: Requires cryptographic signature

### Threat Model

**In Scope (Protected Against):**
- Server compromise: Attacker with full server access cannot read message content
- Network eavesdropping: All messages encrypted end-to-end
- Replay attacks: Challenge-response authentication with Ed25519 signatures
- Identity spoofing: Messages cryptographically signed by sender
- Unauthorized account deletion: Requires signature from account's private key

**Out of Scope (Not Protected Against):**
- Device compromise: If attacker has access to unlocked device, they can read messages
- Endpoint security: Malware on user's device can access decrypted content
- Traffic analysis: Server sees who communicates with whom (Whisper IDs), message timing, and sizes
- Social engineering: Users can be tricked into adding malicious contacts

**Visible Metadata:**
- Whisper IDs of sender and recipient
- Timestamp of message transmission
- Message size (encrypted blob length)
- Online/offline status (unless hidden in privacy settings)
- Group membership (server routes group messages)

**Metadata Minimization (Current Scope):**
Advanced traffic analysis mitigations are **not currently implemented**:
- Message padding (fixed-size packets): Not planned
- Delayed/batched delivery: Not planned
- Decoy traffic: Not planned

These techniques add complexity and latency with diminishing returns for our threat model. Whisper focuses on content encryption and anonymous identities rather than traffic analysis resistance. This may change if user demand or threat landscape evolves.

**Security Contact:** If you discover vulnerabilities in Whisper's security model, please report them responsibly to security@sarjmobile.com.

### Key Lifecycle

**Key Generation:**
- Encryption: X25519 key pair (Curve25519)
- Signing: Ed25519 key pair (separate from encryption)
- Both derived deterministically from 12-word BIP39 seed phrase

**Key Storage:**
- Private keys stored in device secure enclave (iOS Keychain / Android Keystore)
- Public keys registered with server for message routing
- Seed phrase shown once at account creation for backup

**Device Change / Recovery:**
- Enter 12-word seed phrase on new device
- Same key pairs regenerated deterministically
- All contacts and message history remain on original device (not synced)

**Multi-Device:**
- Currently single-device only
- Same identity can only be active on one device at a time
- Logging in on new device disconnects previous device

**Key Rotation:**
- Not currently implemented
- Same key pair used for lifetime of account
- Future consideration: periodic rotation with key announcement protocol

### Group Key Management

**Current Implementation:**
- Groups use pairwise encryption (each message encrypted separately for each member)
- No shared group key or sender keys
- Server fans out encrypted copies to each group member

**Member Changes:**
- Adding member: New member can only see messages sent after joining
- Removing member: Removed member cannot decrypt future messages (no re-key needed due to pairwise encryption)
- No backward secrecy for removed members (they keep messages received before removal)

**Trade-offs:**
- Pairwise encryption is simpler and doesn't require complex key management
- Scales O(n) with group size for each message
- Suitable for small groups; large groups may experience latency

### Forward Secrecy

**Current State:** Whisper does **not** implement forward secrecy.

Each conversation uses the same long-term X25519 key pair. If a private key is compromised in the future, an attacker with stored ciphertext could decrypt past messages.

**Why This Trade-off:**
- Simplicity: No ratcheting protocol complexity
- Seed phrase recovery: Users can restore their identity with 12 words
- Stateless encryption: No session state to synchronize between devices

**Mitigations:**
- Disappearing messages: Auto-delete reduces window of exposure
- Device secure storage: Private keys protected by hardware security modules
- Future consideration: Double Ratchet protocol (like Signal) for enhanced security

### Cryptographic Primitives

| Purpose | Algorithm | Library |
|---------|-----------|---------|
| Key Exchange | X25519 (Curve25519) | TweetNaCl |
| Encryption | XSalsa20-Poly1305 | TweetNaCl (nacl.box) |
| Signing | Ed25519 | TweetNaCl (nacl.sign) |
| Key Derivation | BIP39 + PBKDF2 | bip39 library |
| Random Nonces | 24-byte random | TweetNaCl (nacl.randomBytes) |

## WebSocket Protocol

### Call Flow (Offline User)
1. Caller initiates call via `call_initiate`
2. Server checks if recipient is online
3. If offline:
   - Gets VoIP token (iOS) and push token
   - Sends VoIP push via APNs (iOS - native call UI)
   - Sends regular push via Expo (Android/iOS backup)
4. Push wakes device, app connects via WebSocket
5. WebRTC signaling continues

### Push Notification Channels (Android)
- `messages` - Regular messages (default importance)
- `calls` - Incoming calls (MAX importance, bypassDnd, lockscreen visible)

## Troubleshooting

### iOS: VoIP Push Not Working
1. Check APNs configuration in server `.env`:
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_KEY_PATH`
   - `APNS_BUNDLE_ID`
2. Ensure VoIP capability is enabled in Xcode
3. Check server logs: `pm2 logs whisper-server`

### Android: Call Notifications Missing
1. Ensure user has opened the app at least once (registers push token)
2. Check notification channel settings in device settings
3. Verify push token in server logs

### Headphone Button Not Responding
1. Ensure `react-native-incall-manager` is properly linked
2. Check for `MediaButton` events in logs
3. Some Bluetooth devices may have limited button support

## License

**Private - All rights reserved**

Whisper is proprietary software. The source code is not open source.

**Why not open source?**
- Security through obscurity is not our model—the cryptographic design is documented above
- Business model: We plan to offer enterprise features and hosted solutions
- Quality control: We maintain full responsibility for security audits and updates
- Future consideration: Core cryptographic libraries may be open-sourced for audit

For security researchers: If you discover vulnerabilities, please contact us responsibly at security@sarjmobile.com.

## Contact

- **Website**: [sarjmobile.com](https://sarjmobile.com)
- **Support**: support@sarjmobile.com
- **Security**: security@sarjmobile.com (for vulnerability reports)
