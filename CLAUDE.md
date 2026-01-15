# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whisper is a privacy-first, end-to-end encrypted messaging application. Users communicate via anonymous "Whisper IDs" (WSP-XXXX-XXXX-XXXX) without requiring phone numbers, emails, or any personal information.

## Repository Structure

```
whisper/
├── mobile/     # Expo React Native app (iOS/Android)
├── server/     # Node.js WebSocket backend
├── website/    # Next.js landing page (/, /privacy, /terms, /child-safety, /support)
├── PLAN.md     # Original project plan
└── CLAUDE.md   # This file - development guidance
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

**Client → Server Messages:**
- `register` - Initial registration with whisperId, publicKey, signingPublicKey, pushToken, voipToken, platform, prefs
- `register_proof` - Ed25519 signature response to challenge-response authentication
- `send_message` - Send encrypted message (supports text, images, voice, files, reactions, replies, forwarding)
- `delivery_receipt` - Notify delivery/read status
- `fetch_pending` - Request pending offline messages (paginated)
- `ping` - Heartbeat
- `report_user` - Report a user (inappropriate_content, harassment, spam, child_safety, other)
- `reaction` - Send message reaction (emoji or null to remove)
- `typing` - Typing indicator
- `block_user` / `unblock_user` - Block/unblock users
- `delete_account` - Account deletion with signature verification
- `call_initiate` / `call_answer` / `call_ice_candidate` / `call_end` - WebRTC call signaling
- `create_group` / `send_group_message` / `update_group` / `leave_group` - Group chat operations
- `lookup_public_key` - Find user's public key by Whisper ID (for message requests)
- `get_turn_credentials` - Request TURN server credentials for WebRTC

**Server → Client Messages:**
- `register_challenge` - 32-byte random challenge for authentication
- `register_ack` - Registration confirmation
- `message_received` - New incoming message
- `message_delivered` - Delivery confirmation (sent/delivered/pending)
- `delivery_status` - Read receipt notification
- `pending_messages` - Paginated pending messages
- `pong` - Heartbeat response
- `error` - Error notification
- `report_ack` - Report submission confirmation
- `reaction_received` - Incoming reaction notification
- `typing_status` - Typing indicator notification
- `block_ack` / `unblock_ack` - Block/unblock confirmation
- `account_deleted` - Account deletion confirmation
- `incoming_call` / `call_answered` / `call_ice_candidate` / `call_ended` - WebRTC signaling
- `group_created` / `group_message_received` / `group_updated` / `member_left_group` - Group notifications
- `public_key_response` - Public key lookup response
- `turn_credentials` - TURN server credentials

### Message Lifecycle
1. Sender encrypts with `nacl.box(message, nonce, recipientPublicKey, senderPrivateKey)`
2. Server routes to recipient if online, otherwise queues (72-hour TTL)
3. Recipient decrypts with `nacl.box.open(encrypted, nonce, senderPublicKey, recipientPrivateKey)`

## Key Files

### Mobile Core Services
- `mobile/src/crypto/CryptoService.ts` - Key generation, encryption/decryption, signing
- `mobile/src/services/MessagingService.ts` - WebSocket client, message routing, challenge-response auth
- `mobile/src/services/CallService.ts` - WebRTC voice/video call signaling
- `mobile/src/services/NotificationService.ts` - Push notification handling
- `mobile/src/services/CallKeepService.ts` - Native call UI integration (iOS CallKit, Android)
- `mobile/src/services/VoIPPushService.ts` - VoIP push notifications for incoming calls
- `mobile/src/storage/SecureStorage.ts` - Expo SecureStore wrapper for keys/contacts/messages
- `mobile/src/context/AuthContext.tsx` - User state management and auto-connection
- `mobile/src/context/ThemeContext.tsx` - Dark/light theme management
- `mobile/src/utils/helpers.ts` - Utility functions
- `mobile/src/utils/theme.ts` - Theme definitions
- `mobile/src/utils/responsive.ts` - Responsive layout utilities
- `mobile/src/utils/navigationRef.ts` - Navigation reference for deep linking

### Server Core
- `server/src/index.ts` - Express HTTP + WebSocket server entry point
- `server/src/websocket/WebSocketServer.ts` - WebSocket connection handling, message routing
- `server/src/websocket/ConnectionManager.ts` - Track online users, cleanup stale connections, Redis integration
- `server/src/services/MessageRouter.ts` - Route messages, forward delivery receipts
- `server/src/services/MessageQueue.ts` - Store offline messages with 72-hour expiration
- `server/src/services/GroupService.ts` - Group chat management
- `server/src/services/GroupStore.ts` - Group data persistence
- `server/src/services/AdminService.ts` - User banning and moderation
- `server/src/services/ReportService.ts` - User reporting system
- `server/src/services/RateLimiter.ts` - Request rate limiting
- `server/src/services/AuthService.ts` - Challenge-response authentication (Ed25519 signatures)
- `server/src/services/BlockService.ts` - User blocking functionality
- `server/src/services/PushService.ts` - Push notification delivery (Expo)
- `server/src/services/PushTokenStore.ts` - Push token persistence
- `server/src/services/PublicKeyStore.ts` - Public key storage for message requests
- `server/src/services/RedisService.ts` - Redis connection for high-performance presence management

### Navigation Structure (Mobile)
- **Auth Stack**: Welcome → CreateAccount → SeedPhrase → RecoverAccount
- **Main Tabs**: ChatsScreen, ContactsScreen, SettingsScreen
- **Chat Screens**: ChatScreen (1:1), GroupChatScreen, GroupInfoScreen, CreateGroupScreen, AddGroupMemberScreen
- **Call Screens**: CallScreen (voice), VideoCallScreen
- **Settings Screens**: ProfileScreen, MyQRScreen, SetupPinScreen, AppLockScreen
- **Utility Screens**: AddContactScreen, QRScannerScreen, ForwardMessageScreen
- **Legal Screens**: TermsScreen, PrivacyScreen, ChildSafetyScreen, AboutScreen

## Implemented Features

### Messaging
- Text messages with delivery receipts (sent/delivered/read)
- Image sharing with encrypted attachments
- Voice messages with duration tracking
- File sharing with metadata
- Message reactions (emoji)
- Reply to messages
- Message forwarding
- Typing indicators
- Disappearing messages (per-conversation setting)

### Calls
- Voice calls (WebRTC)
- Video calls (WebRTC)
- TURN server for NAT traversal
- Native call UI (iOS CallKit, Android)
- VoIP push notifications for incoming calls

### Groups
- Group creation (GRP-XXXX-XXXX-XXXX format)
- Add/remove members
- Group name editing
- Leave group
- Group message broadcasting

### Privacy & Security
- Challenge-response authentication (Ed25519 signatures)
- User blocking/unblocking
- User reporting (inappropriate_content, harassment, spam, child_safety, other)
- Account deletion with cryptographic verification
- Message requests from unknown senders (shows public key)
- Privacy preferences (read receipts, typing indicators, online status)

### Push Notifications
- Expo push notifications
- VoIP push for incoming calls
- Platform-specific token handling (iOS/Android)

## Type Definitions

Core types in `mobile/src/types/index.ts`:
- `LocalUser` - User identity with encryption keys (X25519) and signing keys (Ed25519)
- `Contact` - Contact with whisperId, publicKey, isBlocked, isMessageRequest flags
- `Message` - Decrypted message with status, supports text/image/voice/file attachments, reactions, replies, forwarding, expiration
- `EncryptedMessage` - Wire format with encryptedContent, nonce, and optional encrypted attachments
- `Group` / `GroupConversation` - Group chat types (GRP-XXXX-XXXX-XXXX format)
- `CallSession` - WebRTC call state management (voice/video, mute, speaker, camera)
- `Conversation` - Conversation metadata with disappearAfter setting
- `PrivacyPrefs` - Privacy settings (sendReadReceipts, sendTypingIndicator, hideOnlineStatus)

## Server Admin API

Authenticated endpoints (requires `X-Admin-API-Key` header):
- `GET /admin/reports` - Get pending user reports with stats
- `GET /admin/reports/user/:whisperId` - Get reports for a specific user
- `POST /admin/reports/:reportId/review` - Review a report (status: reviewed/action_taken/dismissed)
- `POST /admin/ban` - Ban a user (requires whisperId, reason, optional relatedReportIds, notes)
- `POST /admin/unban` - Unban a user
- `GET /admin/bans` - List all banned users with stats
- `GET /admin/bans/:whisperId` - Check if specific user is banned with details
- `GET /admin/super-admin` - Get super admin information
- `POST /admin/export/law-enforcement` - Export data for legal requests

Public endpoints:
- `GET /health` - Health check with uptime
- `GET /stats` - Server statistics including Redis status
- `GET /turn-credentials` - Get time-limited TURN credentials for WebRTC

## WebRTC / TURN Server

Voice and video calls use WebRTC with COTURN for NAT traversal.

### TURN Server Configuration
- **Domain**: turn.sarjmobile.com
- **STUN/TURN Port**: 3479 (TCP/UDP)
- **TURNS Port**: 5350 (TLS)
- **Config File**: `/etc/turnserver-whisper.conf`
- **Service**: `coturn-whisper.service`
- **Auth**: Time-limited credentials using HMAC-SHA1
- **Secret**: Set in `/home/whisper/whisper/server/.env` as `TURN_SECRET`

### TURN Server Management
```bash
# Check status
systemctl status coturn-whisper

# Restart TURN server
systemctl restart coturn-whisper

# View logs
tail -f /var/log/turnserver/turnserver-whisper.log

# Test TURN server
# Use https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Call Flow
1. Client requests TURN credentials via WebSocket (`get_turn_credentials`)
2. Server generates time-limited credentials using HMAC-SHA1
3. Client uses credentials with ICE servers for peer connection
4. WebRTC signaling (offer/answer/ICE candidates) routed via WebSocket

## Deployment

- **Server IP**: 142.93.136.228 (sarjmobile.com)
- **SSL**: Nginx reverse proxy with Let's Encrypt
- **Process Manager**: PM2

### Server Paths on Production
- **Server (WebSocket)**: `/home/whisper/whisper/server` (port 3031)
- **Website**: `/home/whisper/sarjmobile` (port 3021)

### Deployment Commands
```bash
# Server deployment
ssh root@142.93.136.228
cd /home/whisper/whisper/server
git pull
npm install
npm run build
pm2 restart whisper-server

# Website deployment
cd /home/whisper/sarjmobile
git pull
npm install
npm run build
pm2 restart sarjmobile  # or restart by finding process on port 3021
```

## Build Version Management

**IMPORTANT**: Always increment build numbers when making changes to the mobile app.

- **iOS**: `buildNumber` in `mobile/app.json` under `expo.ios`
- **Android**: `versionCode` in `mobile/app.json` under `expo.android`

Both should be incremented together (+1) whenever:
- UI changes are made
- Bug fixes are applied
- New features are added
- Any code changes that require a new build

Current format in `mobile/app.json`:
```json
"ios": {
  "buildNumber": "9"
},
"android": {
  "versionCode": 9
}
```

## Security Model

The server has zero knowledge of message content:
- Only encrypted blobs pass through the server
- Private keys exist only on user devices
- No user PII collected or stored
- Contact lists and chat history stored locally only
- Separate signing keys (Ed25519) authenticate message senders
- Challenge-response authentication prevents replay attacks
- Account deletion requires cryptographic signature verification
- Push tokens stored in Redis with TTL for presence management
