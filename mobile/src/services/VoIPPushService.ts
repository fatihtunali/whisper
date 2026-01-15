/**
 * VoIP Push Service - iOS VoIP Push Notifications
 *
 * Handles VoIP push notifications for incoming calls on iOS
 * This allows the phone to ring even when the app is completely closed
 *
 * NOTE: This service requires native module configuration via Expo config plugins
 * or manual native setup. It will gracefully degrade if the native module is unavailable.
 */

import { Platform } from 'react-native';

let VoipPushNotification: any = null;
let voipPushAvailable: boolean | null = null;

// Check if VoIP Push native module is available at runtime
// This function is designed to NEVER throw - always returns a boolean
const checkVoIPPushAvailable = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (voipPushAvailable !== null) return voipPushAvailable;

  try {
    // Check if the native module exists before attempting to use it
    const { NativeModules } = require('react-native');
    // Double-check NativeModules exists and is an object
    if (!NativeModules || typeof NativeModules !== 'object') {
      voipPushAvailable = false;
      console.log('[VoIPPushService] NativeModules not available - VoIP push features disabled');
      return false;
    }
    voipPushAvailable = !!(NativeModules.RNVoipPushNotificationManager);
    if (!voipPushAvailable) {
      console.log('[VoIPPushService] Native module not available - VoIP push features disabled');
    }
    return voipPushAvailable;
  } catch (e) {
    voipPushAvailable = false;
    console.log('[VoIPPushService] Native module check failed - VoIP push features disabled:', e);
    return false;
  }
};

type VoIPPushHandler = (notification: any) => void;

class VoIPPushService {
  private initialized: boolean = false;
  private initializationFailed: boolean = false;
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
    if (this.initializationFailed) return false;

    // Check if native module is available before attempting initialization
    if (!checkVoIPPushAvailable()) {
      this.initializationFailed = true;
      return false;
    }

    try {
      // Dynamic import
      const VoipModule = await import('react-native-voip-push-notification');
      VoipPushNotification = VoipModule.default;

      if (!VoipPushNotification || !VoipPushNotification.registerVoipToken) {
        console.warn('[VoIPPushService] Module loaded but required functions not available');
        this.initializationFailed = true;
        return false;
      }

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
      this.initializationFailed = true;
      VoipPushNotification = null;
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
