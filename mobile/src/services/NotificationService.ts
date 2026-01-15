import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { callKeepService } from './CallKeepService';
import { voipPushService } from './VoIPPushService';
import { messagingService } from './MessagingService';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Note: Background notification handling is done via setNotificationHandler above
// which handles both foreground and background notifications on iOS/Android

class NotificationService {
  private pushToken: string | null = null;
  private voipToken: string | null = null;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  // Callback for incoming calls (for navigation)
  public onIncomingCall: ((callId: string, fromWhisperId: string, isVideo: boolean, callerName: string) => void) | null = null;

  // Initialize notifications and get push token
  async initialize(): Promise<string | null> {
    try {
      // Check if physical device (push notifications don't work on simulators)
      if (!Device.isDevice) {
        console.log('[NotificationService] Must use physical device for push notifications');
        return null;
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[NotificationService] Permission not granted');
        return null;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '395d7567-88ca-4a3e-bb59-676bda71ba5e', // From app.json
      });
      this.pushToken = tokenData.data;
      console.log('[NotificationService] Push token:', this.pushToken);

      // Set up Android notification channels
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366f1',
          sound: 'default',
        });

        // Channel for incoming calls with higher priority
        await Notifications.setNotificationChannelAsync('calls', {
          name: 'Incoming Calls',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 250, 500, 250, 500],
          lightColor: '#22c55e',
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
        });
      }

      // Initialize CallKeep for native call UI (non-blocking, gracefully handles unavailability)
      try {
        await callKeepService.initialize();
      } catch (e) {
        console.warn('[NotificationService] CallKeep initialization failed (native module may not be available):', e);
      }

      // Set platform on messaging service
      messagingService.setPlatform(Platform.OS as 'ios' | 'android' | 'unknown');

      // Initialize VoIP push for iOS (non-blocking, gracefully handles unavailability)
      if (Platform.OS === 'ios') {
        try {
          await voipPushService.initialize();
        } catch (e) {
          console.warn('[NotificationService] VoIP push initialization failed (native module may not be available):', e);
        }

        // Handle VoIP push received
        voipPushService.onNotification = (notification) => {
          this.handleVoIPPush(notification);
        };

        // Store VoIP token when received and notify messaging service
        voipPushService.onTokenReceived = (token) => {
          this.voipToken = token;
          messagingService.setVoIPToken(token);
          console.log('[NotificationService] VoIP token received');
        };

        // Also check if token is already available
        const existingVoIPToken = voipPushService.getToken();
        if (existingVoIPToken) {
          this.voipToken = existingVoIPToken;
          messagingService.setVoIPToken(existingVoIPToken);
        }
      }

      return this.pushToken;
    } catch (error) {
      console.error('[NotificationService] Error initializing:', error);
      return null;
    }
  }

  // Handle VoIP push notification (iOS)
  private handleVoIPPush(notification: any): void {
    console.log('[NotificationService] Handling VoIP push:', notification);

    const { callId, fromWhisperId, callerName, isVideo } = notification;

    if (callId && fromWhisperId) {
      // Display native call UI
      callKeepService.displayIncomingCall(
        callId,
        callerName || 'Unknown Caller',
        fromWhisperId,
        isVideo || false
      );

      // Notify app about incoming call
      if (this.onIncomingCall) {
        this.onIncomingCall(callId, fromWhisperId, isVideo || false, callerName || 'Unknown');
      }
    }
  }

  // Get VoIP token (iOS only)
  getVoIPToken(): string | null {
    return this.voipToken;
  }

  // Get the current push token
  getPushToken(): string | null {
    return this.pushToken;
  }

  // Set up notification listeners
  setupListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ): void {
    // Listener for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[NotificationService] Notification received:', notification);
        onNotificationReceived?.(notification);
      }
    );

    // Listener for when user taps on notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[NotificationService] Notification tapped:', response);
        onNotificationResponse?.(response);
      }
    );

    // Check for notification that launched the app (when app was killed)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        console.log('[NotificationService] App launched from notification:', response);
        onNotificationResponse?.(response);
      }
    });
  }

  // Remove notification listeners
  removeListeners(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  // Schedule a local notification (for testing)
  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: null, // Immediately
    });
  }

  // Show incoming call notification with native call UI
  async showIncomingCallNotification(
    callerName: string,
    callId: string,
    fromWhisperId: string,
    isVideo: boolean
  ): Promise<string> {
    // Use CallKeep for native call UI (works even when app is backgrounded)
    if (callKeepService.isAvailable()) {
      await callKeepService.displayIncomingCall(
        callId,
        callerName,
        fromWhisperId,
        isVideo
      );
      console.log('[NotificationService] Displayed native call UI via CallKeep');
      return callId;
    }

    // Fallback to regular notification if CallKeep isn't available
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: isVideo ? 'Incoming Video Call' : 'Incoming Call',
        body: `${callerName} is calling...`,
        data: {
          type: 'incoming_call',
          callId,
          fromWhisperId,
          isVideo,
        },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        sticky: true,
      },
      trigger: null,
    });
    console.log('[NotificationService] Showing incoming call notification:', notificationId);
    return notificationId;
  }

  // Report call connected (for native UI)
  reportCallConnected(callId: string): void {
    if (callKeepService.isAvailable()) {
      callKeepService.reportCallConnected(callId);
    }
  }

  // End call in native UI
  endCallNotification(callId: string): void {
    if (callKeepService.isAvailable()) {
      callKeepService.endCall(callId);
    }
  }

  // Dismiss a specific notification
  async dismissNotification(notificationId: string): Promise<void> {
    await Notifications.dismissNotificationAsync(notificationId);
  }

  // Clear all notifications
  async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
  }

  // Set badge count
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }
}

export const notificationService = new NotificationService();
export default notificationService;
