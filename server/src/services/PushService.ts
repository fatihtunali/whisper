// Expo Push Notification Service
// Uses Expo's push notification API to send notifications

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
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

class PushService {
  // Send a push notification
  async sendNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
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
      channelId: 'messages', // Android channel
    };

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

      if (result.data && result.data[0]) {
        const pushResult = result.data[0];
        if (pushResult.status === 'ok') {
          console.log('[PushService] Notification sent successfully');
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
    const title = 'New Message';
    const body = `You have a new message from ${fromWhisperId.substring(0, 12)}...`;

    return this.sendNotification(pushToken, title, body, {
      type: 'new_message',
      fromWhisperId,
    });
  }

  // Send notification for incoming call
  async sendCallNotification(
    pushToken: string,
    fromWhisperId: string,
    callId: string,
    isVideo: boolean
  ): Promise<boolean> {
    const title = isVideo ? 'Incoming Video Call' : 'Incoming Call';
    const body = `${fromWhisperId.substring(0, 12)}... is calling you`;

    return this.sendNotification(pushToken, title, body, {
      type: 'incoming_call',
      fromWhisperId,
      callId,
      isVideo,
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
