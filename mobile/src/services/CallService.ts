import { CallSession, CallState, Contact } from '../types';
import { generateId } from '../utils/helpers';
import { messagingService } from './MessagingService';
import { callKeepService } from './CallKeepService';

// InCallManager for audio routing (speaker, proximity sensor, etc.)
let InCallManager: any = null;
let inCallManagerAvailable: boolean | null = null;
let inCallManagerLoadAttempted: boolean = false;

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

  constructor() {
    // Set up signaling message handlers
    this.setupSignalingHandlers();
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
        // Set expiry to 1 hour before actual expiry for safety margin
        this.turnCredentialsExpiry = Date.now() + (response.ttl - 3600) * 1000;
        console.log('[CallService] TURN credentials received');
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

  // Initialize media stream (audio + optional video)
  async initializeMedia(isVideo: boolean): Promise<MediaStream> {
    try {
      // Dynamically import react-native-webrtc
      const { mediaDevices } = await import('react-native-webrtc');

      // Request media with constraints
      const constraints = {
        audio: true,
        video: isVideo ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } : false,
      };

      // Use react-native-webrtc's mediaDevices
      const stream = await mediaDevices.getUserMedia(constraints);
      this.localStream = stream as unknown as MediaStream;
      console.log('[CallService] Local media stream initialized');
      return this.localStream;
    } catch (error) {
      console.error('[CallService] Failed to get user media:', error);
      throw error;
    }
  }

  // Check if there's a stale session that should be cleaned up
  private isSessionStale(): boolean {
    if (!this.currentSession) return false;

    // Session is stale if:
    // 1. State is 'ended'
    // 2. isCleaningUp has been true for too long (> 5 seconds)
    // 3. Session has been in 'calling' or 'ringing' state for too long (> 60 seconds)
    const state = this.currentSession.state;

    if (state === 'ended') return true;

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

    return false;
  }

  // Start an outgoing call
  async startCall(contact: Contact, isVideo: boolean): Promise<string> {
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
        console.log('[CallService] Adding', tracks.length, 'local tracks to peer connection');
        tracks.forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
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
      this.endCall();
      throw error;
    }
  }

  // Accept an incoming call
  async acceptCall(callId: string, contactId: string, isVideo: boolean, remoteSdp: string): Promise<void> {
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
        console.log('[CallService] Adding', tracks.length, 'local tracks');
        tracks.forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
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
      this.endCall();
      throw error;
    }
  }

  // Reject an incoming call
  async rejectCall(callId: string, contactId: string): Promise<void> {
    this.sendSignalingMessage(contactId, {
      type: 'call_reject',
      callId,
    });

    // Store session for cleanup and clear immediately
    const sessionToClean = this.currentSession;
    this.currentSession = null;

    await this.cleanup(sessionToClean);
    console.log('[CallService] Call rejected:', callId);
  }

  // End the current call
  async endCall(): Promise<void> {
    // Prevent multiple endCall invocations
    if (this.isCleaningUp) {
      console.log('[CallService] Already ending call, ignoring duplicate');
      return;
    }

    // Store session info before clearing for cleanup
    const sessionToClean = this.currentSession;

    if (sessionToClean) {
      // Notify remote peer
      this.sendSignalingMessage(sessionToClean.contactId, {
        type: 'call_end',
        callId: sessionToClean.callId,
      });
    }

    // Clear session immediately to allow new calls
    this.currentSession = null;

    this.notifyStateChange('ended');
    console.log('[CallService] Call ended');

    // Run cleanup with stored session info
    await this.cleanup(sessionToClean);
  }

  // Toggle mute
  toggleMute(): boolean {
    if (!this.localStream || !this.currentSession) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.currentSession.isMuted = !audioTrack.enabled;
      return this.currentSession.isMuted;
    }
    return false;
  }

  // Toggle video
  toggleVideo(): boolean {
    if (!this.localStream || !this.currentSession) return false;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.currentSession.isCameraOn = videoTrack.enabled;
      return this.currentSession.isCameraOn;
    }
    return false;
  }

  // Switch camera (front/back)
  async switchCamera(): Promise<boolean> {
    if (!this.localStream || !this.currentSession || !this.currentSession.isVideo) {
      return false;
    }

    const videoTrack = (this.localStream as any).getVideoTracks()[0];
    if (!videoTrack) return false;

    try {
      // For react-native-webrtc, use the _switchCamera method
      if (typeof videoTrack._switchCamera === 'function') {
        videoTrack._switchCamera();
        this.currentSession.isFrontCamera = !this.currentSession.isFrontCamera;
        return this.currentSession.isFrontCamera;
      }

      // Fallback: get a new stream with different facing mode
      const { mediaDevices } = await import('react-native-webrtc');
      const newFacingMode = this.currentSession.isFrontCamera ? 'environment' : 'user';

      const newStream = await mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false,
      });

      const newVideoTrack = (newStream as any).getVideoTracks()[0];

      // Replace track in peer connection
      if (this.peerConnection) {
        const senders = (this.peerConnection as any).getSenders();
        const sender = senders?.find((s: any) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
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
    if (!this.currentSession) return false;

    this.currentSession.isSpeakerOn = !this.currentSession.isSpeakerOn;

    // Use InCallManager for actual speaker control
    const manager = await loadInCallManager();
    if (manager) {
      try {
        manager.setSpeakerphoneOn(this.currentSession.isSpeakerOn);
        console.log('[CallService] Speaker:', this.currentSession.isSpeakerOn ? 'ON' : 'OFF');
      } catch (e) {
        console.warn('[CallService] Failed to set speaker:', e);
      }
    }

    return this.currentSession.isSpeakerOn;
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
    // Dynamically import react-native-webrtc
    const { RTCPeerConnection, MediaStream: RNMediaStream } = await import('react-native-webrtc');

    // Get ICE servers with TURN credentials
    const iceServers = await this.getIceServers();
    console.log('[CallService] Using ICE servers:', iceServers.map(s => s.urls));

    this.peerConnection = new RTCPeerConnection({
      iceServers,
    }) as unknown as RTCPeerConnection;

    // Handle ICE candidates
    (this.peerConnection as any).onicecandidate = (event: any) => {
      if (event.candidate && this.currentSession) {
        this.sendSignalingMessage(this.currentSession.contactId, {
          type: 'ice_candidate',
          callId: this.currentSession.callId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    // Handle connection state changes
    (this.peerConnection as any).onconnectionstatechange = async () => {
      const state = (this.peerConnection as any)?.connectionState;
      console.log('[CallService] Connection state:', state);

      if (state === 'connected') {
        // Stop ringback as backup (in case call_answer handler didn't run first)
        // Only for outgoing calls that had ringback
        if (this.currentSession && !this.currentSession.isIncoming) {
          await this.stopRingbackAndConfigureActiveCall();
        }

        if (this.currentSession) {
          this.currentSession.state = 'connected';
          this.currentSession.startTime = Date.now();
        }
        this.notifyStateChange('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        console.log('[CallService] WebRTC connection failed/disconnected, ending call');
        this.endCall();
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
  handleWebSocketMessage(type: string, payload: any): void {
    switch (type) {
      case 'incoming_call':
        // Map to internal format and handle
        this.handleSignalingMessage(payload.fromWhisperId, {
          type: 'call_offer',
          callId: payload.callId,
          sdp: payload.offer,
          isVideo: payload.isVideo || false,
        });
        break;
      case 'call_answered':
        this.handleSignalingMessage(payload.fromWhisperId, {
          type: 'call_answer',
          callId: payload.callId,
          sdp: payload.answer,
        });
        break;
      case 'call_ice_candidate':
        this.handleSignalingMessage(payload.fromWhisperId, {
          type: 'ice_candidate',
          callId: payload.callId,
          candidate: JSON.parse(payload.candidate),
        });
        break;
      case 'call_ended':
        this.handleSignalingMessage(payload.fromWhisperId, {
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
          this.cleanup(sessionToClean);
        }
        break;
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

        this.notifyStateChange('ringing');

        // Notify about incoming call
        if (this.incomingCallHandler) {
          this.incomingCallHandler(
            message.callId,
            fromWhisperId,
            message.isVideo || false
          );
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
          this.cleanup(sessionToClean);
        }
        break;

      case 'call_end':
        // Call ended by remote peer
        if (this.currentSession?.callId === message.callId) {
          const sessionToClean = this.currentSession;
          this.currentSession = null;
          this.notifyStateChange('ended');
          this.cleanup(sessionToClean);
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
  private async cleanup(sessionToClean?: CallSession | null): Promise<void> {
    console.log('[CallService] Cleaning up call resources...');
    this.isCleaningUp = true;

    // Use passed session or fall back to currentSession
    const session = sessionToClean || this.currentSession;

    // End call on CallKeep (native call UI)
    if (session) {
      callKeepService.endCall(session.callId);
    }

    // Stop InCallManager
    const manager = await loadInCallManager();
    if (manager) {
      try {
        manager.stop();
        console.log('[CallService] InCallManager stopped');
      } catch (e) {
        console.warn('[CallService] Failed to stop InCallManager:', e);
      }
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
      this.remoteStreamHandler(null);
    }

    // Close peer connection
    if (this.peerConnection) {
      try {
        // Remove event handlers before closing to prevent callbacks during cleanup
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

    // Clear session (may already be null if endCall was called)
    if (this.currentSession) {
      this.currentSession = null;
    }

    // Mark cleanup as complete
    this.isCleaningUp = false;
    this.cleanupCompleteTime = Date.now();

    console.log('[CallService] Cleanup complete');
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

    // End all CallKeep calls
    callKeepService.endAllCalls();

    // Stop InCallManager
    const manager = await loadInCallManager();
    if (manager) {
      try {
        manager.stop();
      } catch (e) {}
    }

    // Force cleanup regardless of current state
    this.isCleaningUp = false;

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

    // Close peer connection
    if (this.peerConnection) {
      try {
        (this.peerConnection as any).onicecandidate = null;
        (this.peerConnection as any).onconnectionstatechange = null;
        (this.peerConnection as any).ontrack = null;
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    // Clear all state
    this.pendingIceCandidates = [];
    this.currentSession = null;
    this.cleanupCompleteTime = Date.now();

    // Notify handlers
    if (this.remoteStreamHandler) {
      this.remoteStreamHandler(null);
    }

    console.log('[CallService] Force reset complete');
  }
}

// Singleton instance
export const callService = new CallService();
export default callService;
