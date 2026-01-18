/**
 * Android Call Notification Service
 *
 * Uses @notifee/react-native to display full-screen incoming call notifications on Android.
 * This makes the phone ring like a real phone call, even when the app is killed or the phone is locked.
 */

import { Platform } from 'react-native';
import { generateUUID } from '../utils/helpers';

// Check if string is valid UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

let notifee: any = null;
let notifeeAvailable: boolean | null = null;

// Android notification channel and category IDs
const CALL_CHANNEL_ID = 'whisper-incoming-calls';
const CALL_CATEGORY_ID = 'incoming-call';

// Check if Notifee native module is available
const checkNotifeeAvailable = (): boolean => {
  if (Platform.OS !== 'android') return false;
  if (notifeeAvailable !== null) return notifeeAvailable;

  try {
    const { NativeModules } = require('react-native');
    if (!NativeModules || typeof NativeModules !== 'object') {
      notifeeAvailable = false;
      return false;
    }
    notifeeAvailable = !!(NativeModules.NotifeeApiModule);
    if (!notifeeAvailable) {
      console.log('[AndroidCallNotification] Notifee native module not available');
    }
    return notifeeAvailable;
  } catch (e) {
    notifeeAvailable = false;
    console.log('[AndroidCallNotification] Notifee check failed:', e);
    return false;
  }
};

// Load Notifee module
const loadNotifee = async (): Promise<any | null> => {
  if (notifee) return notifee;
  if (Platform.OS !== 'android') return null;
  if (!checkNotifeeAvailable()) return null;

  try {
    const module = await import('@notifee/react-native');
    notifee = module.default;
    return notifee;
  } catch (e) {
    console.warn('[AndroidCallNotification] Failed to load notifee:', e);
    return null;
  }
};

class AndroidCallNotificationService {
  private initialized: boolean = false;
  private activeNotificationId: string | null = null;

  // Callbacks for notification actions
  public onAnswerCall: ((callId: string) => void) | null = null;
  public onDeclineCall: ((callId: string) => void) | null = null;

  async initialize(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (this.initialized) return true;

    const noti = await loadNotifee();
    if (!noti) {
      console.log('[AndroidCallNotification] Notifee not available, skipping initialization');
      return false;
    }

    try {
      // Create notification channel for incoming calls with full-screen intent
      await noti.createChannel({
        id: CALL_CHANNEL_ID,
        name: 'Incoming Calls',
        importance: 4, // AndroidImportance.HIGH
        sound: 'default',
        vibration: true,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lights: true,
        lightColor: '#FF0000',
        bypassDnd: true,
      });

      // Create notification category with answer/decline actions
      await noti.setNotificationCategories([
        {
          id: CALL_CATEGORY_ID,
          actions: [
            {
              id: 'answer',
              title: 'Answer',
              foreground: true, // Opens the app
            },
            {
              id: 'decline',
              title: 'Decline',
              destructive: true,
            },
          ],
        },
      ]);

      // Set up foreground event handler for notification actions
      noti.onForegroundEvent(({ type, detail }: any) => {
        const { notification, pressAction } = detail;

        // Handle notification press (tap on notification)
        if (type === 1) { // EventType.PRESS
          console.log('[AndroidCallNotification] Notification pressed');
          const callId = notification?.data?.callId;
          if (callId && this.onAnswerCall) {
            this.onAnswerCall(callId);
          }
        }

        // Handle action press (answer/decline buttons)
        if (type === 2) { // EventType.ACTION_PRESS
          const callId = notification?.data?.callId;

          if (pressAction?.id === 'answer' && callId) {
            console.log('[AndroidCallNotification] Answer action pressed');
            if (this.onAnswerCall) {
              this.onAnswerCall(callId);
            }
            this.cancelNotification();
          } else if (pressAction?.id === 'decline' && callId) {
            console.log('[AndroidCallNotification] Decline action pressed');
            if (this.onDeclineCall) {
              this.onDeclineCall(callId);
            }
            this.cancelNotification();
          }
        }

        // Handle notification dismissed
        if (type === 3) { // EventType.DISMISSED
          console.log('[AndroidCallNotification] Notification dismissed');
        }
      });

      // Set up background event handler
      noti.onBackgroundEvent(async ({ type, detail }: any) => {
        const { notification, pressAction } = detail;
        const callId = notification?.data?.callId;

        if (type === 2 && pressAction?.id === 'decline' && callId) {
          // Handle decline in background
          console.log('[AndroidCallNotification] Background decline:', callId);
          // Note: Can't call JS handlers here, but declining will be handled
          // when the app opens or the call times out
        }
      });

      this.initialized = true;
      console.log('[AndroidCallNotification] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[AndroidCallNotification] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Display full-screen incoming call notification
   * This will show a full-screen UI on Android even when the phone is locked
   */
  async displayIncomingCall(
    callId: string,
    callerName: string,
    callerId: string,
    isVideo: boolean = false
  ): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    // Validate callId is proper UUID format for consistency
    if (!callId || typeof callId !== 'string' || !isValidUUID(callId)) {
      console.warn('[AndroidCallNotification] Invalid callId, generating fallback UUID');
      callId = generateUUID();
    }

    const noti = await loadNotifee();
    if (!noti) {
      console.warn('[AndroidCallNotification] Notifee not available');
      return false;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Cancel any existing call notification
      if (this.activeNotificationId) {
        await this.cancelNotification();
      }

      const notificationId = `call-${callId}`;
      this.activeNotificationId = notificationId;

      // Display the notification with full-screen intent
      await noti.displayNotification({
        id: notificationId,
        title: isVideo ? 'Incoming Video Call' : 'Incoming Call',
        body: callerName || callerId,
        data: {
          callId,
          callerId,
          isVideo: String(isVideo),
        },
        android: {
          channelId: CALL_CHANNEL_ID,
          category: 2, // AndroidCategory.CALL
          importance: 4, // AndroidImportance.HIGH
          ongoing: true, // Can't be swiped away
          autoCancel: false,
          fullScreenAction: {
            id: 'default', // Opens the app in full screen
            launchActivity: 'default',
          },
          actions: [
            {
              title: 'Answer',
              pressAction: {
                id: 'answer',
                launchActivity: 'default',
              },
            },
            {
              title: 'Decline',
              pressAction: {
                id: 'decline',
              },
            },
          ],
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          // Show on lock screen
          visibility: 1, // AndroidVisibility.PUBLIC
          // Keep showing until answered/declined
          timeoutAfter: 60000, // 60 seconds timeout
          // Use call style notification (Android 12+)
          style: {
            type: 5, // AndroidStyle.BIGTEXT
            text: `${callerName || callerId} is calling...`,
          },
          // Vibration pattern for call
          vibrationPattern: [0, 500, 250, 500, 250, 500, 250, 500],
          // LED light
          lights: ['#FF0000', 500, 500],
        },
      });

      console.log('[AndroidCallNotification] Displayed incoming call:', callId, callerName);
      return true;
    } catch (error) {
      console.error('[AndroidCallNotification] Failed to display notification:', error);
      return false;
    }
  }

  /**
   * Cancel the active call notification
   */
  async cancelNotification(): Promise<void> {
    if (!this.activeNotificationId) return;

    const noti = await loadNotifee();
    if (!noti) return;

    try {
      await noti.cancelNotification(this.activeNotificationId);
      console.log('[AndroidCallNotification] Cancelled notification:', this.activeNotificationId);
      this.activeNotificationId = null;
    } catch (error) {
      console.error('[AndroidCallNotification] Failed to cancel notification:', error);
    }
  }

  /**
   * Update the notification when call is answered (show "Call in progress")
   */
  async updateToInProgressCall(callId: string, callerName: string): Promise<void> {
    const noti = await loadNotifee();
    if (!noti || !this.activeNotificationId) return;

    try {
      await noti.displayNotification({
        id: this.activeNotificationId,
        title: 'Call in Progress',
        body: callerName,
        data: { callId },
        android: {
          channelId: CALL_CHANNEL_ID,
          ongoing: true,
          autoCancel: false,
          actions: [
            {
              title: 'End Call',
              pressAction: {
                id: 'decline',
              },
            },
          ],
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
        },
      });
    } catch (error) {
      console.error('[AndroidCallNotification] Failed to update notification:', error);
    }
  }

  /**
   * Check if the service is available
   */
  isAvailable(): boolean {
    return Platform.OS === 'android' && this.initialized;
  }
}

// Singleton instance
export const androidCallNotificationService = new AndroidCallNotificationService();
export default androidCallNotificationService;
