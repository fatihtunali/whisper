/**
 * CallKeep Service - Native Call UI Integration
 *
 * Provides native phone call UI for incoming/outgoing calls
 * - iOS: Uses CallKit for system call UI
 * - Android: Uses ConnectionService for system call UI
 *
 * NOTE: This service requires native module configuration via Expo config plugins
 * or manual native setup. It will gracefully degrade if the native module is unavailable.
 */

import { Platform } from 'react-native';

// CallKeep types
interface CallKeepOptions {
  ios: {
    appName: string;
    supportsVideo: boolean;
    maximumCallGroups: string;
    maximumCallsPerCallGroup: string;
    includesCallsInRecents: boolean;
  };
  android: {
    alertTitle: string;
    alertDescription: string;
    cancelButton: string;
    okButton: string;
    additionalPermissions: string[];
    selfManaged: boolean;
  };
}

type CallKeepEventHandler = (...args: any[]) => void;

let RNCallKeep: any = null;
let callKeepAvailable: boolean | null = null;

// Check if CallKeep native module is available at runtime
// This function is designed to NEVER throw - always returns a boolean
const checkCallKeepAvailable = (): boolean => {
  if (callKeepAvailable !== null) return callKeepAvailable;

  try {
    // Check if the native module exists before attempting to use it
    const { NativeModules } = require('react-native');
    // Double-check NativeModules exists and is an object
    if (!NativeModules || typeof NativeModules !== 'object') {
      callKeepAvailable = false;
      console.log('[CallKeepService] NativeModules not available - CallKeep features disabled');
      return false;
    }
    callKeepAvailable = !!(NativeModules.RNCallKeep);
    if (!callKeepAvailable) {
      console.log('[CallKeepService] Native module not available - CallKeep features disabled');
    }
    return callKeepAvailable;
  } catch (e) {
    callKeepAvailable = false;
    console.log('[CallKeepService] Native module check failed - CallKeep features disabled:', e);
    return false;
  }
};

class CallKeepService {
  private initialized: boolean = false;
  private initializationFailed: boolean = false;
  private activeCallId: string | null = null;
  private callHandlers: Map<string, CallKeepEventHandler> = new Map();

  // Callbacks for call events
  public onAnswerCall: ((callId: string) => void) | null = null;
  public onEndCall: ((callId: string) => void) | null = null;
  public onMuteCall: ((muted: boolean, callId: string) => void) | null = null;

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initializationFailed) return false;

    // Check if native module is available before attempting initialization
    if (!checkCallKeepAvailable()) {
      this.initializationFailed = true;
      return false;
    }

    try {
      // Dynamic import to handle cases where native module isn't available
      const CallKeepModule = await import('react-native-callkeep');
      RNCallKeep = CallKeepModule.default;

      if (!RNCallKeep || !RNCallKeep.setup) {
        console.warn('[CallKeepService] Module loaded but setup function not available');
        this.initializationFailed = true;
        return false;
      }

      const options: CallKeepOptions = {
        ios: {
          appName: 'Whisper',
          supportsVideo: true,
          maximumCallGroups: '1',
          maximumCallsPerCallGroup: '1',
          includesCallsInRecents: true,
        },
        android: {
          alertTitle: 'Permissions Required',
          alertDescription: 'Whisper needs access to make and manage calls',
          cancelButton: 'Cancel',
          okButton: 'OK',
          additionalPermissions: [],
          selfManaged: true,
        },
      };

      await RNCallKeep.setup(options);
      this.setupEventListeners();
      this.initialized = true;
      console.log('[CallKeepService] Initialized successfully');
      return true;
    } catch (error) {
      console.warn('[CallKeepService] Failed to initialize:', error);
      this.initializationFailed = true;
      RNCallKeep = null;
      return false;
    }
  }

  private setupEventListeners(): void {
    if (!RNCallKeep) return;

    // Answer call from native UI
    RNCallKeep.addEventListener('answerCall', ({ callUUID }: { callUUID: string }) => {
      console.log('[CallKeepService] Answer call:', callUUID);
      if (this.onAnswerCall) {
        this.onAnswerCall(callUUID);
      }
    });

    // End call from native UI
    RNCallKeep.addEventListener('endCall', ({ callUUID }: { callUUID: string }) => {
      console.log('[CallKeepService] End call:', callUUID);
      if (this.onEndCall) {
        this.onEndCall(callUUID);
      }
      this.activeCallId = null;
    });

    // Mute toggle from native UI
    RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted, callUUID }: { muted: boolean; callUUID: string }) => {
      console.log('[CallKeepService] Mute call:', muted, callUUID);
      if (this.onMuteCall) {
        this.onMuteCall(muted, callUUID);
      }
    });

    // DTMF (dial tones)
    RNCallKeep.addEventListener('didPerformDTMFAction', ({ digits, callUUID }: { digits: string; callUUID: string }) => {
      console.log('[CallKeepService] DTMF:', digits, callUUID);
    });

    // Hold call
    RNCallKeep.addEventListener('didToggleHoldCallAction', ({ hold, callUUID }: { hold: boolean; callUUID: string }) => {
      console.log('[CallKeepService] Hold call:', hold, callUUID);
    });

    // Audio session activated (iOS)
    if (Platform.OS === 'ios') {
      RNCallKeep.addEventListener('didActivateAudioSession', () => {
        console.log('[CallKeepService] Audio session activated');
      });
    }
  }

  // Display incoming call with native UI
  async displayIncomingCall(
    callId: string,
    callerName: string,
    callerNumber: string,
    isVideo: boolean = false
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!RNCallKeep) {
      console.warn('[CallKeepService] Not available, skipping native call UI');
      return;
    }

    try {
      this.activeCallId = callId;

      // Format caller display
      const displayName = callerName || callerNumber.substring(0, 16) + '...';

      RNCallKeep.displayIncomingCall(
        callId,
        callerNumber,
        displayName,
        'generic',
        isVideo
      );

      console.log('[CallKeepService] Displaying incoming call:', callId, displayName);
    } catch (error) {
      console.error('[CallKeepService] Failed to display incoming call:', error);
    }
  }

  // Start outgoing call with native UI
  async startCall(
    callId: string,
    calleeName: string,
    calleeNumber: string,
    isVideo: boolean = false
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!RNCallKeep) return;

    try {
      this.activeCallId = callId;

      RNCallKeep.startCall(
        callId,
        calleeNumber,
        calleeName || calleeNumber.substring(0, 16) + '...',
        'generic',
        isVideo
      );

      console.log('[CallKeepService] Started outgoing call:', callId);
    } catch (error) {
      console.error('[CallKeepService] Failed to start call:', error);
    }
  }

  // Report call connected
  reportCallConnected(callId: string): void {
    if (!RNCallKeep) return;

    try {
      RNCallKeep.setCurrentCallActive(callId);
      console.log('[CallKeepService] Call connected:', callId);
    } catch (error) {
      console.error('[CallKeepService] Failed to report call connected:', error);
    }
  }

  // End call
  endCall(callId?: string): void {
    if (!RNCallKeep) return;

    const id = callId || this.activeCallId;
    if (!id) return;

    try {
      RNCallKeep.endCall(id);
      this.activeCallId = null;
      console.log('[CallKeepService] Ended call:', id);
    } catch (error) {
      console.error('[CallKeepService] Failed to end call:', error);
    }
  }

  // Report call ended with reason
  reportEndCallWithReason(callId: string, reason: number): void {
    if (!RNCallKeep) return;

    try {
      RNCallKeep.reportEndCallWithUUID(callId, reason);
      if (this.activeCallId === callId) {
        this.activeCallId = null;
      }
      console.log('[CallKeepService] Reported call ended:', callId, reason);
    } catch (error) {
      console.error('[CallKeepService] Failed to report call ended:', error);
    }
  }

  // Set call on hold
  setOnHold(callId: string, hold: boolean): void {
    if (!RNCallKeep) return;

    try {
      RNCallKeep.setOnHold(callId, hold);
    } catch (error) {
      console.error('[CallKeepService] Failed to set hold:', error);
    }
  }

  // Set mute state
  setMutedCall(callId: string, muted: boolean): void {
    if (!RNCallKeep) return;

    try {
      RNCallKeep.setMutedCall(callId, muted);
    } catch (error) {
      console.error('[CallKeepService] Failed to set mute:', error);
    }
  }

  // Update display name
  updateDisplay(callId: string, displayName: string, handle: string): void {
    if (!RNCallKeep) return;

    try {
      RNCallKeep.updateDisplay(callId, displayName, handle);
    } catch (error) {
      console.error('[CallKeepService] Failed to update display:', error);
    }
  }

  // Check if there's an active call
  hasActiveCall(): boolean {
    return this.activeCallId !== null;
  }

  // Get active call ID
  getActiveCallId(): string | null {
    return this.activeCallId;
  }

  // End all calls
  endAllCalls(): void {
    if (!RNCallKeep) return;

    try {
      RNCallKeep.endAllCalls();
      this.activeCallId = null;
      console.log('[CallKeepService] Ended all calls');
    } catch (error) {
      console.error('[CallKeepService] Failed to end all calls:', error);
    }
  }

  // Check if CallKeep is available
  isAvailable(): boolean {
    return RNCallKeep !== null && this.initialized;
  }

  // Remove all event listeners
  cleanup(): void {
    if (!RNCallKeep) return;

    // Remove each listener individually to ensure all are attempted even if one fails
    const listeners = [
      'answerCall',
      'endCall',
      'didPerformSetMutedCallAction',
      'didPerformDTMFAction',
      'didToggleHoldCallAction',
    ];

    // Add iOS-specific listener
    if (Platform.OS === 'ios') {
      listeners.push('didActivateAudioSession');
    }

    for (const listener of listeners) {
      try {
        RNCallKeep.removeEventListener(listener);
      } catch (error) {
        console.warn(`[CallKeepService] Failed to remove listener ${listener}:`, error);
      }
    }
  }
}

// Singleton instance
export const callKeepService = new CallKeepService();
export default callKeepService;
