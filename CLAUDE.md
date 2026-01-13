# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whisper is a privacy-first, end-to-end encrypted messaging application. Users communicate via anonymous "Whisper IDs" (WSP-XXXX-XXXX-XXXX) without requiring phone numbers, emails, or any personal information.

## Repository Structure

```
whisper/
├── mobile/     # Expo React Native app (iOS/Android)
├── server/     # Node.js WebSocket backend
├── website/    # Next.js landing page
└── PLAN.md     # Comprehensive project documentation
```

## Development Commands

### Mobile (Expo)
```bash
cd mobile
npm start              # Expo dev server
npm run android        # Run on Android emulator/device
npm run ios            # Run on iOS simulator/device
eas build --platform android   # Production Android build
eas build --platform ios       # Production iOS build
```

### Server (Node.js)
```bash
cd server
npm run dev            # Development with hot reload (ts-node-dev)
npm run build          # Compile TypeScript to dist/
npm start              # Run production server
```

### Website (Next.js)
```bash
cd website
npm run dev            # Development server (port 3000)
npm run build          # Production build
npm start              # Production server
```

## Architecture

### Three-Component System
1. **Mobile App** - Expo/React Native with local encryption and secure storage
2. **Server** - WebSocket relay for message routing (cannot read message content)
3. **Website** - Marketing landing page with privacy/terms pages

### End-to-End Encryption Flow
- **Encryption**: X25519 key exchange + XSalsa20-Poly1305 authenticated encryption (TweetNaCl)
- **Signing**: Ed25519 keys for message authentication (separate from encryption keys)
- **Key Storage**: Private keys never leave the device (expo-secure-store)
- **Recovery**: 12-word BIP39 seed phrase derives deterministic key pairs
- Messages are encrypted client-side before transmission; server only routes opaque ciphertext

### WebSocket Protocol (Port 3031)
Client → Server: `register`, `send_message`, `delivery_receipt`, `fetch_pending`, `ping`
Server → Client: `register_ack`, `message_received`, `message_delivered`, `pending_messages`, `pong`, `error`

### Message Lifecycle
1. Sender encrypts with `nacl.box(message, nonce, recipientPublicKey, senderPrivateKey)`
2. Server routes to recipient if online, otherwise queues (72-hour TTL)
3. Recipient decrypts with `nacl.box.open(encrypted, nonce, senderPublicKey, recipientPrivateKey)`

## Key Files

### Mobile Core Services
- `mobile/src/crypto/CryptoService.ts` - Key generation, encryption/decryption
- `mobile/src/services/MessagingService.ts` - WebSocket client, message routing
- `mobile/src/services/CallService.ts` - WebRTC voice/video call signaling
- `mobile/src/services/NotificationService.ts` - Push notification handling
- `mobile/src/storage/SecureStorage.ts` - Expo SecureStore wrapper for keys/contacts/messages
- `mobile/src/context/AuthContext.tsx` - User state management and auto-connection
- `mobile/src/context/ThemeContext.tsx` - Dark/light theme management

### Server Core
- `server/src/index.ts` - Express HTTP + WebSocket server entry point
- `server/src/websocket/WebSocketServer.ts` - WebSocket connection handling
- `server/src/websocket/ConnectionManager.ts` - Track online users, cleanup stale connections
- `server/src/services/MessageRouter.ts` - Route messages, forward delivery receipts
- `server/src/services/MessageQueue.ts` - Store offline messages with 72-hour expiration
- `server/src/services/GroupService.ts` - Group chat management
- `server/src/services/AdminService.ts` - User banning and moderation
- `server/src/services/ReportService.ts` - User reporting system
- `server/src/services/RateLimiter.ts` - Request rate limiting

### Navigation Structure (Mobile)
- **Auth Stack**: Welcome → CreateAccount → SeedPhrase → RecoverAccount
- **Main Tabs**: ChatsScreen, ContactsScreen, SettingsScreen
- **Chat Screens**: ChatScreen (1:1), GroupChatScreen, GroupInfoScreen, CreateGroupScreen, AddGroupMemberScreen
- **Call Screens**: CallScreen (voice), VideoCallScreen
- **Settings Screens**: ProfileScreen, MyQRScreen, SetupPinScreen, AppLockScreen
- **Utility Screens**: AddContactScreen, QRScannerScreen, ForwardMessageScreen
- **Legal Screens**: TermsScreen, PrivacyScreen, ChildSafetyScreen, AboutScreen

## Type Definitions

Core types in `mobile/src/types/index.ts`:
- `LocalUser` - User identity with encryption keys (X25519) and signing keys (Ed25519)
- `Contact` - Contact with whisperId and publicKey
- `Message` - Decrypted message with status, supports text/image/voice/file attachments, reactions, replies
- `EncryptedMessage` - Wire format with encryptedContent, nonce, and optional encrypted attachments
- `Group` / `GroupConversation` - Group chat types (GRP-XXXX-XXXX-XXXX format)
- `CallSession` - WebRTC call state management

## Server Admin API

Authenticated endpoints (requires `X-Admin-API-Key` header):
- `GET /admin/reports` - Get pending user reports
- `POST /admin/reports/:reportId/review` - Review a report
- `POST /admin/ban` - Ban a user
- `POST /admin/unban` - Unban a user
- `GET /admin/bans` - List all banned users
- `POST /admin/export/law-enforcement` - Export data for legal requests

Public endpoints:
- `GET /health` - Health check
- `GET /stats` - Server statistics

## Deployment

- **Server IP**: 142.93.136.228 (sarjmobile.com)
- **Port**: 3031 (HTTP + WebSocket on same port)
- **SSL**: Nginx reverse proxy with Let's Encrypt
- **Process Manager**: PM2

## Security Model

The server has zero knowledge of message content:
- Only encrypted blobs pass through the server
- Private keys exist only on user devices
- No user PII collected or stored
- Contact lists and chat history stored locally only
- Separate signing keys (Ed25519) authenticate message senders
