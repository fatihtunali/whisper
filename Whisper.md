# Whisper - Privacy-First Encrypted Messaging Platform

## Executive Summary

Whisper is a complete privacy-first, end-to-end encrypted messaging application that enables secure communication without requiring any personal information. Users communicate via anonymous "Whisper IDs" (WSP-XXXX-XXXX-XXXX) without phone numbers, emails, or any identifiable data.

**Current Version:** v15 (Build 15)
**Status:** Production Ready
**Last Updated:** January 15, 2026

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture](#architecture)
3. [Security & Encryption](#security--encryption)
4. [Mobile Application](#mobile-application)
5. [Server Infrastructure](#server-infrastructure)
6. [WebRTC & Voice/Video Calls](#webrtc--voicevideo-calls)
7. [Push Notifications](#push-notifications)
8. [Features](#features)
9. [Development History](#development-history)
10. [Deployment](#deployment)
11. [API Reference](#api-reference)
12. [Build & Release](#build--release)

---

## Platform Overview

### Three-Component System

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Mobile App** | Expo / React Native | iOS & Android client application |
| **Server** | Node.js / TypeScript | WebSocket relay, message routing, signaling |
| **Website** | Next.js | Marketing landing page (sarjmobile.com) |

### Repository Structure

```
whisper/
├── mobile/                 # Expo React Native app
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React contexts (Auth, Theme)
│   │   ├── crypto/         # Encryption services
│   │   ├── navigation/     # React Navigation setup
│   │   ├── screens/        # All app screens
│   │   ├── services/       # Core services
│   │   ├── storage/        # Secure storage
│   │   └── types/          # TypeScript definitions
│   ├── assets/             # Images, icons, splash screens
│   └── app.json            # Expo configuration
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── services/       # Business logic
│   │   ├── websocket/      # WebSocket handling
│   │   └── index.ts        # Entry point
│   └── .env                # Environment configuration
├── website/                # Next.js landing page
├── CLAUDE.md               # AI assistant instructions
├── PLAN.md                 # Project documentation
└── Whisper.md              # This file
```

---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           MOBILE CLIENTS                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │   iOS App   │    │ Android App │    │   iOS App   │              │
│  │  (User A)   │    │  (User B)   │    │  (User C)   │              │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘              │
│         │                  │                  │                      │
│         │    E2E Encrypted │ Messages         │                      │
│         │    WebRTC P2P    │ Calls            │                      │
└─────────┼──────────────────┼──────────────────┼─────────────────────┘
          │                  │                  │
          │ WSS (TLS)        │ WSS (TLS)        │ WSS (TLS)
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────────────┐
│                        WHISPER SERVER                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    WebSocket Server (3031)                   │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │    │
│  │  │ Connection  │  │  Message    │  │   Call      │          │    │
│  │  │  Manager    │  │   Router    │  │  Signaling  │          │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Redis     │  │   Message   │  │    Rate     │                  │
│  │  (Presence) │  │   Queue     │  │   Limiter   │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Group     │  │   Report    │  │   Admin     │                  │
│  │  Service    │  │   Service   │  │   Service   │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
          │
          │ TURN/STUN
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        TURN SERVER (COTURN)                         │
│                     turn.sarjmobile.com:3479                        │
│                  TURNS: turn.sarjmobile.com:5350                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                    MESSAGE ENCRYPTION FLOW                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Sender Device                    Server                Recipient   │
│  ┌──────────────┐                                     ┌──────────┐ │
│  │ Plain Text   │                                     │ Plain    │ │
│  │ "Hello!"     │                                     │ Text     │ │
│  └──────┬───────┘                                     └────▲─────┘ │
│         │                                                  │       │
│         ▼                                                  │       │
│  ┌──────────────┐                                     ┌────┴─────┐ │
│  │ Encrypt with │                                     │ Decrypt  │ │
│  │ nacl.box()   │                                     │ nacl.box │ │
│  │              │                                     │ .open()  │ │
│  │ - Recipient  │                                     │          │ │
│  │   Public Key │                                     │ - Sender │ │
│  │ - Sender     │                                     │   Public │ │
│  │   Private Key│                                     │   Key    │ │
│  │ - Nonce      │                                     │ - Recip  │ │
│  └──────┬───────┘                                     │   Private│ │
│         │                                             │   Key    │ │
│         ▼                                             │ - Nonce  │ │
│  ┌──────────────┐    ┌──────────────┐               └────▲─────┘ │
│  │ Encrypted    │───▶│   RELAY      │───────────────────┘       │
│  │ Blob + Nonce │    │   ONLY       │    Encrypted Blob          │
│  └──────────────┘    │ (Zero Know-  │                            │
│                      │  ledge)      │                            │
│                      └──────────────┘                            │
│                                                                   │
│  Server CANNOT read message content - only routes encrypted blobs │
└───────────────────────────────────────────────────────────────────┘
```

---

## Security & Encryption

### Cryptographic Primitives

| Purpose | Algorithm | Library |
|---------|-----------|---------|
| Key Exchange | X25519 (Curve25519) | TweetNaCl |
| Symmetric Encryption | XSalsa20-Poly1305 | TweetNaCl |
| Message Signing | Ed25519 | TweetNaCl |
| Key Derivation | BIP39 Mnemonic | bip39 |

### Key Generation

```typescript
// Encryption keys (X25519)
const encryptionKeyPair = nacl.box.keyPair();
// publicKey: 32 bytes - shared with contacts
// secretKey: 32 bytes - NEVER leaves device

// Signing keys (Ed25519)
const signingKeyPair = nacl.sign.keyPair();
// publicKey: 32 bytes - for message authentication
// secretKey: 64 bytes - NEVER leaves device
```

### Recovery System

- **12-word BIP39 seed phrase** generates deterministic keys
- Same seed phrase = same keys on any device
- User must securely store seed phrase (only shown once)

### Zero-Knowledge Server

The server has **zero knowledge** of message content:

1. Only encrypted blobs pass through
2. Private keys exist only on user devices
3. No PII collected or stored
4. Contact lists stored locally only
5. Chat history stored locally only

---

## Mobile Application

### Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Expo SDK 53 |
| Language | TypeScript |
| Navigation | React Navigation 7 |
| State Management | React Context |
| Storage | expo-secure-store |
| Crypto | tweetnacl, bip39 |
| WebRTC | react-native-webrtc |
| UI | React Native + Custom Components |

### Screen Architecture

```
Navigation Structure:
├── Auth Stack (Unauthenticated)
│   ├── WelcomeScreen
│   ├── CreateAccountScreen
│   ├── SeedPhraseScreen
│   └── RecoverAccountScreen
│
├── Main Tabs (Authenticated)
│   ├── Chats Tab
│   │   ├── ChatsScreen (list)
│   │   ├── ChatScreen (1:1 conversation)
│   │   ├── GroupChatScreen
│   │   └── ForwardMessageScreen
│   │
│   ├── Contacts Tab
│   │   ├── ContactsScreen (list)
│   │   ├── AddContactScreen
│   │   └── QRScannerScreen
│   │
│   └── Settings Tab
│       ├── SettingsScreen
│       ├── ProfileScreen
│       ├── MyQRScreen
│       ├── SetupPinScreen
│       ├── AppLockScreen
│       ├── TermsScreen
│       ├── PrivacyScreen
│       ├── ChildSafetyScreen
│       └── AboutScreen
│
├── Group Screens
│   ├── CreateGroupScreen
│   ├── GroupInfoScreen
│   └── AddGroupMemberScreen
│
└── Call Screens
    ├── CallScreen (voice)
    └── VideoCallScreen
```

### Core Services

#### CryptoService (`mobile/src/crypto/CryptoService.ts`)

```typescript
class CryptoService {
  // Generate new identity
  async generateKeyPair(): Promise<LocalUser>

  // Encrypt message for recipient
  async encryptMessage(
    message: string,
    recipientPublicKey: string,
    senderPrivateKey: string
  ): Promise<{ encrypted: string; nonce: string }>

  // Decrypt received message
  async decryptMessage(
    encryptedMessage: string,
    nonce: string,
    senderPublicKey: string,
    recipientPrivateKey: string
  ): Promise<string>

  // Generate from seed phrase (recovery)
  async generateFromSeedPhrase(mnemonic: string): Promise<LocalUser>

  // Sign message for authentication
  signMessage(message: string, signingPrivateKey: string): string

  // Verify message signature
  verifySignature(message: string, signature: string, signingPublicKey: string): boolean
}
```

#### MessagingService (`mobile/src/services/MessagingService.ts`)

```typescript
class MessagingService {
  // Connection management
  connect(user: LocalUser): void
  disconnect(): void
  isConnected(): boolean

  // Messaging
  sendMessage(recipientId: string, content: string, type: MessageType): Promise<void>
  sendGroupMessage(groupId: string, content: string, type: MessageType): Promise<void>

  // Media
  sendImage(recipientId: string, imageUri: string): Promise<void>
  sendVoiceMessage(recipientId: string, audioUri: string): Promise<void>
  sendFile(recipientId: string, fileUri: string): Promise<void>

  // Callbacks
  onMessage: (message: Message) => void
  onDeliveryReceipt: (messageId: string, status: string) => void
  onPresenceUpdate: (whisperId: string, online: boolean) => void
}
```

#### CallService (`mobile/src/services/CallService.ts`)

```typescript
class CallService {
  // Outgoing calls
  initiateCall(recipientId: string, isVideo: boolean): Promise<void>

  // Incoming calls
  acceptCall(callId: string): Promise<void>
  rejectCall(callId: string): void

  // Call control
  endCall(): void
  toggleMute(): void
  toggleSpeaker(): void
  toggleVideo(): void
  switchCamera(): void

  // State
  getCurrentSession(): CallSession | null
  onStateChange: (state: CallState) => void
  onRemoteStream: (stream: MediaStream) => void
}
```

#### SecureStorage (`mobile/src/storage/SecureStorage.ts`)

```typescript
class SecureStorage {
  // User identity
  saveUser(user: LocalUser): Promise<void>
  getUser(): Promise<LocalUser | null>
  clearUser(): Promise<void>

  // Contacts
  saveContacts(contacts: Contact[]): Promise<void>
  getContacts(): Promise<Contact[]>

  // Messages
  saveMessages(conversationId: string, messages: Message[]): Promise<void>
  getMessages(conversationId: string): Promise<Message[]>

  // Groups
  saveGroups(groups: Group[]): Promise<void>
  getGroups(): Promise<Group[]>

  // App lock
  saveAppLockSettings(settings: AppLockSettings): Promise<void>
  getAppLockSettings(): Promise<AppLockSettings>
}
```

### App Configuration (`mobile/app.json`)

```json
{
  "expo": {
    "name": "Whisper",
    "slug": "whisper",
    "version": "1.0.0",
    "newArchEnabled": false,
    "ios": {
      "bundleIdentifier": "com.sarjmobile.whisper",
      "buildNumber": "15",
      "infoPlist": {
        "UIBackgroundModes": ["voip", "fetch", "remote-notification"],
        "NSCameraUsageDescription": "...",
        "NSMicrophoneUsageDescription": "...",
        "NSPhotoLibraryUsageDescription": "..."
      }
    },
    "android": {
      "package": "com.sarjmobile.whisper",
      "versionCode": 15,
      "permissions": [
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
        "android.permission.READ_PHONE_STATE",
        "android.permission.VIBRATE",
        "android.permission.WAKE_LOCK"
      ]
    },
    "plugins": ["expo-audio", "expo-video", "expo-notifications"]
  }
}
```

---

## Server Infrastructure

### Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 18+ |
| Language | TypeScript |
| HTTP Server | Express |
| WebSocket | ws (native) |
| Cache/Presence | Redis |
| Process Manager | PM2 |
| Reverse Proxy | Nginx |
| SSL | Let's Encrypt |

### WebSocket Protocol

#### Client → Server Messages

| Type | Purpose | Payload |
|------|---------|---------|
| `register` | Register/authenticate | `{ whisperId, publicKey, signature, pushToken?, voipToken?, platform }` |
| `send_message` | Send encrypted message | `{ to, encryptedContent, nonce, type, ... }` |
| `delivery_receipt` | Confirm message received | `{ messageId, status }` |
| `fetch_pending` | Get offline messages | `{}` |
| `ping` | Keep connection alive | `{}` |
| `call_initiate` | Start a call | `{ callId, targetWhisperId, isVideo, offer }` |
| `call_answer` | Answer a call | `{ callId, sdp }` |
| `call_ice_candidate` | ICE candidate | `{ callId, candidate }` |
| `call_end` | End a call | `{ callId }` |
| `get_turn_credentials` | Get TURN server credentials | `{}` |

#### Server → Client Messages

| Type | Purpose | Payload |
|------|---------|---------|
| `register_ack` | Registration confirmed | `{ success, whisperId }` |
| `message_received` | New message arrived | `{ from, encryptedContent, nonce, ... }` |
| `message_delivered` | Delivery confirmation | `{ messageId, status }` |
| `pending_messages` | Offline messages | `{ messages: [...] }` |
| `pong` | Ping response | `{}` |
| `call_incoming` | Incoming call | `{ callId, fromWhisperId, isVideo, offer }` |
| `call_ringing` | Call is ringing | `{ callId }` |
| `call_answer` | Call answered | `{ callId, sdp }` |
| `call_ice_candidate` | ICE candidate | `{ callId, candidate }` |
| `call_end` | Call ended | `{ callId, reason }` |
| `turn_credentials` | TURN credentials | `{ urls, username, credential, ttl }` |
| `error` | Error occurred | `{ message, code }` |

### Server Services

#### ConnectionManager

- Tracks all active WebSocket connections
- Maps Whisper IDs to connection objects
- Handles connection cleanup on disconnect
- Provides presence information

#### MessageRouter

- Routes messages between connected users
- Queues messages for offline users (72-hour TTL)
- Forwards delivery receipts
- Handles group message distribution

#### MessageQueue (Redis)

- Stores messages for offline users
- 72-hour automatic expiration
- Efficient retrieval on reconnect

#### GroupService

- Group creation and management
- Member addition/removal
- Group metadata storage

#### RateLimiter

- Prevents spam and abuse
- Configurable limits per action type
- IP and user-based limiting

### Admin API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/stats` | GET | Server statistics |
| `/turn-credentials` | GET | Public TURN credentials |
| `/admin/reports` | GET | Get pending reports |
| `/admin/reports/:id/review` | POST | Review a report |
| `/admin/ban` | POST | Ban a user |
| `/admin/unban` | POST | Unban a user |
| `/admin/bans` | GET | List banned users |
| `/admin/export/law-enforcement` | POST | Legal data export |

---

## WebRTC & Voice/Video Calls

### TURN Server Configuration

| Setting | Value |
|---------|-------|
| Domain | turn.sarjmobile.com |
| STUN/TURN Port | 3479 (TCP/UDP) |
| TURNS Port | 5350 (TLS) |
| Config File | `/etc/turnserver-whisper.conf` |
| Service | `coturn-whisper.service` |
| Auth Method | HMAC-SHA1 time-limited credentials |

### Call Flow Sequence

```
┌─────────┐          ┌─────────┐          ┌─────────┐
│ Caller  │          │ Server  │          │ Callee  │
└────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │
     │ call_initiate      │                    │
     │ (offer SDP)        │                    │
     │───────────────────>│                    │
     │                    │                    │
     │                    │ call_incoming      │
     │                    │ (offer SDP)        │
     │                    │───────────────────>│
     │                    │                    │
     │                    │ call_ringing       │
     │                    │<───────────────────│
     │                    │                    │
     │ call_ringing       │                    │
     │<───────────────────│                    │
     │                    │                    │
     │                    │ call_answer        │
     │                    │ (answer SDP)       │
     │                    │<───────────────────│
     │                    │                    │
     │ call_answer        │                    │
     │ (answer SDP)       │                    │
     │<───────────────────│                    │
     │                    │                    │
     │◄═══════════════════╪═══════════════════►│
     │     WebRTC P2P Media (via TURN)         │
     │◄═══════════════════╪═══════════════════►│
     │                    │                    │
```

### ICE Configuration

```typescript
const iceServers = [
  // STUN
  { urls: 'stun:turn.sarjmobile.com:3479' },
  // TURN UDP
  {
    urls: 'turn:turn.sarjmobile.com:3479?transport=udp',
    username: '<time-limited>',
    credential: '<hmac-sha1>'
  },
  // TURN TCP
  {
    urls: 'turn:turn.sarjmobile.com:3479?transport=tcp',
    username: '<time-limited>',
    credential: '<hmac-sha1>'
  },
  // TURNS (TLS)
  {
    urls: 'turns:turn.sarjmobile.com:5350?transport=tcp',
    username: '<time-limited>',
    credential: '<hmac-sha1>'
  }
];
```

---

## Push Notifications

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PUSH NOTIFICATION FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │   Sender    │────▶│   Whisper   │────▶│    Expo     │           │
│  │   Device    │     │   Server    │     │   Push      │           │
│  └─────────────┘     └──────┬──────┘     └──────┬──────┘           │
│                             │                   │                   │
│                             │ APNs VoIP         │ Expo Push        │
│                             │ (for calls)       │ (for messages)   │
│                             ▼                   ▼                   │
│                      ┌─────────────┐     ┌─────────────┐           │
│                      │   Apple     │     │   Apple/    │           │
│                      │   APNs      │     │   Google    │           │
│                      │   VoIP      │     │   FCM/APNs  │           │
│                      └──────┬──────┘     └──────┬──────┘           │
│                             │                   │                   │
│                             ▼                   ▼                   │
│                      ┌─────────────────────────────────┐           │
│                      │        Recipient Device         │           │
│                      │  - VoIP: Native call UI         │           │
│                      │  - Expo: Notification banner    │           │
│                      └─────────────────────────────────┘           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Token Types

| Token Type | Platform | Purpose | Service |
|------------|----------|---------|---------|
| Expo Push Token | iOS/Android | Messages, general notifications | Expo Push |
| VoIP Push Token | iOS only | Incoming calls (wakes app) | APNs VoIP |

### APNs Configuration

```env
# Server .env
APNS_KEY_ID=9LC9DYS99S
APNS_TEAM_ID=KX5N2U5RA2
APNS_KEY_PATH=/home/whisper/whisper/server/AuthKey_9LC9DYS99S.p8
APNS_BUNDLE_ID=com.sarjmobile.whisper
APNS_PRODUCTION=true
```

### Notification Services

#### NotificationService (`mobile/src/services/NotificationService.ts`)

- Handles Expo push token registration
- Sets up notification channels (Android)
- Manages notification listeners
- Coordinates with CallKeep for native call UI

#### VoIPPushService (`mobile/src/services/VoIPPushService.ts`)

- iOS-only VoIP push registration
- Handles incoming VoIP pushes
- Integrates with CallKeep for native call screen

#### CallKeepService (`mobile/src/services/CallKeepService.ts`)

- Native call UI integration (iOS CallKit, Android ConnectionService)
- Displays incoming call screen even when app is closed
- Handles call actions (answer, reject, mute)

---

## Features

### Messaging Features

| Feature | Status | Description |
|---------|--------|-------------|
| Text Messages | ✅ | End-to-end encrypted text |
| Image Messages | ✅ | Encrypted image sharing |
| Voice Messages | ✅ | Encrypted audio recording |
| File Sharing | ✅ | Encrypted file transfer |
| Message Reactions | ✅ | Emoji reactions to messages |
| Reply to Message | ✅ | Threaded replies |
| Message Forwarding | ✅ | Forward to other contacts |
| Read Receipts | ✅ | Delivery & read status |
| Typing Indicators | ✅ | Real-time typing status |

### Group Features

| Feature | Status | Description |
|---------|--------|-------------|
| Group Creation | ✅ | Create groups with multiple members |
| Group Messaging | ✅ | Encrypted group messages |
| Add/Remove Members | ✅ | Admin controls |
| Group Info | ✅ | View group details |
| Leave Group | ✅ | Leave group functionality |

### Call Features

| Feature | Status | Description |
|---------|--------|-------------|
| Voice Calls | ✅ | 1:1 encrypted voice calls |
| Video Calls | ✅ | 1:1 encrypted video calls |
| Call Mute | ✅ | Toggle microphone |
| Speaker Toggle | ✅ | Switch audio output |
| Camera Toggle | ✅ | Enable/disable video |
| Camera Switch | ✅ | Front/back camera |
| Native Call UI | ✅ | iOS CallKit integration |
| Background Calls | ✅ | Answer calls when app backgrounded |

### Security Features

| Feature | Status | Description |
|---------|--------|-------------|
| E2E Encryption | ✅ | All messages encrypted |
| Zero-Knowledge Server | ✅ | Server cannot read content |
| Anonymous IDs | ✅ | No PII required |
| Seed Phrase Recovery | ✅ | 12-word backup |
| App Lock | ✅ | PIN/biometric lock |
| Message Signing | ✅ | Ed25519 authentication |

### Contact Features

| Feature | Status | Description |
|---------|--------|-------------|
| Add by Whisper ID | ✅ | Manual ID entry |
| QR Code Scanning | ✅ | Scan contact QR |
| Share My QR | ✅ | Display own QR code |
| Contact List | ✅ | Local contact storage |
| Online Status | ✅ | Real-time presence |

---

## Development History

### Version Timeline

| Version | Build | Date | Key Changes |
|---------|-------|------|-------------|
| v1-v7 | 1-7 | Dec 2025 | Initial development, core features |
| v8 | 8 | Jan 2026 | Call screen button fixes, Ionicons |
| v9 | 9 | Jan 2026 | Bug fixes plan created |
| v10 | 10 | Jan 2026 | Attempted newArchEnabled (caused crashes) |
| v11 | 11 | Jan 2026 | FileSystem encoding fixes |
| v12 | 12 | Jan 2026 | Background notification handler |
| v13 | 13 | Jan 2026 | Call ringing status, TypeScript fixes |
| v14 | 14 | Jan 2026 | Push token registration fix |
| v15 | 15 | Jan 2026 | iOS crash fix, call race condition fix |

### Major Bug Fixes (v15)

1. **iOS Crash (since v10)**
   - **Cause**: `newArchEnabled: true` incompatible with native modules
   - **Fix**: Disabled newArchEnabled, added defensive module checks

2. **Calls Disconnecting Immediately**
   - **Cause**: Session cleanup race condition, handler override
   - **Fix**: Store session before cleanup, removed local handler override

3. **Push Token Not Registering**
   - **Cause**: Platform set AFTER WebSocket connect
   - **Fix**: Set platform BEFORE calling connect()

4. **Call Ringing Tone Not Stopping**
   - **Cause**: InCallManager ringback not stopped on answer
   - **Fix**: Added `stopRingbackAndConfigureActiveCall()` method

5. **Image/Audio Messages Failing**
   - **Cause**: Invalid `FileSystem.EncodingType.Base64`
   - **Fix**: Changed to string literal `'base64'`

---

## Deployment

### Production Infrastructure

| Component | Location | Port |
|-----------|----------|------|
| Server IP | 142.93.136.228 | - |
| Domain | sarjmobile.com | 443 (HTTPS) |
| WebSocket | wss://sarjmobile.com | 3031 |
| TURN Server | turn.sarjmobile.com | 3479, 5350 |
| Website | sarjmobile.com | 3021 |

### Server Paths

```
/home/whisper/
├── whisper/
│   └── server/           # WebSocket server (port 3031)
│       ├── src/
│       ├── dist/         # Compiled JS
│       ├── .env          # Environment config
│       └── AuthKey_*.p8  # APNs key
└── sarjmobile/           # Website (port 3021)
```

### Deployment Commands

```bash
# Server deployment
ssh root@142.93.136.228
cd /home/whisper/whisper/server
git pull
npm install
npm run build
pm2 restart whisper-server

# View server logs
pm2 logs whisper-server

# TURN server management
systemctl status coturn-whisper
systemctl restart coturn-whisper
tail -f /var/log/turnserver/turnserver-whisper.log
```

### Environment Variables

```env
# Server (.env)
PORT=3031
NODE_ENV=production
REDIS_URL=redis://localhost:6379
TURN_SECRET=<secret>
ADMIN_API_KEY=<key>

# APNs (iOS VoIP Push)
APNS_KEY_ID=9LC9DYS99S
APNS_TEAM_ID=KX5N2U5RA2
APNS_KEY_PATH=/home/whisper/whisper/server/AuthKey_9LC9DYS99S.p8
APNS_BUNDLE_ID=com.sarjmobile.whisper
APNS_PRODUCTION=true
```

---

## API Reference

### Message Types

```typescript
type MessageType =
  | 'text'      // Plain text message
  | 'image'     // Image attachment
  | 'voice'     // Voice recording
  | 'file'      // File attachment
  | 'system';   // System message

type MessageStatus =
  | 'sending'   // Being sent
  | 'sent'      // Delivered to server
  | 'delivered' // Delivered to recipient
  | 'read'      // Read by recipient
  | 'failed';   // Send failed
```

### Core Types

```typescript
interface LocalUser {
  whisperId: string;              // WSP-XXXX-XXXX-XXXX
  publicKey: string;              // X25519 public (base64)
  privateKey: string;             // X25519 private (base64)
  signingPublicKey: string;       // Ed25519 public (base64)
  signingPrivateKey: string;      // Ed25519 private (base64)
  displayName?: string;
  avatarUri?: string;
  createdAt: number;
}

interface Contact {
  whisperId: string;
  publicKey: string;
  signingPublicKey?: string;
  displayName?: string;
  avatarUri?: string;
  addedAt: number;
  lastSeen?: number;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  timestamp: number;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  attachmentUri?: string;
}

interface CallSession {
  callId: string;
  peerId: string;
  peerName: string;
  isVideo: boolean;
  isIncoming: boolean;
  state: CallState;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled: boolean;
  startTime?: number;
}
```

---

## Build & Release

### Build Commands

```bash
# Development
cd mobile
npm start                    # Expo dev server
npm run ios                  # iOS simulator
npm run android              # Android emulator

# Production builds
eas build --platform ios     # iOS IPA
eas build --platform android # Android AAB
eas build --platform all     # Both platforms

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### Build Configuration (`eas.json`)

```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "production": {
      "distribution": "store",
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "...",
        "ascAppId": "..."
      }
    }
  }
}
```

### Version Management

Always increment both when making changes:
- `ios.buildNumber` in app.json
- `android.versionCode` in app.json

---

## Current Build Status

**v15 Build** (January 15, 2026)

- **Android**: https://expo.dev/accounts/fatihtunali/projects/whisper/builds/fc2e5aa4-aba8-41ae-a801-2addb90b09b1
- **iOS**: https://expo.dev/accounts/fatihtunali/projects/whisper/builds/77f1319f-686a-4f23-b1eb-748bcef64df2

### Fixes Included in v15

1. iOS crash fixed (newArchEnabled disabled)
2. Call disconnection race condition fixed
3. Push token registration fixed (platform set before connect)
4. APNs VoIP Push configured on server
5. Defensive native module checks added
6. Comprehensive call logging added

---

## Contact & Support

**Developer**: Fatih Tunali
**EAS Account**: fatihtunali
**Apple Team ID**: KX5N2U5RA2
**Bundle ID**: com.sarjmobile.whisper
**Project ID**: 395d7567-88ca-4a3e-bb59-676bda71ba5e

---

*This document was generated on January 15, 2026*
