// Expo Push Notification Service
// Uses Expo's push notification API to send notifications
// Also supports iOS VoIP push via APNs for incoming calls

import * as http2 from 'http2';
import * as fs from 'fs';
import * as path from 'path';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// APNs endpoints
const APNS_PRODUCTION = 'https://api.push.apple.com';
const APNS_SANDBOX = 'https://api.sandbox.push.apple.com';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  _contentAvailable?: boolean; // iOS: wake up app in background
}

interface ExpoPushResponse {
  data: Array<{
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: {
      error?: string;
    };
  }>;
}

// APNs VoIP Push payload
interface VoIPPushPayload {
  callId: string;
  fromWhisperId: string;
  callerName?: string;
  isVideo: boolean;
  uuid: string;
}

class PushService {
  private apnsClient: http2.ClientHttp2Session | null = null;
  private apnsJwt: string | null = null;
  private apnsJwtExpiry: number = 0;
  // Send a push notification
  async sendNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    channelId: string = 'messages' // Android channel - 'messages' or 'calls'
  ): Promise<boolean> {
    // Validate Expo push token format
    if (!this.isValidExpoPushToken(pushToken)) {
      console.warn('[PushService] Invalid push token format:', pushToken);
      return false;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      title,
      body,
      data,
      sound: 'default',
      channelId, // Android channel - 'calls' channel has bypassDnd and lockscreen visibility
      priority: 'high', // Ensure high priority for immediate delivery
      _contentAvailable: true, // iOS: wake up app in background to process notification
    };

    console.log(`[PushService] Sending notification to token: ${pushToken.substring(0, 30)}...`);
    console.log(`[PushService] Title: "${title}", Body: "${body}"`);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = (await response.json()) as ExpoPushResponse;
      console.log(`[PushService] Response:`, JSON.stringify(result));

      if (result.data && result.data[0]) {
        const pushResult = result.data[0];
        if (pushResult.status === 'ok') {
          console.log(`[PushService] Notification sent successfully (ID: ${pushResult.id})`);
          return true;
        } else {
          console.error('[PushService] Push failed:', pushResult.message, pushResult.details);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('[PushService] Error sending push notification:', error);
      return false;
    }
  }

  // Send notification for new message
  async sendMessageNotification(
    pushToken: string,
    fromWhisperId: string,
    messagePreview?: string
  ): Promise<boolean> {
    // Don't include message content in notification for privacy
    // Just notify that a new message arrived
    const title = 'Whisper';
    const body = `New message from ${fromWhisperId.substring(0, 12)}...`;

    console.log(`[PushService] Sending message notification to offline user, token: ${pushToken.substring(0, 30)}...`);

    const result = await this.sendNotification(pushToken, title, body, {
      type: 'new_message',
      fromWhisperId,
    });

    if (!result) {
      console.error(`[PushService] Failed to deliver message notification for ${fromWhisperId}`);
    }

    return result;
  }

  // Send notification for incoming call (regular push)
  // Uses 'calls' channel on Android for bypassDnd and lockscreen visibility
  async sendCallNotification(
    pushToken: string,
    fromWhisperId: string,
    callId: string,
    isVideo: boolean
  ): Promise<boolean> {
    const title = isVideo ? 'Incoming Video Call' : 'Incoming Call';
    const body = `${fromWhisperId.substring(0, 12)}... is calling you`;

    console.log(`[PushService] Sending call notification to ${pushToken.substring(0, 30)}...`);
    console.log(`[PushService] Call details: callId=${callId}, from=${fromWhisperId}, isVideo=${isVideo}`);

    const result = await this.sendNotification(
      pushToken,
      title,
      body,
      {
        type: 'incoming_call',
        fromWhisperId,
        callId,
        isVideo,
      },
      'calls' // Use 'calls' channel for higher priority on Android
    );

    if (result) {
      console.log(`[PushService] Call notification sent successfully`);
    } else {
      console.error(`[PushService] Failed to send call notification`);
    }

    return result;
  }

  // Send VoIP push notification for iOS (makes phone ring like a real call)
  async sendVoIPPush(
    voipToken: string,
    fromWhisperId: string,
    callId: string,
    isVideo: boolean,
    callerName?: string
  ): Promise<boolean> {
    // VoIP push requires APNs configuration
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const keyPath = process.env.APNS_KEY_PATH;
    const bundleId = process.env.APNS_BUNDLE_ID || 'com.sarjmobile.whisper';
    const isProduction = process.env.APNS_PRODUCTION === 'true';

    if (!keyId || !teamId || !keyPath) {
      console.warn('[PushService] APNs not configured for VoIP push. Falling back to regular push.');
      return false;
    }

    try {
      // Generate UUID for the call
      const uuid = this.generateUUID();

      const payload: VoIPPushPayload = {
        callId,
        fromWhisperId,
        callerName: callerName || fromWhisperId.substring(0, 12) + '...',
        isVideo,
        uuid,
      };

      // Get or create APNs JWT
      const jwt = await this.getAPNsJWT(keyId, teamId, keyPath);
      if (!jwt) {
        console.error('[PushService] Failed to generate APNs JWT');
        return false;
      }

      // Send VoIP push via APNs
      const apnsHost = isProduction ? APNS_PRODUCTION : APNS_SANDBOX;
      const result = await this.sendAPNsRequest(
        apnsHost,
        voipToken,
        `${bundleId}.voip`,
        payload,
        jwt
      );

      if (result) {
        console.log(`[PushService] VoIP push sent successfully to ${voipToken.substring(0, 20)}...`);
      }
      return result;
    } catch (error) {
      console.error('[PushService] VoIP push failed:', error);
      return false;
    }
  }

  // Generate APNs JWT token
  private async getAPNsJWT(keyId: string, teamId: string, keyPath: string): Promise<string | null> {
    // Reuse JWT if still valid (JWT is valid for 1 hour, we refresh after 50 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (this.apnsJwt && this.apnsJwtExpiry > now + 600) {
      return this.apnsJwt;
    }

    try {
      // Check if key file exists
      if (!fs.existsSync(keyPath)) {
        console.error(`[PushService] APNs key file not found: ${keyPath}`);
        return null;
      }

      // Read the p8 key file
      const keyFile = fs.readFileSync(keyPath, 'utf8');

      // Create JWT header and claims
      const header = {
        alg: 'ES256',
        kid: keyId,
      };

      const claims = {
        iss: teamId,
        iat: now,
      };

      // Base64url encode
      const base64UrlEncode = (obj: object) => {
        return Buffer.from(JSON.stringify(obj))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      };

      const headerB64 = base64UrlEncode(header);
      const claimsB64 = base64UrlEncode(claims);
      const unsignedToken = `${headerB64}.${claimsB64}`;

      // Sign with ES256 using crypto
      const crypto = await import('crypto');
      const sign = crypto.createSign('SHA256');
      sign.update(unsignedToken);
      const signature = sign.sign(keyFile, 'base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      this.apnsJwt = `${unsignedToken}.${signature}`;
      this.apnsJwtExpiry = now + 3600; // Valid for 1 hour

      return this.apnsJwt;
    } catch (error) {
      console.error('[PushService] Failed to generate APNs JWT:', error);
      return null;
    }
  }

  // Send APNs request via HTTP/2
  private async sendAPNsRequest(
    host: string,
    deviceToken: string,
    topic: string,
    payload: VoIPPushPayload,
    jwt: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Create HTTP/2 client
        const client = http2.connect(host);

        client.on('error', (err) => {
          console.error('[PushService] APNs connection error:', err);
          client.close();
          resolve(false);
        });

        const req = client.request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          'authorization': `bearer ${jwt}`,
          'apns-topic': topic,
          'apns-push-type': 'voip',
          'apns-priority': '10',
          'apns-expiration': '0',
          'content-type': 'application/json',
        });

        let responseStatus = 0;
        let responseData = '';

        req.on('response', (headers) => {
          responseStatus = headers[':status'] as number;
        });

        req.on('data', (chunk) => {
          responseData += chunk;
        });

        req.on('end', () => {
          client.close();
          if (responseStatus === 200) {
            resolve(true);
          } else {
            console.error(`[PushService] APNs error ${responseStatus}:`, responseData);
            resolve(false);
          }
        });

        req.on('error', (err) => {
          console.error('[PushService] APNs request error:', err);
          client.close();
          resolve(false);
        });

        req.write(JSON.stringify({
          aps: {},
          ...payload,
        }));
        req.end();
      } catch (error) {
        console.error('[PushService] APNs request failed:', error);
        resolve(false);
      }
    });
  }

  // Generate UUID v4
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Validate Expo push token format
  private isValidExpoPushToken(token: string): boolean {
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  }
}

// Singleton instance
export const pushService = new PushService();
export default pushService;
