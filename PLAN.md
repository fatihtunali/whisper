# Whisper - Secret Messaging Service
## Complete Project Plan

---

## 1. Project Vision

**Whisper** is a privacy-first, end-to-end encrypted messaging application that allows users to communicate securely without revealing their identity. Unlike WhatsApp, Telegram, or Signal, Whisper requires no phone number, email, or any personal information to register.

### Core Principles
- **Privacy by Design** - No data collection, no tracking, no analytics
- **True Anonymity** - No phone/email required, just a generated Whisper ID
- **Zero Knowledge** - Server cannot read messages or know who talks to whom
- **User Ownership** - Users control their keys and data completely

---

## 2. Project Structure

```
whisper/
│
├── website/                    # Landing Page (Next.js)
│   ├── app/
│   │   ├── page.tsx           # Homepage
│   │   ├── privacy/page.tsx   # Privacy Policy
│   │   ├── terms/page.tsx     # Terms of Service
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Global styles
│   ├── public/
│   │   └── images/            # App screenshots, icons
│   ├── package.json
│   └── next.config.js
│
├── mobile/                     # React Native App (Expo)
│   ├── src/
│   │   ├── screens/           # All app screens
│   │   ├── components/        # Reusable UI components
│   │   ├── navigation/        # React Navigation setup
│   │   ├── services/          # Business logic
│   │   ├── crypto/            # Encryption layer
│   │   ├── storage/           # Secure storage
│   │   ├── hooks/             # Custom React hooks
│   │   ├── context/           # React Context providers
│   │   ├── types/             # TypeScript types
│   │   └── utils/             # Helper functions
│   ├── assets/                # Images, fonts
│   ├── app.json               # Expo config
│   └── package.json
│
├── server/                     # Backend Server (Node.js)
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── websocket/         # WebSocket handling
│   │   ├── routes/            # HTTP API routes
│   │   ├── services/          # Business logic
│   │   ├── storage/           # Message queue storage
│   │   └── types/             # TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                       # Documentation
│   ├── API.md                 # API documentation
│   ├── SECURITY.md            # Security architecture
│   └── PROTOCOL.md            # Messaging protocol
│
├── PLAN.md                     # This file
└── README.md                   # Project overview
```

---

## 3. Technical Architecture

### 3.1 Encryption Architecture

```
┌─────────────────┐                              ┌─────────────────┐
│     User A      │                              │     User B      │
│                 │                              │                 │
│  Private Key A  │                              │  Private Key B  │
│  Public Key A   │                              │  Public Key B   │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │  1. A encrypts message with:                   │
         │     - A's private key                          │
         │     - B's public key                           │
         │                                                │
         ▼                                                │
┌─────────────────┐                              ┌────────┴────────┐
│ Encrypted Msg   │────── Server Relay ─────────▶│ Encrypted Msg   │
│ (unreadable)    │      (cannot decrypt)        │ (unreadable)    │
└─────────────────┘                              └────────┬────────┘
                                                          │
                                                          │  2. B decrypts with:
                                                          │     - B's private key
                                                          │     - A's public key
                                                          ▼
                                                 ┌─────────────────┐
                                                 │ Original Message│
                                                 └─────────────────┘
```

### 3.2 Cryptographic Specifications

| Purpose | Algorithm | Library |
|---------|-----------|---------|
| Key Exchange | X25519 (Curve25519) | TweetNaCl |
| Symmetric Encryption | XSalsa20-Poly1305 | TweetNaCl |
| Key Derivation | HKDF-SHA256 | TweetNaCl |
| Random Generation | CSPRNG | expo-crypto |
| Recovery Phrase | BIP39 (2048 words) | Custom |

### 3.3 Message Flow

```
1. User Opens App
   └── Check if registered
       ├── Yes → Load keys from secure storage → Connect to server
       └── No  → Show welcome screen

2. User Sends Message
   └── Encrypt message with recipient's public key
       └── Send encrypted payload to server
           └── Server routes to recipient (or queues if offline)

3. User Receives Message
   └── Server pushes encrypted message via WebSocket
       └── Decrypt with own private key
           └── Display in chat
```

---

## 4. Feature Specifications

### 4.1 User Identity

| Feature | Description |
|---------|-------------|
| Whisper ID | Format: `WSP-XXXX-XXXX-XXXX` (12 alphanumeric characters) |
| Username | Optional, 3-20 characters, unique |
| Avatar | Optional, local only (not synced) |
| Recovery | 12-word BIP39 seed phrase |

### 4.2 Messaging Features

| Feature | Phase | Priority |
|---------|-------|----------|
| Text messages | Phase 2 | High |
| Message status (sent/delivered/read) | Phase 2 | High |
| Typing indicators | Phase 4 | Medium |
| Image sharing | Future | Medium |
| Voice messages | Future | Medium |
| File sharing | Future | Low |
| Voice calls | Future | Low |
| Video calls | Future | Low |
| Group chats | Future | Low |
| Disappearing messages | Future | Medium |

### 4.3 Contact Management

| Feature | Description |
|---------|-------------|
| Add via Whisper ID | Manual entry of WSP-XXXX-XXXX-XXXX |
| Add via QR Code | Scan QR containing Whisper ID + public key |
| Share own QR | Generate QR for others to scan |
| Nicknames | Local nicknames for contacts |
| Block users | Block unwanted contacts |

---

## 5. Detailed Phase Breakdown

---

### PHASE 1: Landing Page Website
**Duration: 1 session**

#### 1.1 Create Next.js Project
```bash
cd whisper
npx create-next-app@latest website --typescript --tailwind --app --no-src-dir
```

#### 1.2 Homepage Design
**File: `website/app/page.tsx`**

Sections:
1. **Hero Section**
   - App name and tagline: "Private. Secure. Anonymous."
   - Brief description
   - Download buttons (iOS + Android)
   - App screenshot/mockup

2. **Features Section**
   - End-to-end encryption
   - No phone number required
   - No tracking or analytics
   - Self-destructing messages
   - Open source (if applicable)

3. **How It Works Section**
   - Step 1: Download the app
   - Step 2: Create anonymous account
   - Step 3: Share your Whisper ID
   - Step 4: Start secure conversations

4. **Security Section**
   - Encryption details
   - Privacy guarantees
   - What we don't collect

5. **Footer**
   - Links to Privacy Policy, Terms
   - Copyright

#### 1.3 Privacy Policy Page
**File: `website/app/privacy/page.tsx`**

Required sections:
- Introduction
- Information We Do NOT Collect
- Information Stored Locally
- End-to-End Encryption explanation
- Data Security
- Children's Privacy
- Changes to Policy
- Contact

#### 1.4 Terms of Service Page
**File: `website/app/terms/page.tsx`**

Required sections:
- Acceptance of Terms
- Description of Service
- Account Registration
- User Responsibilities
- Prohibited Activities
- Intellectual Property
- Disclaimer of Warranties
- Limitation of Liability
- Termination
- Governing Law
- Contact

#### 1.5 Deployment
- Build: `npm run build`
- Transfer to server via SCP
- Run with PM2 on port 3021
- Configure Nginx reverse proxy
- SSL via Let's Encrypt

---

### PHASE 2: Mobile App Development
**Duration: 3-4 sessions**

#### 2.1 Project Setup
```bash
cd whisper
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install expo-secure-store expo-crypto expo-camera expo-barcode-scanner
npm install tweetnacl tweetnacl-util
npm install react-native-screens react-native-safe-area-context
```

#### 2.2 Type Definitions
**File: `mobile/src/types/index.ts`**

```typescript
// User types
interface User {
  whisperId: string;      // WSP-XXXX-XXXX-XXXX
  username?: string;
  publicKey: string;
  createdAt: Date;
}

interface LocalUser extends User {
  privateKey: string;
  seedPhrase: string[];   // 12 words
}

// Message types
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;        // Plaintext (after decryption)
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

interface EncryptedMessage {
  id: string;
  toWhisperId: string;
  fromWhisperId: string;
  encryptedContent: string;
  nonce: string;
  timestamp: number;
}

// Contact types
interface Contact {
  whisperId: string;
  publicKey: string;
  username?: string;
  nickname?: string;
  addedAt: Date;
}

// Conversation types
interface Conversation {
  id: string;             // Same as contact's whisperId for 1:1
  contactId: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: Date;
}
```

#### 2.3 Crypto Service
**File: `mobile/src/crypto/CryptoService.ts`**

Functions:
- `generateKeyPair()` → { publicKey, privateKey }
- `generateWhisperId()` → "WSP-XXXX-XXXX-XXXX"
- `generateSeedPhrase()` → string[12]
- `recoverFromSeed(words)` → { publicKey, privateKey, whisperId }
- `encryptMessage(plaintext, myPrivateKey, theirPublicKey)` → { encrypted, nonce }
- `decryptMessage(encrypted, nonce, myPrivateKey, theirPublicKey)` → plaintext

#### 2.4 Secure Storage Service
**File: `mobile/src/storage/SecureStorage.ts`**

Functions:
- `saveUser(user)` / `getUser()` / `deleteUser()`
- `saveContacts(contacts)` / `getContacts()` / `addContact(contact)`
- `saveConversations(convos)` / `getConversations()`
- `saveMessages(convoId, messages)` / `getMessages(convoId)`
- `clearAll()`

#### 2.5 Screens

| Screen | File | Description |
|--------|------|-------------|
| Welcome | `WelcomeScreen.tsx` | First screen, Create/Recover options |
| Create Account | `CreateAccountScreen.tsx` | Generate new identity |
| Seed Phrase | `SeedPhraseScreen.tsx` | Show/verify 12 words |
| Recover Account | `RecoverAccountScreen.tsx` | Enter 12 words |
| Chats | `ChatsScreen.tsx` | List of conversations |
| Chat | `ChatScreen.tsx` | Individual chat view |
| Contacts | `ContactsScreen.tsx` | Contact list |
| Add Contact | `AddContactScreen.tsx` | Add via ID or QR |
| QR Scanner | `QRScannerScreen.tsx` | Scan contact QR |
| My QR | `MyQRScreen.tsx` | Show own QR code |
| Settings | `SettingsScreen.tsx` | App settings |
| Profile | `ProfileScreen.tsx` | View own profile, seed phrase |

#### 2.6 Navigation Structure
```
App
├── Auth Stack (not logged in)
│   ├── Welcome
│   ├── CreateAccount
│   ├── SeedPhrase
│   └── RecoverAccount
│
└── Main Stack (logged in)
    ├── Tab Navigator
    │   ├── Chats Tab
    │   │   └── ChatsScreen
    │   ├── Contacts Tab
    │   │   └── ContactsScreen
    │   └── Settings Tab
    │       └── SettingsScreen
    │
    └── Modal Screens
        ├── ChatScreen
        ├── AddContactScreen
        ├── QRScannerScreen
        ├── MyQRScreen
        └── ProfileScreen
```

---

### PHASE 3: Backend Server
**Duration: 1-2 sessions**

#### 3.1 Project Setup
```bash
cd whisper
mkdir server && cd server
npm init -y
npm install express ws dotenv uuid
npm install -D typescript @types/node @types/express @types/ws ts-node-dev
```

#### 3.2 Server Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Whisper Server                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ HTTP Server  │    │  WebSocket   │    │  Message  │  │
│  │   (Express)  │    │   Server     │    │   Queue   │  │
│  │              │    │              │    │           │  │
│  │ /health      │    │ Connection   │    │ Pending   │  │
│  │ /stats       │    │ Management   │    │ Messages  │  │
│  │              │    │              │    │ (72h TTL) │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│         │                   │                  │         │
│         └───────────────────┴──────────────────┘         │
│                            │                             │
│                    ┌───────┴───────┐                     │
│                    │  No Message   │                     │
│                    │   Content     │                     │
│                    │   Storage     │                     │
│                    └───────────────┘                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 3.3 WebSocket Protocol

**Client → Server Messages:**

```typescript
// Register connection
{ type: 'register', payload: { whisperId, publicKey } }

// Send message
{ type: 'send_message', payload: { messageId, toWhisperId, encryptedContent, nonce } }

// Acknowledge delivery
{ type: 'delivery_receipt', payload: { messageId, status: 'delivered' | 'read' } }

// Request pending messages
{ type: 'fetch_pending', payload: {} }

// Heartbeat
{ type: 'ping', payload: {} }
```

**Server → Client Messages:**

```typescript
// Registration confirmed
{ type: 'register_ack', payload: { success: true } }

// New message received
{ type: 'message_received', payload: { messageId, fromWhisperId, encryptedContent, nonce, timestamp } }

// Message delivery status
{ type: 'message_delivered', payload: { messageId, status: 'delivered' | 'pending' } }

// Pending messages (on connect)
{ type: 'pending_messages', payload: { messages: [...] } }

// Heartbeat response
{ type: 'pong', payload: {} }

// Error
{ type: 'error', payload: { code, message } }
```

#### 3.4 Server Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, start HTTP + WS servers |
| `src/websocket/WebSocketServer.ts` | WebSocket connection handling |
| `src/websocket/ConnectionManager.ts` | Track connected clients |
| `src/services/MessageRouter.ts` | Route messages to recipients |
| `src/services/MessageQueue.ts` | Store messages for offline users |
| `src/types/index.ts` | TypeScript interfaces |

#### 3.5 Deployment
- Transfer to server
- Run with PM2: `pm2 start dist/index.js --name whisper-server`
- Ports: 3030 (HTTP), 3031 (WebSocket)
- Add firewall rules for ports

---

### PHASE 4: Integration & Testing
**Duration: 1 session**

#### 4.1 Connect Mobile to Server
- Update `MessagingService.ts` with server URL
- Test WebSocket connection
- Test registration flow

#### 4.2 End-to-End Testing
- Create two test accounts
- Add each other as contacts
- Send messages both ways
- Verify encryption/decryption
- Test offline message delivery

#### 4.3 Edge Cases
- App killed while message sending
- Network disconnection
- Server restart
- Invalid messages
- Blocked users

---

### PHASE 5: App Store Publishing
**Duration: Separate process**

#### 5.1 iOS (App Store)
- Apple Developer Account ($99/year)
- App Store Connect setup
- Screenshots (6.5", 5.5" displays)
- App description, keywords
- Privacy policy URL
- Build with EAS: `eas build --platform ios`
- Submit for review

#### 5.2 Android (Google Play)
- Google Play Developer Account ($25 one-time)
- Play Console setup
- Screenshots, feature graphic
- App description
- Privacy policy URL
- Build with EAS: `eas build --platform android`
- Submit for review

---

## 6. Server Infrastructure

### Current Server Details
| Property | Value |
|----------|-------|
| IP | 142.93.136.228 |
| Domain | sarjmobile.com |
| OS | Ubuntu 24.04 LTS |
| User | whisper |

### Port Allocation
| Service | Port |
|---------|------|
| Website (Next.js) | 3021 |
| API (Express) | 3030 |
| WebSocket | 3031 |

### Nginx Configuration
```nginx
# Website
server {
    listen 443 ssl;
    server_name sarjmobile.com;

    location / {
        proxy_pass http://localhost:3021;
    }
}

# WebSocket
server {
    listen 443 ssl;
    server_name ws.sarjmobile.com;

    location / {
        proxy_pass http://localhost:3031;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 7. Security Considerations

### What We Store on Server
- Nothing permanent
- Encrypted messages for offline users (max 72 hours)
- No logs of who sends to whom
- No IP address logging

### What We DON'T Have Access To
- Message content (encrypted)
- Private keys (never leave device)
- User identities (anonymous)
- Contact lists (stored locally)
- Chat history (stored locally)

### Threat Model
| Threat | Mitigation |
|--------|------------|
| Server compromise | Messages encrypted, no keys on server |
| Man-in-the-middle | E2E encryption, key verification |
| Device theft | Secure storage, optional PIN |
| Account hijacking | 12-word seed phrase (user responsibility) |

---

## 8. Execution Order

```
Session 1: Phase 1 (Website)
├── 1.1 Create Next.js project
├── 1.2 Build homepage
├── 1.3 Privacy Policy
├── 1.4 Terms of Service
└── 1.5 Deploy to server

Session 2: Phase 2A (Mobile Setup)
├── 2.1 Create Expo project
├── 2.2 Type definitions
├── 2.3 Crypto service
└── 2.4 Secure storage

Session 3: Phase 2B (Mobile Screens)
├── 2.5 Navigation setup
├── 2.6 Auth screens (Welcome, Create, Recover)
└── 2.7 Main screens (Chats, Chat, Contacts)

Session 4: Phase 2C + Phase 3 (Messaging + Server)
├── 2.8 Messaging service
├── 3.1 Create server
├── 3.2 WebSocket handling
└── 3.3 Deploy server

Session 5: Phase 4 (Integration)
├── 4.1 Connect app to server
├── 4.2 Test messaging
└── 4.3 Bug fixes
```

---

## 9. Current Status

**Status: Planning Complete**

**Next Action:** Start Phase 1, Task 1.1 - Create Next.js project

---

## 10. Commands Quick Reference

```bash
# Website
cd whisper/website && npm run dev      # Development
cd whisper/website && npm run build    # Production build

# Mobile
cd whisper/mobile && npx expo start    # Development
cd whisper/mobile && eas build         # Production build

# Server
cd whisper/server && npm run dev       # Development
cd whisper/server && npm run build     # Production build

# Git
cd whisper && git add . && git commit -m "message" && git push origin master
```
