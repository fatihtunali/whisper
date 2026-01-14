/**
 * VoIP Push Service - iOS VoIP Push Notifications
 *
 * Handles VoIP push notifications for incoming calls on iOS
 * This allows the phone to ring even when the app is completely closed
 */

import { Platform } from 'react-native';

let VoipPushNotification: any = null;

type VoIPPushHandler = (notification: any) => void;

class VoIPPushService {
  private initialized: boolean = false;
  private voipToken: string | null = null;

  // Callback for when VoIP push is received
  public onNotification: VoIPPushHandler | null = null;
  public onTokenReceived: ((token: string) => void) | null = null;

  async initialize(): Promise<boolean> {
    // VoIP push is iOS only
    if (Platform.OS !== 'ios') {
      console.log('[VoIPPushService] Not iOS, skipping initialization');
      return false;
    }

    if (this.initialized) return true;

    try {
      // Dynamic import
      const VoipModule = await import('react-native-voip-push-notification');
      VoipPushNotification = VoipModule.default;

      // Register for VoIP notifications
      VoipPushNotification.addEventListener('register', (token: string) => {
        console.log('[VoIPPushService] VoIP token received:', token.substring(0, 20) + '...');
        this.voipToken = token;
        if (this.onTokenReceived) {
          this.onTokenReceived(token);
        }
      });

      // Handle incoming VoIP push
      VoipPushNotification.addEventListener('notification', (notification: any) => {
        console.log('[VoIPPushService] VoIP push received:', notification);

        // Process the notification
        if (this.onNotification) {
          this.onNotification(notification);
        }

        // IMPORTANT: Must call this to let iOS know we've handled the push
        VoipPushNotification.onVoipNotificationCompleted(notification.uuid);
      });

      // Handle when app receives call from background/killed state
      VoipPushNotification.addEventListener('didLoadWithEvents', (events: any[]) => {
        console.log('[VoIPPushService] Loaded with events:', events?.length || 0);
        if (!events || events.length === 0) return;

        // Process any pending notifications
        events.forEach((event) => {
          if (event.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') {
            this.voipToken = event.data;
            if (this.onTokenReceived) {
              this.onTokenReceived(event.data);
            }
          } else if (event.name === 'RNVoipPushRemoteNotificationReceivedEvent') {
            if (this.onNotification) {
              this.onNotification(event.data);
            }
          }
        });
      });

      // Register for VoIP push
      VoipPushNotification.registerVoipToken();

      this.initialized = true;
      console.log('[VoIPPushService] Initialized successfully');
      return true;
    } catch (error) {
      console.warn('[VoIPPushService] Failed to initialize:', error);
      return false;
    }
  }

  // Get the VoIP push token
  getToken(): string | null {
    return this.voipToken;
  }

  // Check if VoIP push is available
  isAvailable(): boolean {
    return Platform.OS === 'ios' && this.initialized;
  }

  // Cleanup
  cleanup(): void {
    if (!VoipPushNotification) return;

    try {
      VoipPushNotification.removeEventListener('register');
      VoipPushNotification.removeEventListener('notification');
      VoipPushNotification.removeEventListener('didLoadWithEvents');
    } catch (error) {
      console.error('[VoIPPushService] Cleanup error:', error);
    }
  }
}

// Singleton instance
export const voipPushService = new VoIPPushService();
export default voipPushService;
