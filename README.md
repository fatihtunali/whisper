# Whisper - Privacy-First Encrypted Messaging

Whisper is a privacy-first, end-to-end encrypted messaging application. Users communicate via anonymous "Whisper IDs" (WSP-XXXX-XXXX-XXXX) without requiring phone numbers, emails, or any personal information.

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

## Recent Updates (v20)

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

- **Zero-knowledge server**: Only encrypted blobs pass through
- **Private keys on device only**: Never transmitted
- **Challenge-response auth**: Ed25519 signatures prevent replay attacks
- **Account deletion**: Requires cryptographic signature

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

Private - All rights reserved

## Contact

For support: Check the website at sarjmobile.com
