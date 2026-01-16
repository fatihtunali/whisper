/**
 * Background Notification Handler
 *
 * Handles notifications when the app is in background or killed.
 * Must be imported and registered early in the app lifecycle.
 *
 * NOTE: There are known issues with expo-notifications + registerTaskAsync
 * when app is killed (Expo issue #38223). For incoming calls:
 * - iOS: VoIP push + CallKit handles this natively
 * - Android: FCM high-priority + CallKeep foreground service
 */

import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

// Define the background task - must be done in module scope
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error, executionInfo }) => {
  if (error) {
    console.error('[BackgroundNotification] Task error:', error);
    return;
  }

  console.log('[BackgroundNotification] Received background notification:', JSON.stringify(data));

  const notification = data as Notifications.Notification;
  const notificationData = notification?.request?.content?.data;

  if (!notificationData) {
    console.log('[BackgroundNotification] No notification data');
    return;
  }

  // Handle incoming call notifications
  if (notificationData.type === 'incoming_call') {
    const { callId, fromWhisperId, callerName, isVideo } = notificationData as {
      callId: string;
      fromWhisperId: string;
      callerName: string;
      isVideo: boolean;
    };

    console.log('[BackgroundNotification] Incoming call from:', fromWhisperId);

    // On Android, we need to display a call notification with full-screen intent
    // CallKeep will handle this if the app has been initialized
    if (Platform.OS === 'android') {
      try {
        // Import CallKeep dynamically to avoid module load issues
        const { NativeModules } = require('react-native');
        if (NativeModules.RNCallKeep) {
          const RNCallKeep = require('react-native-callkeep').default;
          RNCallKeep.displayIncomingCall(
            callId,
            fromWhisperId,
            callerName || 'Incoming Call',
            'generic',
            isVideo || false
          );
        } else {
          // Fallback: show a high-priority notification
          await Notifications.scheduleNotificationAsync({
            content: {
              title: isVideo ? 'Incoming Video Call' : 'Incoming Call',
              body: `${callerName || 'Unknown'} is calling...`,
              data: notificationData,
              sound: 'default',
              priority: Notifications.AndroidNotificationPriority.MAX,
              categoryIdentifier: 'incoming_call',
            },
            trigger: null,
          });
        }
      } catch (e) {
        console.error('[BackgroundNotification] Failed to display call:', e);
      }
    }
    // iOS is handled by VoIP push + CallKit in withVoipPushDelegate.js
  }

  // Handle message notifications
  if (notificationData.type === 'message') {
    console.log('[BackgroundNotification] New message received');
    // Messages are displayed automatically by the notification system
    // No additional handling needed
  }
});

// Register the background task
export async function registerBackgroundNotificationTask(): Promise<void> {
  try {
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);

    if (!isRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      console.log('[BackgroundNotification] Task registered successfully');
    } else {
      console.log('[BackgroundNotification] Task already registered');
    }
  } catch (error) {
    console.error('[BackgroundNotification] Failed to register task:', error);
    // Non-fatal - notifications will still work, just not headless background processing
  }
}

// Unregister the background task (for cleanup)
export async function unregisterBackgroundNotificationTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);

    if (isRegistered) {
      await Notifications.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      console.log('[BackgroundNotification] Task unregistered');
    }
  } catch (error) {
    console.error('[BackgroundNotification] Failed to unregister task:', error);
  }
}
