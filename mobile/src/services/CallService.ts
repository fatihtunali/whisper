import { CallSession, CallState, Contact } from '../types';
import { generateId } from '../utils/helpers';
import { messagingService } from './MessagingService';
import { callKeepService } from './CallKeepService';

// InCallManager for audio routing (speaker, proximity sensor, etc.)
let InCallManager: any = null;
let inCallManagerAvailable: boolean | null = null;
let inCallManagerLoadAttempted: boolean = false;

// WebRTC availability tracking
let webrtcAvailable: boolean | null = null;
let webrtcLoadAttempted: boolean = false;
let webrtcModule: any = null;

// Check if InCallManager native module is available at runtime
// This function is designed to NEVER throw - always returns a boolean
const checkInCallManagerAvailable = (): boolean => {
  if (inCallManagerAvailable !== null) return inCallManagerAvailable;

  try {
    // Check if the native module exists before attempting to use it
    const { NativeModules } = require('react-native');
    // Double-check NativeModules exists and is an object
    if (!NativeModules || typeof NativeModules !== 'object') {
      inCallManagerAvailable = false;
      console.log('[CallService] NativeModules not available - InCallManager features disabled');
      return false;
    }
    inCallManagerAvailable = !!(NativeModules.InCallManager);
    if (!inCallManagerAvailable) {
      console.log('[CallService] InCallManager native module not available - audio features limited');
    }
    return inCallManagerAvailable;
  } catch (e) {
    inCallManagerAvailable = false;
    console.log('[CallService] InCallManager native module check failed:', e);
    return false;
  }
};

const loadInCallManager = async () => {
  if (InCallManager) return InCallManager;
  if (inCallManagerLoadAttempted && !InCallManager) return null;

  // Check availability before loading
  if (!checkInCallManagerAvailable()) {
    inCallManagerLoadAttempted = true;
    return null;
  }

  try {
    inCallManagerLoadAttempted = true;
    const module = await import('react-native-incall-manager');
    InCallManager = module.default;
    if (!InCallManager || !InCallManager.start) {
      console.warn('[CallService] InCallManager module loaded but required functions not available');
      InCallManager = null;
      return null;
    }
    return InCallManager;
  } catch (e) {
    console.warn('[CallService] InCallManager not available:', e);
    InCallManager = null;
    return null;
  }
};

// DeviceEventEmitter for InCallManager events
let DeviceEventEmitter: any = null;
const getDeviceEventEmitter = () => {
  if (!DeviceEventEmitter) {
    const { DeviceEventEmitter: Emitter } = require('react-native');
    DeviceEventEmitter = Emitter;
  }
  return DeviceEventEmitter;
};

// Check if WebRTC native module is available at runtime
// This function is designed to NEVER throw - always returns a boolean
const checkWebRTCAvailable = (): boolean => {
  if (webrtcAvailable !== null) return webrtcAvailable;

  try {
    // Check if the native module exists before attempting to use it
    const { NativeModules } = require('react-native');
    if (!NativeModules || typeof NativeModules !== 'object') {
      webrtcAvailable = false;
      console.log('[CallService] NativeModules not available - WebRTC disabled');
      return false;
    }
    // react-native-webrtc registers as WebRTCModule
    webrtcAvailable = !!(NativeModules.WebRTCModule);
    if (!webrtcAvailable) {
      console.log('[CallService] WebRTCModule native module not available - calls disabled');
    } else {
      console.log('[CallService] WebRTCModule native module available');
    }
    return webrtcAvailable;
  } catch (e) {
    webrtcAvailable = false;
    console.log('[CallService] WebRTC native module check failed:', e);
    return false;
  }
};

// Load WebRTC module with error handling
const loadWebRTCModule = async (): Promise<any | null> => {
  if (webrtcModule) return webrtcModule;
  if (webrtcLoadAttempted && !webrtcModule) return null;

  // Check availability before loading
  if (!checkWebRTCAvailable()) {
    webrtcLoadAttempted = true;
    return null;
  }

  try {
    webrtcLoadAttempted = true;
    const module = await import('react-native-webrtc');
    if (!module || !module.mediaDevices || !module.RTCPeerConnection) {
      console.warn('[CallService] WebRTC module loaded but required exports not available');
      webrtcModule = null;
      return null;
    }
    webrtcModule = module;
    console.log('[CallService] WebRTC module loaded successfully');
    return webrtcModule;
  } catch (e) {
    console.warn('[CallService] Failed to load WebRTC module:', e);
    webrtcModule = null;
    return null;
  }
};

// Default STUN servers (fallback)
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:turn.sarjmobile.com:3479' },
];

// TURN credentials interface
interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
  urls: string[];
}

type CallStateHandler = (state: CallState) => void;
type RemoteStreamHandler = (stream: MediaStream | null) => void;
type IncomingCallHandler = (callId: string, contactId: string, isVideo: boolean) => void;

class CallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentSession: CallSession | null = null;

  // Event handlers
  private callStateHandler: CallStateHandler | null = null;
  private remoteStreamHandler: RemoteStreamHandler | null = null;
  private incomingCallHandler: IncomingCallHandler | null = null;

  // Pending ICE candidates (received before remote description is set)
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  // TURN credentials
  private turnCredentials: TurnCredentials | null = null;
  private turnCredentialsExpiry: number = 0;

  // Cleanup state to prevent race conditions
  private isCleaningUp: boolean = false;
  private cleanupCompleteTime: number = 0;

  // Audio event subscriptions
  private mediaButtonSubscription: any = null;
  private wiredHeadsetSubscription: any = null;
  private audioEventsSetup: boolean = false;

  // Callback for headphone button answer (to be set by UI)
  public onHeadphoneAnswer: (() => void) | null = null;
  public onHeadphoneHangup: (() => void) | null = null;

  constructor() {
    // Set up signaling message handlers
    this.setupSignalingHandlers();
  }

  // Set up audio event listeners for headphone button support
  private setupAudioEventListeners(): void {
    if (this.audioEventsSetup) return;

    try {
      const emitter = getDeviceEventEmitter();
      if (!emitter) {
        console.warn('[CallService] DeviceEventEmitter not available');
        return;
      }

      // MediaButton event - fired when headphone button is pressed
      // This handles both wired and Bluetooth headphone buttons
      this.mediaButtonSubscription = emitter.addListener('MediaButton', (data: any) => {
        console.log('[CallService] MediaButton event:', data);

        // data.eventText can be: 'cycleHeadset', 'cycleHeadsetDouble', etc.
        // Single press: answer call if ringing, hang up if connected
        // Double press: typically reject/hang up

        if (!this.currentSession) return;

        const state = this.currentSession.state;

        if (data.eventText === 'cycleHeadset' || data.eventText === 'cycleHeadsetSingle') {
          if (state === 'ringing' && this.currentSession.isIncoming) {
            // Answer incoming call with headphone button
            console.log('[CallService] Answering call via headphone button');
            if (this.onHeadphoneAnswer) {
              this.onHeadphoneAnswer();
            }
          } else if (state === 'connected' || state === 'connecting') {
            // End active call with headphone button
            console.log('[CallService] Ending call via headphone button');
            if (this.onHeadphoneHangup) {
              this.onHeadphoneHangup();
            } else {
              this.endCall();
            }
          }
        } else if (data.eventText === 'cycleHeadsetDouble') {
          // Double press - reject or hang up
          if (state === 'ringing' && this.currentSession.isIncoming) {
            console.log('[CallService] Rejecting call via headphone double-press');
            this.rejectCall(this.currentSession.callId, this.currentSession.contactId);
          } else if (state === 'connected' || state === 'connecting') {
            console.log('[CallService] Ending call via headphone double-press');
            this.endCall();
          }
        }
      });

      // WiredHeadset event - fired when headset is plugged in/out
      this.wiredHeadsetSubscription = emitter.addListener('WiredHeadset', (data: any) => {
        console.log('[CallService] WiredHeadset event:', data);
        // data.isPlugged: true/false
        // data.hasMic: true/false
        // data.deviceName: string

        // When headset is plugged in during a call, audio automatically routes to it
        // No action needed - InCallManager handles this with auto: true
      });

      this.audioEventsSetup = true;
      console.log('[CallService] Audio event listeners set up for headphone support');
    } catch (e) {
      console.warn('[CallService] Failed to set up audio event listeners:', e);
    }
  }

  // Remove audio event listeners
  private removeAudioEventListeners(): void {
    if (this.mediaButtonSubscription) {
      try {
        this.mediaButtonSubscription.remove();
      } catch (e) {
        console.warn('[CallService] Failed to remove mediaButton listener:', e);
      }
      this.mediaButtonSubscription = null;
    }
    if (this.wiredHeadsetSubscription) {
      try {
        this.wiredHeadsetSubscription.remove();
      } catch (e) {
        console.warn('[CallService] Failed to remove wiredHeadset listener:', e);
      }
      this.wiredHeadsetSubscription = null;
    }
    this.audioEventsSetup = false;
  }

  // Request TURN credentials from server
  async requestTurnCredentials(): Promise<TurnCredentials | null> {
    // Check if we have valid cached credentials
    if (this.turnCredentials && Date.now() < this.turnCredentialsExpiry) {
      console.log('[CallService] Using cached TURN credentials');
      return this.turnCredentials;
    }

    try {
      // Request credentials via WebSocket
      const response = await new Promise<TurnCredentials | null>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[CallService] TURN credentials request timed out');
          resolve(null);
        }, 5000);

        // Set up one-time listener for turn_credentials response
        const originalHandler = (messagingService as any).turnCredentialsHandler;
        (messagingService as any).turnCredentialsHandler = (credentials: TurnCredentials) => {
          clearTimeout(timeout);
          (messagingService as any).turnCredentialsHandler = originalHandler;
          resolve(credentials);
        };

        // Send request
        (messagingService as any).send({ type: 'get_turn_credentials', payload: {} });
      });

      if (response) {
        this.turnCredentials = response;
        // Set expiry with safety margin (10% of TTL or 5 minutes, whichever is smaller)
        const safetyMargin = Math.min(response.ttl * 0.1, 300); // max 5 minutes
        this.turnCredentialsExpiry = Date.now() + Math.max(0, response.ttl - safetyMargin) * 1000;
        console.log('[CallService] TURN credentials received, TTL:', response.ttl);
      }

      return response;
    } catch (error) {
      console.error('[CallService] Failed to get TURN credentials:', error);
      return null;
    }
  }

  // Build ICE servers config with TURN credentials
  private async getIceServers(): Promise<RTCIceServer[]> {
    const credentials = await this.requestTurnCredentials();

    if (credentials) {
      return [
        ...DEFAULT_ICE_SERVERS,
        ...credentials.urls.map(url => ({
          urls: url,
          username: credentials.username,
          credential: credentials.credential,
        })),
      ];
    }

    // Fallback to default STUN only
    console.warn('[CallService] Using default ICE servers (no TURN)');
    return DEFAULT_ICE_SERVERS;
  }

  // Set event handlers
  setCallStateHandler(handler: CallStateHandler | null): void {
    this.callStateHandler = handler;
  }

  setRemoteStreamHandler(handler: RemoteStreamHandler | null): void {
    this.remoteStreamHandler = handler;
  }

  setIncomingCallHandler(handler: IncomingCallHandler | null): void {
    this.incomingCallHandler = handler;
  }

  // Get current session
  getCurrentSession(): CallSession | null {
    return this.currentSession;
  }

  // Get local stream
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Get remote stream
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  // Check if calling is available (WebRTC module loaded)
  async isCallAvailable(): Promise<boolean> {
    try {
      const webrtc = await loadWebRTCModule();
      return webrtc !== null;
    } catch (e) {
      console.warn('[CallService] isCallAvailable check failed:', e);
      return false;
    }
  }

  // Synchronous check for WebRTC availability (use after initial check)
  isCallAvailableSync(): boolean {
    return checkWebRTCAvailable();
  }

  // Initialize media stream (audio + optional video)
  async initializeMedia(isVideo: boolean): Promise<MediaStream> {
    console.log('[CallService] initializeMedia starting, isVideo:', isVideo);

    try {
      // First check if WebRTC is available
      const webrtc = await loadWebRTCModule();
      if (!webrtc) {
        console.error('[CallService] WebRTC module not available');
        throw new Error('WebRTC is not available on this device. Voice and video calls cannot be made.');
      }

      const { mediaDevices } = webrtc;
      if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
        console.error('[CallService] mediaDevices.getUserMedia not available');
        throw new Error('Media devices are not available on this device.');
      }

      // Request media with constraints
      const constraints = {
        audio: true,
        video: isVideo ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } : false,
      };

      console.log('[CallService] Requesting getUserMedia with constraints:', JSON.stringify(constraints));

      // Use react-native-webrtc's mediaDevices with timeout
      const mediaPromise = mediaDevices.getUserMedia(constraints);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getUserMedia timeout after 10 seconds')), 10000)
      );

      const stream = await Promise.race([mediaPromise, timeoutPromise]);

      if (!stream) {
        throw new Error('getUserMedia returned null stream');
      }

      this.localStream = stream as unknown as MediaStream;
      console.log('[CallService] Local media stream initialized successfully');
      return this.localStream;
    } catch (error: any) {
      console.error('[CallService] Failed to get user media:', error?.message || error);
      // Re-throw with a user-friendly message
      if (error?.message?.includes('not available')) {
        throw error;
      }
      throw new Error(`Could not access microphone${isVideo ? ' or camera' : ''}. Please check permissions and try again.`);
    }
  }

  // Check if there's a stale session that should be cleaned up
  private isSessionStale(): boolean {
    if (!this.currentSession) return false;

    // Session is stale if:
    // 1. State is 'ended'
    // 2. Session has been in 'calling', 'ringing', or 'connecting' state for too long
    const state = this.currentSession.state;

    if (state === 'ended') return true;

    // Check timeout for pre-connected states
    if (state === 'calling' || state === 'ringing') {
      // Check if stuck for more than 60 seconds
      const sessionAge = this.currentSession.startTime
        ? Date.now() - this.currentSession.startTime
        : 60001; // If no startTime, assume stale
      if (sessionAge > 60000) {
        console.log('[CallService] Session stale - stuck in', state, 'for', sessionAge, 'ms');
        return true;
      }
    }

    // Connecting state has shorter timeout (30 seconds) since it should complete quickly
    if (state === 'connecting') {
      const sessionAge = this.currentSession.startTime
        ? Date.now() - this.currentSession.startTime
        : 30001;
      if (sessionAge > 30000) {
        console.log('[CallService] Session stale - stuck in connecting for', sessionAge, 'ms');
        return true;
      }
    }

    return false;
  }

  // Start an outgoing call
  async startCall(contact: Contact, isVideo: boolean): Promise<string> {
    console.log('[CallService] startCall initiated for', contact.whisperId, 'isVideo:', isVideo);

    // FIRST: Check if WebRTC is available before doing anything else
    try {
      const webrtc = await loadWebRTCModule();
      if (!webrtc) {
        console.error('[CallService] WebRTC not available, cannot start call');
        throw new Error('Voice and video calls are not available on this device. Please try reinstalling the app.');
      }
    } catch (e: any) {
      console.error('[CallService] WebRTC availability check failed:', e);
      throw new Error(e?.message || 'Calls are not available on this device.');
    }

    // Check if cleanup is in progress - but reset if stuck too long
    if (this.isCleaningUp) {
      console.log('[CallService] Cleanup was in progress, forcing reset...');
      await this.forceReset();
    }

    // Clean up stale sessions
    if (this.isSessionStale()) {
      console.log('[CallService] Found stale session, forcing reset...');
      await this.forceReset();
    }

    // Wait a bit after cleanup to ensure resources are released
    const timeSinceCleanup = Date.now() - this.cleanupCompleteTime;
    if (this.cleanupCompleteTime > 0 && timeSinceCleanup < 500) {
      console.log('[CallService] Waiting for cleanup to settle...');
      await new Promise(resolve => setTimeout(resolve, 500 - timeSinceCleanup));
    }

    if (this.currentSession) {
      throw new Error('Call already in progress');
    }

    const callId = generateId();

    // Create session - video calls default to speaker ON
    this.currentSession = {
      callId,
      contactId: contact.whisperId,
      isIncoming: false,
      isVideo,
      state: 'calling',
      isMuted: false,
      isSpeakerOn: isVideo, // Video calls use speaker by default
      isCameraOn: isVideo,
      isFrontCamera: true,
    };

    // Start InCallManager for audio routing
    const manager = await loadInCallManager();
    if (manager) {
      try {
        // Start with appropriate media type
        // - audio: enables proximity sensor (screen off when near ear), routes to earpiece
        // - video: disables proximity, routes to speaker, keeps screen on
        manager.start({
          media: isVideo ? 'video' : 'audio',
          auto: true, // Auto manage audio routing based on events (headset, etc.)
          ringback: '_DTMF_', // Play ringback tone while calling
        });
        manager.setSpeakerphoneOn(isVideo); // Speaker on for video calls
        manager.setKeepScreenOn(true); // Keep screen on during call
        console.log('[CallService] InCallManager started for', isVideo ? 'video' : 'audio');
      } catch (e) {
        console.warn('[CallService] Failed to start InCallManager:', e);
      }
    }

    // Set up headphone button listeners
    this.setupAudioEventListeners();

    this.notifyStateChange('calling');

    try {
      // Initialize local media
      console.log('[CallService] Initializing media for', isVideo ? 'video' : 'audio', 'call');
      await this.initializeMedia(isVideo);
      console.log('[CallService] Media initialized successfully');

      // Create peer connection
      console.log('[CallService] Creating peer connection');
      await this.createPeerConnection();
      console.log('[CallService] Peer connection created');

      // Add local tracks to peer connection
      if (this.localStream && this.peerConnection) {
        const tracks = this.localStream.getTracks();
        if (tracks && tracks.length > 0) {
          console.log('[CallService] Adding', tracks.length, 'local tracks to peer connection');
          tracks.forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
          });
        } else {
          console.warn('[CallService] No local tracks available to add');
        }
      }

      // Create offer
      console.log('[CallService] Creating SDP offer');
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });
      console.log('[CallService] SDP offer created');

      await this.peerConnection!.setLocalDescription(offer);
      console.log('[CallService] Local description set');

      // Send call offer via signaling (include isVideo flag)
      console.log('[CallService] Sending call_offer to', contact.whisperId);
      this.sendSignalingMessage(contact.whisperId, {
        type: 'call_offer',
        callId,
        sdp: offer.sdp,
        isVideo,
      });

      console.log('[CallService] Outgoing call started:', callId);
      return callId;
    } catch (error) {
      console.error('[CallService] Failed to start call:', error);
      // Await endCall to ensure cleanup completes before throwing
      await this.endCall();
      throw error;
    }
  }

  // Accept an incoming call
  async acceptCall(callId: string, contactId: string, isVideo: boolean, remoteSdp: string): Promise<void> {
    console.log('[CallService] acceptCall for callId:', callId, 'isVideo:', isVideo);

    // FIRST: Check if WebRTC is available before doing anything else
    try {
      const webrtc = await loadWebRTCModule();
      if (!webrtc) {
        console.error('[CallService] WebRTC not available, cannot accept call');
        throw new Error('Voice and video calls are not available on this device.');
      }
    } catch (e: any) {
      console.error('[CallService] WebRTC availability check failed:', e);
      throw new Error(e?.message || 'Cannot accept call - calls not available.');
    }

    if (this.currentSession && this.currentSession.callId !== callId) {
      throw new Error('Another call already in progress');
    }

    // Update session - video calls default to speaker ON
    this.currentSession = {
      callId,
      contactId,
      isIncoming: true,
      isVideo,
      state: 'connecting',
      isMuted: false,
      isSpeakerOn: isVideo, // Video calls use speaker by default
      isCameraOn: isVideo,
      isFrontCamera: true,
    };

    // Start InCallManager for audio routing
    const manager = await loadInCallManager();
    if (manager) {
      try {
        // Start with appropriate media type
        // - audio: enables proximity sensor (screen off when near ear), routes to earpiece
        // - video: disables proximity, routes to speaker, keeps screen on
        manager.start({
          media: isVideo ? 'video' : 'audio',
          auto: true, // Auto manage audio routing based on events (headset, etc.)
        });
        manager.setSpeakerphoneOn(isVideo); // Speaker on for video calls
        manager.setKeepScreenOn(true); // Keep screen on during call
        console.log('[CallService] InCallManager started for incoming', isVideo ? 'video' : 'audio');
      } catch (e) {
        console.warn('[CallService] Failed to start InCallManager:', e);
      }
    }

    // Set up headphone button listeners
    this.setupAudioEventListeners();

    this.notifyStateChange('connecting');

    try {
      // Initialize local media
      console.log('[CallService] Accepting call - initializing media for', isVideo ? 'video' : 'audio');
      await this.initializeMedia(isVideo);
      console.log('[CallService] Media initialized for accepting call');

      // Create peer connection
      console.log('[CallService] Creating peer connection for incoming call');
      await this.createPeerConnection();
      console.log('[CallService] Peer connection created');

      // Add local tracks
      if (this.localStream && this.peerConnection) {
        const tracks = this.localStream.getTracks();
        if (tracks && tracks.length > 0) {
          console.log('[CallService] Adding', tracks.length, 'local tracks');
          tracks.forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
          });
        } else {
          console.warn('[CallService] No local tracks available to add');
        }
      }

      // Set remote description (the offer)
      console.log('[CallService] Setting remote description (offer)');
      await this.peerConnection!.setRemoteDescription({
        type: 'offer',
        sdp: remoteSdp,
      });
      console.log('[CallService] Remote description set');

      // Process any pending ICE candidates
      console.log('[CallService] Processing', this.pendingIceCandidates.length, 'pending ICE candidates');
      await this.processPendingIceCandidates();

      // Create answer
      console.log('[CallService] Creating SDP answer');
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);
      console.log('[CallService] Local description (answer) set');

      // Send answer via signaling
      console.log('[CallService] Sending call_answer to', contactId);
      this.sendSignalingMessage(contactId, {
        type: 'call_answer',
        callId,
        sdp: answer.sdp,
      });

      console.log('[CallService] Call accepted:', callId);
    } catch (error) {
      console.error('[CallService] Failed to accept call:', error);
      // Await endCall to ensure cleanup completes before throwing
      await this.endCall();
      throw error;
    }
  }

  // Reject an incoming call
  async rejectCall(callId: string, contactId: string): Promise<void> {
    // Prevent multiple reject invocations
    if (this.isCleaningUp) {
      console.log('[CallService] Already cleaning up, ignoring reject');
      return;
    }

    // Set cleanup flag immediately
    this.isCleaningUp = true;

    try {
      this.sendSignalingMessage(contactId, {
        type: 'call_reject',
        callId,
      });
    } catch (e) {
      console.warn('[CallService] Failed to send call_reject signal:', e);
    }

    // Store session for cleanup and clear immediately
    const sessionToClean = this.currentSession;
    this.currentSession = null;

    await this.cleanup(sessionToClean, true);
    console.log('[CallService] Call rejected:', callId);
  }

  // End the current call
  async endCall(): Promise<void> {
    // Prevent multiple endCall invocations - set flag immediately to prevent races
    if (this.isCleaningUp) {
      console.log('[CallService] Already ending call, ignoring duplicate');
      return;
    }

    // Set cleanup flag IMMEDIATELY to prevent race conditions
    this.isCleaningUp = true;

    // Store session info before clearing for cleanup
    const sessionToClean = this.currentSession;

    // Clear session immediately to allow new calls
    this.currentSession = null;

    if (sessionToClean) {
      // Notify remote peer - wrap in try-catch to ensure cleanup continues
      try {
        this.sendSignalingMessage(sessionToClean.contactId, {
          type: 'call_end',
          callId: sessionToClean.callId,
        });
      } catch (e) {
        console.warn('[CallService] Failed to send call_end signal:', e);
      }
    }

    this.notifyStateChange('ended');
    console.log('[CallService] Call ended');

    // Run cleanup with timeout to prevent hanging
    try {
      const cleanupPromise = this.cleanup(sessionToClean, true);
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Cleanup timeout')), 5000)
      );
      await Promise.race([cleanupPromise, timeoutPromise]);
    } catch (e) {
      console.warn('[CallService] Cleanup timed out or failed:', e);
      // Force reset the cleanup flag if it got stuck
      this.isCleaningUp = false;
      this.cleanupCompleteTime = Date.now();
    }
  }

  // Toggle mute
  toggleMute(): boolean {
    if (!this.localStream || !this.currentSession) return false;

    const audioTracks = this.localStream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      console.warn('[CallService] No audio tracks available for mute toggle');
      return false;
    }
    const audioTrack = audioTracks[0];
    audioTrack.enabled = !audioTrack.enabled;
    this.currentSession.isMuted = !audioTrack.enabled;
    return this.currentSession.isMuted;
  }

  // Toggle video
  toggleVideo(): boolean {
    if (!this.localStream || !this.currentSession) return false;

    const videoTracks = this.localStream.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) {
      console.warn('[CallService] No video tracks available for video toggle');
      return false;
    }
    const videoTrack = videoTracks[0];
    videoTrack.enabled = !videoTrack.enabled;
    this.currentSession.isCameraOn = videoTrack.enabled;
    return this.currentSession.isCameraOn;
  }

  // Switch camera (front/back)
  async switchCamera(): Promise<boolean> {
    if (!this.localStream || !this.currentSession || !this.currentSession.isVideo) {
      return false;
    }

    const videoTracks = (this.localStream as any).getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) {
      console.warn('[CallService] No video tracks available for camera switch');
      return false;
    }
    const videoTrack = videoTracks[0];

    try {
      // For react-native-webrtc, use the _switchCamera method
      if (typeof videoTrack._switchCamera === 'function') {
        videoTrack._switchCamera();
        this.currentSession.isFrontCamera = !this.currentSession.isFrontCamera;
        return this.currentSession.isFrontCamera;
      }

      // Fallback: get a new stream with different facing mode
      const webrtc = await loadWebRTCModule();
      if (!webrtc) {
        console.warn('[CallService] WebRTC not available for camera switch');
        return this.currentSession.isFrontCamera;
      }
      const { mediaDevices } = webrtc;
      const newFacingMode = this.currentSession.isFrontCamera ? 'environment' : 'user';

      const newStream = await mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false,
      });

      const newVideoTracks = (newStream as any).getVideoTracks();
      if (!newVideoTracks || newVideoTracks.length === 0) {
        console.warn('[CallService] Failed to get new video track for camera switch');
        return this.currentSession.isFrontCamera;
      }
      const newVideoTrack = newVideoTracks[0];

      // Replace track in peer connection
      if (this.peerConnection) {
        const senders = (this.peerConnection as any).getSenders?.();
        if (senders && Array.isArray(senders)) {
          const sender = senders.find((s: any) => s.track?.kind === 'video');
          if (sender && typeof sender.replaceTrack === 'function') {
            await sender.replaceTrack(newVideoTrack);
          } else {
            console.warn('[CallService] No video sender found or replaceTrack not available');
          }
        }
      }

      // Replace track in local stream
      videoTrack.stop();
      (this.localStream as any).removeTrack(videoTrack);
      (this.localStream as any).addTrack(newVideoTrack);

      this.currentSession.isFrontCamera = !this.currentSession.isFrontCamera;
      return this.currentSession.isFrontCamera;
    } catch (error) {
      console.error('[CallService] Failed to switch camera:', error);
      return this.currentSession.isFrontCamera;
    }
  }

  // Toggle speaker
  async toggleSpeaker(): Promise<boolean> {
    // Capture session locally to prevent race conditions
    const session = this.currentSession;
    if (!session) return false;

    // Store the new speaker state locally in case session becomes null during await
    const newSpeakerState = !session.isSpeakerOn;

    // Only update if session is still valid
    if (this.currentSession) {
      this.currentSession.isSpeakerOn = newSpeakerState;
    }

    // Use InCallManager for actual speaker control
    try {
      const manager = await loadInCallManager();
      // Re-check session after async operation and that we're not cleaning up
      if (manager && this.currentSession && !this.isCleaningUp) {
        try {
          manager.setSpeakerphoneOn(newSpeakerState);
          console.log('[CallService] Speaker:', newSpeakerState ? 'ON' : 'OFF');
        } catch (e) {
          console.warn('[CallService] Failed to set speaker:', e);
        }
      }
    } catch (e) {
      console.warn('[CallService] Failed to load InCallManager for speaker toggle:', e);
    }

    // Return the state we set (may differ from currentSession if it became null)
    return this.currentSession?.isSpeakerOn ?? newSpeakerState;
  }

  // Private: Stop ringback tone and configure for active call
  private async stopRingbackAndConfigureActiveCall(): Promise<void> {
    const manager = await loadInCallManager();
    if (manager) {
      try {
        // Stop the current InCallManager (which has ringback playing)
        manager.stop();

        // Restart without ringback for active call
        const isVideo = this.currentSession?.isVideo || false;
        manager.start({
          media: isVideo ? 'video' : 'audio',
          auto: true,
          ringback: '', // No ringback for connected call
        });
        manager.setSpeakerphoneOn(this.currentSession?.isSpeakerOn || isVideo);
        manager.setKeepScreenOn(true);
        console.log('[CallService] Ringback stopped, active call mode configured');
      } catch (e) {
        console.warn('[CallService] Failed to reconfigure InCallManager:', e);
      }
    }
  }

  // Private: Create peer connection
  private async createPeerConnection(): Promise<void> {
    console.log('[CallService] createPeerConnection starting...');

    try {
      // Use the safe WebRTC loader
      const webrtc = await loadWebRTCModule();
      if (!webrtc) {
        console.error('[CallService] WebRTC module not available for peer connection');
        throw new Error('WebRTC is not available on this device.');
      }

      const { RTCPeerConnection, MediaStream: RNMediaStream } = webrtc;
      if (!RTCPeerConnection) {
        console.error('[CallService] RTCPeerConnection not available');
        throw new Error('WebRTC peer connection is not available.');
      }

      console.log('[CallService] WebRTC module loaded successfully');

      // Small delay to let any previous operations settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get ICE servers with TURN credentials (with timeout)
      let iceServers;
      try {
        const icePromise = this.getIceServers();
        const iceTimeoutPromise = new Promise<RTCIceServer[]>((resolve) =>
          setTimeout(() => {
            console.warn('[CallService] ICE servers request timed out, using defaults');
            resolve(DEFAULT_ICE_SERVERS);
          }, 5000)
        );
        iceServers = await Promise.race([icePromise, iceTimeoutPromise]);
      } catch (e) {
        console.warn('[CallService] Failed to get ICE servers, using defaults:', e);
        iceServers = DEFAULT_ICE_SERVERS;
      }
      console.log('[CallService] Using ICE servers:', iceServers.map(s => s.urls));

      console.log('[CallService] Creating RTCPeerConnection...');
      this.peerConnection = new RTCPeerConnection({
        iceServers,
      }) as unknown as RTCPeerConnection;

      if (!this.peerConnection) {
        throw new Error('Failed to create RTCPeerConnection - returned null');
      }

      console.log('[CallService] RTCPeerConnection created successfully');

    // Handle ICE candidates
    (this.peerConnection as any).onicecandidate = (event: any) => {
      // Capture session data locally to prevent race condition with cleanup
      const session = this.currentSession;
      if (event.candidate && session && !this.isCleaningUp) {
        this.sendSignalingMessage(session.contactId, {
          type: 'ice_candidate',
          callId: session.callId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    // Handle connection state changes
    (this.peerConnection as any).onconnectionstatechange = async () => {
      // Early exit if cleanup is in progress to prevent race conditions
      if (this.isCleaningUp) {
        console.log('[CallService] Ignoring connection state change - cleanup in progress');
        return;
      }

      const state = (this.peerConnection as any)?.connectionState;
      console.log('[CallService] Connection state:', state);

      // Capture session locally to prevent race condition
      const session = this.currentSession;

      if (state === 'connected') {
        // Stop ringback as backup (in case call_answer handler didn't run first)
        // Only for outgoing calls that had ringback
        if (session && !session.isIncoming) {
          await this.stopRingbackAndConfigureActiveCall();
        }

        // Re-check session after async operation
        if (this.currentSession && !this.isCleaningUp) {
          this.currentSession.state = 'connected';
          this.currentSession.startTime = Date.now();
          this.notifyStateChange('connected');
        }
      } else if (state === 'disconnected' || state === 'failed') {
        // Only end call if not already cleaning up
        if (!this.isCleaningUp) {
          console.log('[CallService] WebRTC connection failed/disconnected, ending call');
          this.endCall();
        }
      }
    };

    // Handle ICE connection state changes (more granular than connection state)
    (this.peerConnection as any).oniceconnectionstatechange = () => {
      const iceState = (this.peerConnection as any)?.iceConnectionState;
      console.log('[CallService] ICE connection state:', iceState);
    };

    // Handle ICE gathering state changes
    (this.peerConnection as any).onicegatheringstatechange = () => {
      const gatheringState = (this.peerConnection as any)?.iceGatheringState;
      console.log('[CallService] ICE gathering state:', gatheringState);
    };

    // Handle signaling state changes
    (this.peerConnection as any).onsignalingstatechange = () => {
      const signalingState = (this.peerConnection as any)?.signalingState;
      console.log('[CallService] Signaling state:', signalingState);
    };

    // Handle remote tracks
    (this.peerConnection as any).ontrack = (event: any) => {
      console.log('[CallService] Remote track received:', event.track?.kind);
      console.log('[CallService] Event streams:', event.streams?.length || 0);

      // Use the stream from the event directly (preferred method)
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0] as unknown as MediaStream;
        console.log('[CallService] Using event stream directly');
      } else {
        // Fallback: create stream and add track
        if (!this.remoteStream) {
          this.remoteStream = new RNMediaStream() as unknown as MediaStream;
          console.log('[CallService] Created new remote stream');
        }
        if (event.track) {
          (this.remoteStream as any).addTrack(event.track);
          console.log('[CallService] Added track to remote stream');
        }
      }

      if (this.remoteStreamHandler && this.remoteStream) {
        console.log('[CallService] Notifying remote stream handler');
        this.remoteStreamHandler(this.remoteStream);
      }
    };

    console.log('[CallService] Peer connection created');
    } catch (error) {
      console.error('[CallService] Failed to create peer connection:', error);
      throw error;
    }
  }

  // Private: Process pending ICE candidates
  private async processPendingIceCandidates(): Promise<void> {
    if (!this.peerConnection) return;

    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('[CallService] Failed to add pending ICE candidate:', error);
      }
    }
    this.pendingIceCandidates = [];
  }

  // Private: Set up signaling message handlers
  private setupSignalingHandlers(): void {
    // These handlers are connected via handleWebSocketMessage below
  }

  // Handle incoming WebSocket call message from MessagingService
  async handleWebSocketMessage(type: string, payload: any): Promise<void> {
    try {
      console.log('[CallService] handleWebSocketMessage:', type);
      switch (type) {
        case 'incoming_call':
          // Map to internal format and handle
          await this.handleSignalingMessage(payload.fromWhisperId, {
            type: 'call_offer',
            callId: payload.callId,
            sdp: payload.offer,
            isVideo: payload.isVideo || false,
          });
          break;
      case 'call_answered':
        await this.handleSignalingMessage(payload.fromWhisperId, {
          type: 'call_answer',
          callId: payload.callId,
          sdp: payload.answer,
        });
        break;
      case 'call_ice_candidate':
        try {
          const candidate = typeof payload.candidate === 'string'
            ? JSON.parse(payload.candidate)
            : payload.candidate;
          await this.handleSignalingMessage(payload.fromWhisperId, {
            type: 'ice_candidate',
            callId: payload.callId,
            candidate,
          });
        } catch (parseError) {
          console.error('[CallService] Failed to parse ICE candidate:', parseError);
        }
        break;
      case 'call_ended':
        await this.handleSignalingMessage(payload.fromWhisperId, {
          type: 'call_end',
          callId: payload.callId,
        });
        break;
      case 'call_ringing':
        // Recipient's phone is ringing - update caller's state
        if (this.currentSession && this.currentSession.callId === payload.callId) {
          console.log('[CallService] Call ringing on recipient device');
          this.currentSession.state = 'ringing';
          this.notifyStateChange('ringing');
        }
        break;
      case 'recipient_offline':
        // Recipient is not available - notify caller
        if (this.currentSession) {
          console.log('[CallService] Recipient is offline');
          const sessionToClean = this.currentSession;
          this.currentSession = null;
          this.notifyStateChange('no_answer');
          // Await cleanup to ensure resources are released before any new operations
          await this.cleanup(sessionToClean);
        }
        break;
      }
    } catch (error) {
      console.error('[CallService] handleWebSocketMessage error:', error);
    }
  }

  // Handle incoming signaling message
  async handleSignalingMessage(fromWhisperId: string, message: {
    type: string;
    callId: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
    isVideo?: boolean;
  }): Promise<void> {
    console.log('[CallService] Signaling message:', message.type);

    switch (message.type) {
      case 'call_offer':
        // Incoming call
        // First, check if cleanup is stuck and force reset if needed
        if (this.isCleaningUp) {
          console.log('[CallService] Cleanup stuck, forcing reset for incoming call...');
          await this.forceReset();
        }

        // Check for stale sessions and clean them up
        if (this.isSessionStale()) {
          console.log('[CallService] Stale session found, forcing reset for incoming call...');
          await this.forceReset();
        }

        if (this.currentSession) {
          // Actually in an active call, reject
          console.log('[CallService] Rejecting incoming call - already in active call:', this.currentSession.state);
          this.sendSignalingMessage(fromWhisperId, {
            type: 'call_reject',
            callId: message.callId,
            reason: 'busy',
          });
          return;
        }

        // Create pending session with remote SDP stored
        this.currentSession = {
          callId: message.callId,
          contactId: fromWhisperId,
          isIncoming: true,
          isVideo: message.isVideo || false,
          state: 'ringing',
          isMuted: false,
          isSpeakerOn: false,
          isCameraOn: message.isVideo || false,
          isFrontCamera: true,
          remoteSdp: message.sdp, // Store the SDP offer for later use
        };

        // Set up headphone button listeners for incoming call
        // (allows answering with headphone button)
        this.setupAudioEventListeners();

        this.notifyStateChange('ringing');

        // Notify about incoming call
        if (this.incomingCallHandler) {
          try {
            this.incomingCallHandler(
              message.callId,
              fromWhisperId,
              message.isVideo || false
            );
          } catch (err) {
            console.error('[CallService] incomingCallHandler error:', err);
          }
        }
        break;

      case 'call_answer':
        // Call was answered
        if (!this.peerConnection || !this.currentSession) return;
        if (this.currentSession.callId !== message.callId) return;

        try {
          // Stop ringback tone immediately when answer is received
          await this.stopRingbackAndConfigureActiveCall();

          await this.peerConnection.setRemoteDescription({
            type: 'answer',
            sdp: message.sdp,
          });

          // Process any pending ICE candidates
          await this.processPendingIceCandidates();

          this.currentSession.state = 'connecting';
          this.notifyStateChange('connecting');
        } catch (error) {
          console.error('[CallService] Failed to set remote description:', error);
          this.endCall();
        }
        break;

      case 'call_reject':
        // Call was rejected
        if (this.currentSession?.callId === message.callId) {
          const sessionToClean = this.currentSession;
          this.currentSession = null;
          this.notifyStateChange('ended');
          // Await cleanup to ensure resources are released
          await this.cleanup(sessionToClean);
        }
        break;

      case 'call_end':
        // Call ended by remote peer
        if (this.currentSession?.callId === message.callId) {
          const sessionToClean = this.currentSession;
          this.currentSession = null;
          this.notifyStateChange('ended');
          // Await cleanup to ensure resources are released
          await this.cleanup(sessionToClean);
        }
        break;

      case 'ice_candidate':
        // ICE candidate received
        if (!this.currentSession || this.currentSession.callId !== message.callId) return;

        if (message.candidate) {
          if (this.peerConnection?.remoteDescription) {
            try {
              await this.peerConnection.addIceCandidate(message.candidate);
            } catch (error) {
              console.error('[CallService] Failed to add ICE candidate:', error);
            }
          } else {
            // Queue candidate for later
            this.pendingIceCandidates.push(message.candidate);
          }
        }
        break;
    }
  }

  // Private: Send signaling message via messaging service
  private sendSignalingMessage(toWhisperId: string, message: Record<string, unknown>): void {
    if (!messagingService.isConnected()) {
      console.error('[CallService] Cannot send signaling message - not connected');
      return;
    }

    // Map internal message types to WebSocket message types
    const { type, callId, sdp, candidate, isVideo, ...rest } = message;

    let wsMessage: { type: string; payload: Record<string, unknown> };

    switch (type) {
      case 'call_offer':
        wsMessage = {
          type: 'call_initiate',
          payload: {
            toWhisperId,
            callId,
            offer: sdp,
            isVideo: isVideo || false,
          },
        };
        break;
      case 'call_answer':
        wsMessage = {
          type: 'call_answer',
          payload: {
            toWhisperId,
            callId,
            answer: sdp,
          },
        };
        break;
      case 'ice_candidate':
        wsMessage = {
          type: 'call_ice_candidate',
          payload: {
            toWhisperId,
            callId,
            candidate: JSON.stringify(candidate),
          },
        };
        break;
      case 'call_reject':
      case 'call_end':
        wsMessage = {
          type: 'call_end',
          payload: {
            toWhisperId,
            callId,
          },
        };
        break;
      default:
        console.warn('[CallService] Unknown signaling message type:', type);
        return;
    }

    // Send through messaging service's WebSocket
    (messagingService as any).send(wsMessage);
  }

  // Private: Notify state change
  private notifyStateChange(state: CallState): void {
    if (this.currentSession) {
      this.currentSession.state = state;
    }
    if (this.callStateHandler) {
      this.callStateHandler(state);
    }
  }

  // Private: Cleanup resources
  // @param sessionToClean - The session to clean up
  // @param alreadyLocked - If true, isCleaningUp was already set by caller (endCall)
  private async cleanup(sessionToClean?: CallSession | null, alreadyLocked: boolean = false): Promise<void> {
    console.log('[CallService] Cleaning up call resources...');

    // Set cleanup flag if not already set by caller
    if (!alreadyLocked) {
      if (this.isCleaningUp) {
        console.log('[CallService] Cleanup already in progress, skipping');
        return;
      }
      this.isCleaningUp = true;
    }

    // Use try-finally to ALWAYS reset isCleaningUp
    try {
      // Use passed session or fall back to currentSession
      const session = sessionToClean || this.currentSession;

      // End call on CallKeep (native call UI)
      if (session) {
        try {
          callKeepService.endCall(session.callId);
        } catch (e) {
          console.warn('[CallService] Failed to end CallKeep call:', e);
        }
      }

      // Stop InCallManager
      try {
        const manager = await loadInCallManager();
        if (manager) {
          try {
            manager.stop();
            console.log('[CallService] InCallManager stopped');
          } catch (e) {
            console.warn('[CallService] Failed to stop InCallManager:', e);
          }
        }
      } catch (e) {
        console.warn('[CallService] Failed to load InCallManager for cleanup:', e);
      }

      // Stop local tracks first
      if (this.localStream) {
        try {
          const tracks = this.localStream.getTracks();
          tracks.forEach(track => {
            try {
              track.stop();
              console.log('[CallService] Stopped track:', track.kind);
            } catch (e) {
              console.warn('[CallService] Failed to stop track:', e);
            }
          });
        } catch (e) {
          console.warn('[CallService] Failed to get tracks:', e);
        }
        this.localStream = null;
      }

      // Clear remote stream
      if (this.remoteStream) {
        try {
          const tracks = this.remoteStream.getTracks();
          tracks.forEach(track => {
            try {
              track.stop();
            } catch (e) {
              // Ignore errors stopping remote tracks
            }
          });
        } catch (e) {
          // Ignore
        }
        this.remoteStream = null;
      }

      if (this.remoteStreamHandler) {
        try {
          this.remoteStreamHandler(null);
        } catch (e) {
          console.warn('[CallService] Failed to notify remote stream handler:', e);
        }
      }

      // Close peer connection
      if (this.peerConnection) {
        try {
          // Remove ALL event handlers before closing to prevent callbacks during cleanup
          (this.peerConnection as any).onicecandidate = null;
          (this.peerConnection as any).onconnectionstatechange = null;
          (this.peerConnection as any).ontrack = null;
          (this.peerConnection as any).oniceconnectionstatechange = null;
          (this.peerConnection as any).onsignalingstatechange = null;
          (this.peerConnection as any).onicegatheringstatechange = null;
          this.peerConnection.close();
          console.log('[CallService] Peer connection closed');
        } catch (e) {
          console.warn('[CallService] Failed to close peer connection:', e);
        }
        this.peerConnection = null;
      }

      // Clear pending ICE candidates
      this.pendingIceCandidates = [];

      // Remove audio event listeners (headphone button support)
      this.removeAudioEventListeners();

      // Clear session (may already be null if endCall was called)
      if (this.currentSession) {
        this.currentSession = null;
      }

      console.log('[CallService] Cleanup complete');
    } finally {
      // ALWAYS reset cleanup flag, even if an error occurred
      this.isCleaningUp = false;
      this.cleanupCompleteTime = Date.now();
    }
  }

  // Get call quality statistics (useful for debugging)
  async getCallStats(): Promise<{
    bytesReceived?: number;
    bytesSent?: number;
    packetsLost?: number;
    jitter?: number;
    roundTripTime?: number;
  } | null> {
    if (!this.peerConnection) return null;

    try {
      const stats = await (this.peerConnection as any).getStats();
      let result: any = {};

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          result.bytesReceived = report.bytesReceived;
          result.packetsLost = report.packetsLost;
          result.jitter = report.jitter;
        } else if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          result.bytesSent = report.bytesSent;
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          result.roundTripTime = report.currentRoundTripTime;
        }
      });

      return result;
    } catch (e) {
      console.warn('[CallService] Failed to get call stats:', e);
      return null;
    }
  }

  // Force reset the entire call service state (for recovery from stuck states)
  async forceReset(): Promise<void> {
    console.log('[CallService] Force resetting call service...');

    // Use try-finally to ensure cleanup flag is always reset
    try {
      // Mark as cleaning up to prevent concurrent operations
      this.isCleaningUp = true;

      // End all CallKeep calls
      try {
        callKeepService.endAllCalls();
      } catch (e) {
        console.warn('[CallService] Failed to end CallKeep calls:', e);
      }

      // Stop InCallManager
      try {
        const manager = await loadInCallManager();
        if (manager) {
          try {
            manager.stop();
          } catch (e) {
            console.warn('[CallService] Failed to stop InCallManager:', e);
          }
        }
      } catch (e) {
        console.warn('[CallService] Failed to load InCallManager:', e);
      }

      // Stop all tracks
      if (this.localStream) {
        try {
          this.localStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
          });
        } catch (e) {}
        this.localStream = null;
      }

      if (this.remoteStream) {
        try {
          this.remoteStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
          });
        } catch (e) {}
        this.remoteStream = null;
      }

      // Close peer connection - remove ALL event handlers
      if (this.peerConnection) {
        try {
          (this.peerConnection as any).onicecandidate = null;
          (this.peerConnection as any).onconnectionstatechange = null;
          (this.peerConnection as any).ontrack = null;
          (this.peerConnection as any).oniceconnectionstatechange = null;
          (this.peerConnection as any).onsignalingstatechange = null;
          (this.peerConnection as any).onicegatheringstatechange = null;
          this.peerConnection.close();
        } catch (e) {
          console.warn('[CallService] Failed to close peer connection:', e);
        }
        this.peerConnection = null;
      }

      // Clear all state
      this.pendingIceCandidates = [];
      this.currentSession = null;

      // Remove audio event listeners
      this.removeAudioEventListeners();

      // Notify handlers
      if (this.remoteStreamHandler) {
        try {
          this.remoteStreamHandler(null);
        } catch (e) {
          console.warn('[CallService] Failed to notify remote stream handler:', e);
        }
      }

      console.log('[CallService] Force reset complete');
    } finally {
      // ALWAYS reset cleanup flag
      this.isCleaningUp = false;
      this.cleanupCompleteTime = Date.now();
    }
  }
}

// Singleton instance
export const callService = new CallService();
export default callService;
