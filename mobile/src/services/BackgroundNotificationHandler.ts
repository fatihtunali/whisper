/**
 * Background Notification Handler
 *
 * Handles notifications when the app is in background or killed.
 * Must be imported and registered early in the app lifecycle.
 *
 * NOTE: There are known issues with expo-notifications + registerTaskAsync
 * when app is killed (Expo issue #38223). For incoming calls:
 * - iOS: VoIP push + CallKit handles this natively
 * - Android: Uses @notifee/react-native for full-screen call notifications
 */

import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { generateUUID } from '../utils/helpers';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

// Check if string is valid UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper function to display Android call notification using notifee
async function displayAndroidCallNotification(
  callId: string,
  fromWhisperId: string,
  callerName: string,
  isVideo: boolean
): Promise<boolean> {
  try {
    // Try to use notifee for full-screen call notification
    const { NativeModules } = require('react-native');
    if (NativeModules.NotifeeApiModule) {
      const notifee = require('@notifee/react-native').default;

      // Create channel if needed
      await notifee.createChannel({
        id: 'whisper-incoming-calls',
        name: 'Incoming Calls',
        importance: 4, // HIGH
        sound: 'default',
        vibration: true,
        bypassDnd: true,
      });

      // Display full-screen call notification
      await notifee.displayNotification({
        id: `call-${callId}`,
        title: isVideo ? 'Incoming Video Call' : 'Incoming Call',
        body: callerName || fromWhisperId,
        data: {
          callId,
          fromWhisperId,
          isVideo: String(isVideo),
          type: 'incoming_call',
        },
        android: {
          channelId: 'whisper-incoming-calls',
          category: 2, // CALL
          importance: 4, // HIGH
          ongoing: true,
          autoCancel: false,
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: 'Answer',
              pressAction: { id: 'answer', launchActivity: 'default' },
            },
            {
              title: 'Decline',
              pressAction: { id: 'decline' },
            },
          ],
          pressAction: { id: 'default', launchActivity: 'default' },
          visibility: 1, // PUBLIC
          vibrationPattern: [0, 500, 250, 500, 250, 500],
        },
      });

      console.log('[BackgroundNotification] Displayed notifee call notification');
      return true;
    }
  } catch (e) {
    console.warn('[BackgroundNotification] Notifee not available:', e);
  }

  // Fallback to CallKeep
  try {
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
      console.log('[BackgroundNotification] Displayed CallKeep call notification');
      return true;
    }
  } catch (e) {
    console.warn('[BackgroundNotification] CallKeep not available:', e);
  }

  return false;
}

// Define the background task - must be done in module scope
// Wrap in try-catch to prevent crashes on iOS when runtime isn't ready
try {
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
    let { callId, fromWhisperId, callerName, isVideo } = notificationData as {
      callId: string;
      fromWhisperId: string;
      callerName: string;
      isVideo: boolean;
    };

    // Validate callId is proper UUID format
    if (!callId || typeof callId !== 'string' || !isValidUUID(callId)) {
      console.warn('[BackgroundNotification] Invalid callId, generating fallback UUID');
      callId = generateUUID();
    }

    console.log('[BackgroundNotification] Incoming call from:', fromWhisperId, 'callId:', callId);

    // On Android, display full-screen call notification
    if (Platform.OS === 'android') {
      const success = await displayAndroidCallNotification(
        callId,
        fromWhisperId,
        callerName,
        isVideo || false
      );

      // Ultimate fallback: show high-priority notification
      if (!success) {
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
} catch (e) {
  console.warn('[BackgroundNotification] Failed to define task (may be normal in Expo Go):', e);
}

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
