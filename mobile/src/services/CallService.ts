import { Platform } from 'react-native';
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

// DeviceEventEmitter for InCallManager events
let DeviceEventEmitter: any = null;
const getDeviceEventEmitter = () => {
  if (!DeviceEventEmitter) {
    const { DeviceEventEmitter: Emitter } = require('react-native');
    DeviceEventEmitter = Emitter;
  }
  return DeviceEventEmitter;
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

  // iOS CallKit audio session state
  // On iOS, we MUST wait for CallKit to activate the audio session before starting audio
  private isAudioSessionActivated: boolean = false;
  private pendingAudioStart: { isVideo: boolean; needsAudioCapture: boolean } | null = null;

  // Audio state tracking for idempotency - prevents double-start/stop issues
  // iOS CallKit can send duplicate events, so we need to track actual state
  private audioState: 'idle' | 'starting' | 'started' | 'stopping' = 'idle';
  private audioStartedForCallId: string | null = null;

  // iOS: Pending call setup - we delay ALL WebRTC setup until CallKit activates audio session
  // On iOS 26, calling addTransceiver('audio') before audio session activation crashes
  // So we store the call info and do the entire setup after didActivateAudioSession
  private pendingCallSetup: {
    callId: string;
    contactId: string;
    isVideo: boolean;
    isIncoming: boolean;
    remoteSdp?: string; // For incoming calls
    createdAt: number;
  } | null = null;

  // iOS: Track if audio has been attached to prevent double replaceTrack
  // didActivateAudioSession can fire multiple times (Bluetooth, interruptions, route changes)
  private audioAttachedForCallId: string | null = null;

  // iOS: Track if audio attach is allowed - set to false after didDeactivateAudioSession
  // This prevents late audio attachment after call ends
  private audioAttachAllowed: boolean = false;

  constructor() {
    // Set up signaling message handlers
    this.setupSignalingHandlers();

    // Set up CallKit audio session callbacks (iOS only)
    this.setupCallKitAudioCallbacks();
  }

  // Set up CallKit audio session callbacks
  // CRITICAL: On iOS, CallKit owns the audio session. We must wait for activation.
  private setupCallKitAudioCallbacks(): void {
    if (Platform.OS !== 'ios') return;

    // Called when CallKit activates the audio session (user answered, system ready)
    // iOS 26 FIX: We delay ALL WebRTC setup until this callback fires
    // This prevents crashes from calling addTransceiver('audio') before audio session activation
    // NOTE: This can fire multiple times (Bluetooth, interruptions, route changes)
    callKeepService.onAudioSessionActivated = async () => {
      console.log('[CallService] iOS: CallKit activated audio session');
      this.isAudioSessionActivated = true;
      this.audioAttachAllowed = true; // Audio attach is now allowed

      // iOS 26 FIX: Complete pending call setup now that audio session is activated
      if (this.pendingCallSetup) {
        const { callId, contactId, isVideo, isIncoming, remoteSdp, createdAt } = this.pendingCallSetup;

        // CRITICAL: Consume pending FIRST to prevent double resolution
        this.pendingCallSetup = null;

        // Validate this is for the current session
        if (!this.currentSession || this.currentSession.callId !== callId) {
          console.warn('[CallService] iOS: Pending call setup is for different/stale call, ignoring');
          return;
        }

        // Check session state - don't proceed if call is ending/ended
        if (this.currentSession.state === 'ended') {
          console.warn('[CallService] iOS: Session already ended, skipping call setup');
          return;
        }

        // Check for stale pending (older than 30 seconds)
        if (Date.now() - createdAt > 30000) {
          console.warn('[CallService] iOS: Pending call setup is stale (>30s), ignoring');
          return;
        }

        console.log('[CallService] iOS: Completing call setup after audio activation - isIncoming:', isIncoming);

        if (isIncoming) {
          await this.completeIncomingCallSetup(callId, contactId, isVideo, remoteSdp!);
        } else {
          await this.completeOutgoingCallSetup(callId, contactId, isVideo);
        }
        return;
      }

      // Legacy fallback
      if (this.pendingAudioStart) {
        const { isVideo } = this.pendingAudioStart;
        this.pendingAudioStart = null;
        await this.startAudioSessionNow(isVideo);
      }
    };

    // Called when CallKit deactivates the audio session (call ended)
    // CRITICAL: After this, WebRTC audio operations are FORBIDDEN
    callKeepService.onAudioSessionDeactivated = () => {
      console.log('[CallService] iOS: CallKit deactivated audio session');
      this.isAudioSessionActivated = false;
      this.audioAttachAllowed = false; // CRITICAL: Prevent late audio attachment
      this.pendingAudioStart = null;
      this.pendingCallSetup = null; // Clear any pending - too late now

      // Stop InCallManager when CallKit deactivates
      this.stopAudioSession();
    };

    console.log('[CallService] iOS: CallKit audio callbacks registered');
  }

  // Actually start the audio session (called when CallKit says it's ready on iOS, or immediately on Android)
  // NOTE: On iOS, audio capture is now handled in continueOutgoingCallAfterAudioActivation
  // and continueIncomingAcceptAfterAudioActivation. This method is only for legacy/fallback cases.
  private async startAudioSessionNow(isVideo: boolean, needsAudioCapture: boolean = false): Promise<void> {
    // Idempotency check - prevent double-start
    const currentCallId = this.currentSession?.callId || null;
    if (this.audioState === 'started' && this.audioStartedForCallId === currentCallId) {
      console.log('[CallService] Audio already started for this call, skipping duplicate start');
      return;
    }
    if (this.audioState === 'starting') {
      console.log('[CallService] Audio start already in progress, skipping');
      return;
    }

    this.audioState = 'starting';
    console.log('[CallService] startAudioSessionNow - isVideo:', isVideo);

    // Start InCallManager for speaker/proximity
    const manager = await loadInCallManager();
    if (manager) {
      try {
        manager.start({
          media: isVideo ? 'video' : 'audio',
          auto: true,
          ringback: '',
        });
        manager.setSpeakerphoneOn(isVideo);
        manager.setKeepScreenOn(true);
        console.log('[CallService] InCallManager started for', isVideo ? 'video' : 'audio');
      } catch (e) {
        console.warn('[CallService] Failed to start InCallManager:', e);
      }
    }

    // Mark audio as started for this call
    this.audioState = 'started';
    this.audioStartedForCallId = this.currentSession?.callId || null;
    console.log('[CallService] Audio state set to started for callId:', this.audioStartedForCallId);
  }

  // iOS PATH A: Add audio track after CallKit activates audio session
  // SDP was already created with silent audio transceiver
  // Now we capture audio and use replaceTrack to add it (no renegotiation!)
  // IMPORTANT: Do NOT use addTrack - it triggers renegotiation which crashes iOS
  private async addAudioTrackAfterActivation(callId: string, isVideo: boolean): Promise<void> {
    console.log('[CallService] iOS PATH A: addAudioTrackAfterActivation for callId:', callId);

    // CRITICAL: Check if audio attach is allowed (false after didDeactivateAudioSession)
    if (!this.audioAttachAllowed) {
      console.warn('[CallService] iOS PATH A: Audio attach not allowed (deactivated), skipping');
      return;
    }

    // Idempotency check - prevent double audio attachment
    if (this.audioAttachedForCallId === callId) {
      console.log('[CallService] iOS PATH A: Audio already attached for this call, skipping');
      return;
    }

    if (!this.peerConnection) {
      console.error('[CallService] iOS PATH A: No peer connection!');
      return;
    }

    if (!this.currentSession || this.currentSession.callId !== callId) {
      console.warn('[CallService] iOS PATH A: Session mismatch, aborting audio attachment');
      return;
    }

    // Check session state - don't attach if call is ending/ended
    if (this.currentSession.state === 'ended') {
      console.warn('[CallService] iOS PATH A: Session ended, aborting audio attachment');
      return;
    }

    // Start InCallManager for speaker/proximity
    const manager = await loadInCallManager();
    if (manager) {
      try {
        manager.start({ media: isVideo ? 'video' : 'audio', auto: true, ringback: '' });
        manager.setSpeakerphoneOn(isVideo);
        manager.setKeepScreenOn(true);
        console.log('[CallService] iOS PATH A: InCallManager started');
      } catch (e) {
        console.warn('[CallService] iOS PATH A: Failed to start InCallManager:', e);
      }
    }

    this.audioState = 'started';
    this.audioStartedForCallId = callId;

    try {
      // Micro-delay to let audio route stabilize after CallKit activation
      // This prevents "mic exists but no sound" issues on iOS
      console.log('[CallService] iOS PATH A: Waiting for audio route to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 80));

      // Double-check all conditions after delay - things can change!
      if (!this.currentSession || this.currentSession.callId !== callId) {
        console.warn('[CallService] iOS PATH A: Session changed during delay, aborting');
        return;
      }
      if (!this.audioAttachAllowed) {
        console.warn('[CallService] iOS PATH A: Audio attach disallowed during delay, aborting');
        return;
      }
      if (this.currentSession.state === 'ended') {
        console.warn('[CallService] iOS PATH A: Session ended during delay, aborting');
        return;
      }
      if (this.audioAttachedForCallId === callId) {
        console.warn('[CallService] iOS PATH A: Audio already attached during delay, aborting');
        return;
      }

      // Capture audio now that CallKit activated the session
      const { mediaDevices } = await import('react-native-webrtc');
      console.log('[CallService] iOS PATH A: Capturing audio...');

      const audioStream = await mediaDevices.getUserMedia({ audio: true, video: false });
      const audioTrack = (audioStream as any).getAudioTracks()[0];

      if (!audioTrack) {
        console.error('[CallService] iOS PATH A: No audio track captured!');
        return;
      }

      console.log('[CallService] iOS PATH A: Audio captured, finding sender for replaceTrack...');

      // Find the audio sender via transceivers (MOST RELIABLE)
      // IMPORTANT: Do NOT fall back to addTrack - it causes renegotiation which crashes iOS
      let audioReplaced = false;
      let targetTransceiver: any = null;

      // PRIMARY METHOD: Use getTransceivers - most reliable for targeting the correct sender
      const transceivers = (this.peerConnection as any).getTransceivers?.();
      if (transceivers && Array.isArray(transceivers)) {
        console.log('[CallService] iOS PATH A: Found', transceivers.length, 'transceivers');

        // For OUTGOING calls: We added the audio transceiver ourselves
        // It will have receiver.track.kind === 'audio' and sender.track === null (initially silent)
        // For INCOMING calls: The offer created the audio transceiver
        // Same logic applies - find audio transceiver with null sender track

        // Find audio transceiver by checking:
        // 1. receiver.track.kind === 'audio' (standard way to identify audio transceiver)
        // 2. mid !== null (transceiver has been negotiated in SDP)
        for (let i = 0; i < transceivers.length; i++) {
          const t = transceivers[i];
          const receiverKind = t.receiver?.track?.kind;
          const senderTrack = t.sender?.track;
          const mid = t.mid;
          const direction = t.direction;

          console.log(`[CallService] iOS PATH A: Transceiver[${i}] - mid=${mid}, receiverKind=${receiverKind}, senderTrack=${senderTrack ? senderTrack.kind : 'null'}, direction=${direction}`);

          // Target: audio transceiver that hasn't had a local track attached yet
          if (receiverKind === 'audio' && mid !== null) {
            targetTransceiver = t;
            console.log(`[CallService] iOS PATH A: Selected transceiver[${i}] (mid=${mid}) as audio target`);
            break;
          }
        }

        // Replace track on the target transceiver's sender
        if (targetTransceiver?.sender && typeof targetTransceiver.sender.replaceTrack === 'function') {
          await targetTransceiver.sender.replaceTrack(audioTrack);
          audioReplaced = true;
          console.log('[CallService] iOS PATH A: Audio track replaced via transceiver.sender!');

          // CRITICAL: Verify and fix transceiver direction
          // Sometimes direction can be recvonly or inactive, meaning audio won't be sent
          if (targetTransceiver.direction !== 'sendrecv') {
            console.warn('[CallService] iOS PATH A: Transceiver direction is', targetTransceiver.direction, '- fixing to sendrecv');
            try {
              targetTransceiver.direction = 'sendrecv';
              console.log('[CallService] iOS PATH A: Transceiver direction set to sendrecv');
            } catch (dirError) {
              console.warn('[CallService] iOS PATH A: Could not set direction:', dirError);
            }
          }

          // CRITICAL: Ensure track is enabled (can be disabled after route changes)
          if (!audioTrack.enabled) {
            console.warn('[CallService] iOS PATH A: Audio track was disabled - enabling');
            audioTrack.enabled = true;
          }
          console.log('[CallService] iOS PATH A: Audio track enabled =', audioTrack.enabled);
        }
      }

      // FALLBACK: Try getSenders if getTransceivers didn't work (older RN-WebRTC versions)
      if (!audioReplaced) {
        console.log('[CallService] iOS PATH A: Fallback to getSenders...');
        const senders = (this.peerConnection as any).getSenders?.();
        if (senders && Array.isArray(senders)) {
          // Find sender with null track (our silent transceiver's sender)
          const audioSender = senders.find((s: any) =>
            s.track === null && (s._trackKind === 'audio' || !s._trackKind)
          );

          if (audioSender && typeof audioSender.replaceTrack === 'function') {
            await audioSender.replaceTrack(audioTrack);
            audioReplaced = true;
            console.log('[CallService] iOS PATH A: Audio track replaced via getSenders fallback!');

            // Ensure track is enabled
            if (!audioTrack.enabled) {
              audioTrack.enabled = true;
            }
          }
        }
      }

      if (!audioReplaced) {
        // DO NOT use addTrack as fallback - it triggers renegotiation
        console.error('[CallService] iOS PATH A: Could not find sender for replaceTrack! Audio will not work.');
        console.error('[CallService] iOS PATH A: Transceivers dump:', JSON.stringify(
          transceivers?.map((t: any, i: number) => ({
            i,
            mid: t.mid,
            direction: t.direction,
            receiverKind: t.receiver?.track?.kind,
            senderTrack: t.sender?.track ? t.sender.track.kind : null
          })) || 'no transceivers'
        ));
        return;
      }

      // Mark audio as attached for this call (idempotency)
      this.audioAttachedForCallId = callId;

      // Store audio track reference
      if (this.localStream) {
        try {
          (this.localStream as any).addTrack(audioTrack);
        } catch (e) {
          console.warn('[CallService] iOS PATH A: Could not add track to localStream:', e);
        }
      } else {
        this.localStream = audioStream as unknown as MediaStream;
      }

      console.log('[CallService] iOS PATH A: Audio setup complete');
    } catch (error) {
      console.error('[CallService] iOS PATH A: Failed to add audio track:', error);
    }
  }

  // Stop the audio session
  private async stopAudioSession(): Promise<void> {
    // Idempotency check - prevent double-stop
    if (this.audioState === 'idle' || this.audioState === 'stopping') {
      console.log('[CallService] Audio already stopped/stopping, skipping duplicate stop');
      return;
    }

    this.audioState = 'stopping';
    console.log('[CallService] Stopping audio session...');

    const manager = await loadInCallManager();
    if (manager) {
      try {
        manager.stop();
        console.log('[CallService] Audio session stopped');
      } catch (e) {
        console.warn('[CallService] Failed to stop audio session:', e);
      }
    }

    this.audioState = 'idle';
    this.audioStartedForCallId = null;
  }

  // iOS 26 FIX: Complete outgoing call setup AFTER audio session activation
  // This is called from onAudioSessionActivated when we have a pending outgoing call
  private async completeOutgoingCallSetup(callId: string, contactId: string, isVideo: boolean): Promise<void> {
    console.log('[CallService] iOS: completeOutgoingCallSetup for callId:', callId);

    // Validate session still exists and matches
    if (!this.currentSession || this.currentSession.callId !== callId) {
      console.warn('[CallService] iOS: Session mismatch in completeOutgoingCallSetup');
      return;
    }

    if (this.currentSession.state === 'ended') {
      console.warn('[CallService] iOS: Session ended before outgoing setup could complete');
      return;
    }

    try {
      // Start InCallManager for speaker/proximity
      const manager = await loadInCallManager();
      if (manager) {
        try {
          manager.start({ media: isVideo ? 'video' : 'audio', auto: true, ringback: '' });
          manager.setSpeakerphoneOn(isVideo);
          manager.setKeepScreenOn(true);
          console.log('[CallService] iOS: InCallManager started for outgoing call');
        } catch (e) {
          console.warn('[CallService] iOS: Failed to start InCallManager:', e);
        }
      }

      this.audioState = 'started';
      this.audioStartedForCallId = callId;

      // Small delay for audio route stabilization
      await new Promise(resolve => setTimeout(resolve, 80));

      // Re-validate after delay
      if (!this.currentSession || this.currentSession.callId !== callId || this.currentSession.state === 'ended') {
        console.warn('[CallService] iOS: Session changed during outgoing setup delay');
        return;
      }

      // 1. Create peer connection (NOW it's safe to add audio transceiver)
      console.log('[CallService] iOS: Creating peer connection after audio activation');
      await this.createPeerConnection();

      // 2. Capture audio and video (if video call)
      const { mediaDevices } = await import('react-native-webrtc');

      if (isVideo) {
        console.log('[CallService] iOS: Capturing audio + video for video call');
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        this.localStream = stream as unknown as MediaStream;

        // Add all tracks
        const tracks = (stream as any).getTracks();
        tracks.forEach((track: any) => {
          this.peerConnection!.addTrack(track, stream as any);
        });
        console.log('[CallService] iOS: Added', tracks.length, 'tracks to peer connection');
      } else {
        console.log('[CallService] iOS: Capturing audio for voice call');
        const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        this.localStream = stream as unknown as MediaStream;

        const audioTrack = (stream as any).getAudioTracks()[0];
        if (audioTrack && this.peerConnection) {
          this.peerConnection.addTrack(audioTrack, stream as any);
          console.log('[CallService] iOS: Audio track added');
        }
      }

      this.audioAttachedForCallId = callId;

      // 3. Create and send offer
      console.log('[CallService] iOS: Creating SDP offer');
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });
      await this.peerConnection!.setLocalDescription(offer);
      console.log('[CallService] iOS: Local description set');

      // 4. Send offer
      console.log('[CallService] iOS: Sending call_offer');
      this.sendSignalingMessage(contactId, {
        type: 'call_offer',
        callId,
        sdp: offer.sdp,
        isVideo,
      });

      console.log('[CallService] iOS: Outgoing call setup complete');
    } catch (error) {
      console.error('[CallService] iOS: Failed to complete outgoing call setup:', error);
      await this.endCall();
    }
  }

  // iOS 26 FIX: Complete incoming call setup AFTER audio session activation
  // This is called from onAudioSessionActivated when we have a pending incoming call
  private async completeIncomingCallSetup(callId: string, contactId: string, isVideo: boolean, remoteSdp: string): Promise<void> {
    console.log('[CallService] iOS: completeIncomingCallSetup for callId:', callId);

    // Validate session still exists and matches
    if (!this.currentSession || this.currentSession.callId !== callId) {
      console.warn('[CallService] iOS: Session mismatch in completeIncomingCallSetup');
      return;
    }

    if (this.currentSession.state === 'ended') {
      console.warn('[CallService] iOS: Session ended before incoming setup could complete');
      return;
    }

    try {
      // Start InCallManager for speaker/proximity
      const manager = await loadInCallManager();
      if (manager) {
        try {
          manager.start({ media: isVideo ? 'video' : 'audio', auto: true, ringback: '' });
          manager.setSpeakerphoneOn(isVideo);
          manager.setKeepScreenOn(true);
          console.log('[CallService] iOS: InCallManager started for incoming call');
        } catch (e) {
          console.warn('[CallService] iOS: Failed to start InCallManager:', e);
        }
      }

      this.audioState = 'started';
      this.audioStartedForCallId = callId;

      // Small delay for audio route stabilization
      await new Promise(resolve => setTimeout(resolve, 80));

      // Re-validate after delay
      if (!this.currentSession || this.currentSession.callId !== callId || this.currentSession.state === 'ended') {
        console.warn('[CallService] iOS: Session changed during incoming setup delay');
        return;
      }

      // 1. Create peer connection (NOW it's safe - audio session is active)
      console.log('[CallService] iOS: Creating peer connection after audio activation');
      await this.createPeerConnection();

      // 2. Set remote description (the offer)
      console.log('[CallService] iOS: Setting remote description');
      await this.peerConnection!.setRemoteDescription({
        type: 'offer',
        sdp: remoteSdp,
      });

      // 3. Process pending ICE candidates
      await this.processPendingIceCandidates();

      // 4. Capture audio and video (if video call)
      const { mediaDevices } = await import('react-native-webrtc');

      if (isVideo) {
        console.log('[CallService] iOS: Capturing audio + video for video call');
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        this.localStream = stream as unknown as MediaStream;

        // Add all tracks
        const tracks = (stream as any).getTracks();
        tracks.forEach((track: any) => {
          this.peerConnection!.addTrack(track, stream as any);
        });
        console.log('[CallService] iOS: Added', tracks.length, 'tracks to peer connection');
      } else {
        console.log('[CallService] iOS: Capturing audio for voice call');
        const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        this.localStream = stream as unknown as MediaStream;

        const audioTrack = (stream as any).getAudioTracks()[0];
        if (audioTrack && this.peerConnection) {
          this.peerConnection.addTrack(audioTrack, stream as any);
          console.log('[CallService] iOS: Audio track added');
        }
      }

      this.audioAttachedForCallId = callId;

      // 5. Create and send answer
      console.log('[CallService] iOS: Creating SDP answer');
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);
      console.log('[CallService] iOS: Local description set');

      // 6. Send answer
      console.log('[CallService] iOS: Sending call_answer');
      this.sendSignalingMessage(contactId, {
        type: 'call_answer',
        callId,
        sdp: answer.sdp,
      });

      console.log('[CallService] iOS: Incoming call setup complete');
    } catch (error) {
      console.error('[CallService] iOS: Failed to complete incoming call setup:', error);
      await this.endCall();
    }
  }

  // Request audio session start - on iOS waits for CallKit, on Android starts immediately
  // needsAudioCapture: if true, audio will be captured when CallKit activates (delayed capture for iOS)
  private async requestAudioSessionStart(isVideo: boolean, withRingback: boolean = false, needsAudioCapture: boolean = false): Promise<void> {
    if (Platform.OS === 'ios') {
      // iOS: Don't start audio directly, wait for CallKit to activate the session
      // Store pending request so we can start when activated
      // needsAudioCapture tells us to also capture audio when session activates
      console.log('[CallService] iOS: Audio session start requested, waiting for CallKit activation. needsAudioCapture:', needsAudioCapture);
      this.pendingAudioStart = { isVideo, needsAudioCapture };

      // If already activated (shouldn't happen but handle gracefully)
      if (this.isAudioSessionActivated) {
        console.log('[CallService] iOS: Audio session already activated, starting now');
        this.pendingAudioStart = null;
        await this.startAudioSessionNow(isVideo, needsAudioCapture);
      }
    } else {
      // Android: Start audio immediately, no CallKit coordination needed
      const manager = await loadInCallManager();
      if (manager) {
        try {
          manager.start({
            media: isVideo ? 'video' : 'audio',
            auto: true,
            ringback: withRingback ? '_DTMF_' : '',
          });
          manager.setSpeakerphoneOn(isVideo);
          manager.setKeepScreenOn(true);
          console.log('[CallService] Android: Audio session started for', isVideo ? 'video' : 'audio');
        } catch (e) {
          console.warn('[CallService] Android: Failed to start audio session:', e);
        }
      }
    }
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

  // Initialize media stream (audio + optional video)
  // Initialize media for call
  // On iOS: We MUST NOT capture audio until CallKit activates the audio session
  // So on iOS, we only capture video here. Audio is captured later in startAudioSessionNow.
  // On Android: We capture both audio and video immediately.
  async initializeMedia(isVideo: boolean): Promise<MediaStream> {
    try {
      // Dynamically import react-native-webrtc
      const { mediaDevices } = await import('react-native-webrtc');

      // iOS: Don't capture audio here - wait for CallKit to activate audio session
      // Audio will be captured in startAudioSessionNow() after didActivateAudioSession
      const captureAudio = Platform.OS !== 'ios';

      // Request media with constraints
      const constraints = {
        audio: captureAudio, // false on iOS, true on Android
        video: isVideo ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } : false,
      };

      console.log('[CallService] initializeMedia constraints:', JSON.stringify(constraints));

      // If iOS and audio-only call, we might not need to capture anything here
      // Just create an empty stream and add audio later
      if (Platform.OS === 'ios' && !isVideo) {
        console.log('[CallService] iOS audio-only call: skipping media capture, will capture audio after CallKit activation');
        // Create a placeholder - audio will be added after CallKit activates
        this.localStream = null as any;
        return this.localStream;
      }

      // Use react-native-webrtc's mediaDevices
      const stream = await mediaDevices.getUserMedia(constraints);
      this.localStream = stream as unknown as MediaStream;
      console.log('[CallService] Local media stream initialized (audio:', captureAudio, ', video:', isVideo, ')');
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
    const callerName = contact.nickname || contact.username || contact.whisperId;

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

    // Set up headphone button listeners
    this.setupAudioEventListeners();

    this.notifyStateChange('calling');

    // iOS 26 FIX: Delay ALL WebRTC setup until CallKit activates audio session
    // Calling addTransceiver('audio') before audio session activation crashes on iOS 26
    if (Platform.OS === 'ios') {
      console.log('[CallService] iOS: Starting outgoing call - waiting for audio activation');

      try {
        // 1. Register with CallKit ONLY - this triggers audio session activation
        console.log('[CallService] iOS: Registering with CallKit');
        await callKeepService.startCall(callId, callerName, contact.whisperId, isVideo);

        // 2. Store pending call setup - WebRTC setup happens after audio activation
        this.pendingCallSetup = {
          callId,
          contactId: contact.whisperId,
          isVideo,
          isIncoming: false,
          createdAt: Date.now(),
        };
        console.log('[CallService] iOS: Call registered with CallKit, waiting for audio activation');

        // If audio session is already activated (edge case), complete setup now
        if (this.isAudioSessionActivated) {
          console.log('[CallService] iOS: Audio already activated, completing setup now');
          this.pendingCallSetup = null;
          await this.completeOutgoingCallSetup(callId, contact.whisperId, isVideo);
        }

        return callId;
      } catch (error) {
        console.error('[CallService] iOS: Failed to start call:', error);
        await this.endCall();
        throw error;
      }
    }

    // Android: Normal flow - capture audio immediately and create offer
    try {
      // Start audio session with ringback for outgoing call
      await this.requestAudioSessionStart(isVideo, true, false);

      // Initialize local media
      console.log('[CallService] Android: Initializing media for', isVideo ? 'video' : 'audio', 'call');
      await this.initializeMedia(isVideo);
      console.log('[CallService] Android: Media initialized successfully');

      // Create peer connection
      console.log('[CallService] Android: Creating peer connection');
      await this.createPeerConnection();
      console.log('[CallService] Android: Peer connection created');

      // Add local tracks to peer connection
      if (this.localStream && this.peerConnection) {
        const tracks = this.localStream.getTracks();
        if (tracks && tracks.length > 0) {
          console.log('[CallService] Android: Adding', tracks.length, 'local tracks to peer connection');
          tracks.forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
          });
        } else {
          console.warn('[CallService] Android: No local tracks available to add');
        }
      }

      // Create offer
      console.log('[CallService] Android: Creating SDP offer');
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });
      console.log('[CallService] Android: SDP offer created');

      await this.peerConnection!.setLocalDescription(offer);
      console.log('[CallService] Android: Local description set');

      // Send call offer via signaling
      console.log('[CallService] Android: Sending call_offer to', contact.whisperId);
      this.sendSignalingMessage(contact.whisperId, {
        type: 'call_offer',
        callId,
        sdp: offer.sdp,
        isVideo,
      });

      console.log('[CallService] Android: Outgoing call started:', callId);
      return callId;
    } catch (error) {
      console.error('[CallService] Failed to start call:', error);
      await this.endCall();
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

    // Set up headphone button listeners
    this.setupAudioEventListeners();

    this.notifyStateChange('connecting');

    // iOS 26 FIX: Delay ALL WebRTC setup until CallKit activates audio session
    // Setting remote description also creates transceivers which can crash before activation
    if (Platform.OS === 'ios') {
      console.log('[CallService] iOS: Accepting incoming call - checking audio activation');

      // Store pending call setup with remote SDP
      this.pendingCallSetup = {
        callId,
        contactId,
        isVideo,
        isIncoming: true,
        remoteSdp,
        createdAt: Date.now(),
      };

      // If audio session is already activated (user answered via CallKit UI), complete setup now
      if (this.isAudioSessionActivated) {
        console.log('[CallService] iOS: Audio already activated, completing setup now');
        this.pendingCallSetup = null;
        await this.completeIncomingCallSetup(callId, contactId, isVideo, remoteSdp);
      } else {
        console.log('[CallService] iOS: Waiting for audio activation before WebRTC setup');
      }
      return;
    }

    // Android: Normal flow - capture audio immediately and create answer
    try {
      // Start audio session
      await this.requestAudioSessionStart(isVideo, false, false);

      // Initialize local media
      console.log('[CallService] Android: Accepting call - initializing media for', isVideo ? 'video' : 'audio');
      await this.initializeMedia(isVideo);
      console.log('[CallService] Android: Media initialized for accepting call');

      // Create peer connection
      console.log('[CallService] Android: Creating peer connection for incoming call');
      await this.createPeerConnection();
      console.log('[CallService] Android: Peer connection created');

      // Add local tracks
      if (this.localStream && this.peerConnection) {
        const tracks = this.localStream.getTracks();
        if (tracks && tracks.length > 0) {
          console.log('[CallService] Android: Adding', tracks.length, 'local tracks');
          tracks.forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
          });
        } else {
          console.warn('[CallService] Android: No local tracks available to add');
        }
      }

      // Set remote description (the offer)
      console.log('[CallService] Android: Setting remote description (offer)');
      await this.peerConnection!.setRemoteDescription({
        type: 'offer',
        sdp: remoteSdp,
      });
      console.log('[CallService] Android: Remote description set');

      // Process any pending ICE candidates
      console.log('[CallService] Android: Processing', this.pendingIceCandidates.length, 'pending ICE candidates');
      await this.processPendingIceCandidates();

      // Create answer
      console.log('[CallService] Android: Creating SDP answer');
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);
      console.log('[CallService] Android: Local description (answer) set');

      // Send answer via signaling
      console.log('[CallService] Android: Sending call_answer to', contactId);
      this.sendSignalingMessage(contactId, {
        type: 'call_answer',
        callId,
        sdp: answer.sdp,
      });

      console.log('[CallService] Android: Call accepted:', callId);
    } catch (error) {
      console.error('[CallService] Failed to accept call:', error);
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
      const { mediaDevices } = await import('react-native-webrtc');
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
      // Don't call videoTrack.stop() directly - it can crash TurboModules on iOS 26
      // Just disable and remove the track, the GC will clean it up
      videoTrack.enabled = false;
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
    // On iOS, ringback is handled by CallKit, so we don't need to do anything special
    // On Android, we need to stop ringback and reconfigure
    if (Platform.OS !== 'ios') {
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
          console.log('[CallService] Android: Ringback stopped, active call mode configured');
        } catch (e) {
          console.warn('[CallService] Failed to reconfigure InCallManager:', e);
        }
      }
    } else {
      console.log('[CallService] iOS: Ringback is handled by CallKit');
    }
  }

  // Private: Create peer connection
  private async createPeerConnection(): Promise<void> {
    // Outer try-catch to handle any native WebRTC exceptions that could crash Hermes
    try {
      // Dynamically import react-native-webrtc
      console.log('[CallService] Importing WebRTC module...');
      let RTCPeerConnection: any;
      let RNMediaStream: any;

      try {
        const webrtcModule = await import('react-native-webrtc');
        RTCPeerConnection = webrtcModule.RTCPeerConnection;
        RNMediaStream = webrtcModule.MediaStream;
      } catch (importError) {
        console.error('[CallService] Failed to import WebRTC module:', importError);
        throw new Error('WebRTC module not available');
      }

      if (!RTCPeerConnection) {
        console.error('[CallService] RTCPeerConnection not found in module');
        throw new Error('RTCPeerConnection not available');
      }
      console.log('[CallService] WebRTC module imported successfully');

      // Small delay to let any previous operations settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get ICE servers with TURN credentials
      let iceServers: RTCIceServer[];
      try {
        iceServers = await this.getIceServers();
      } catch (iceError) {
        console.warn('[CallService] Failed to get ICE servers, using defaults:', iceError);
        iceServers = DEFAULT_ICE_SERVERS;
      }
      console.log('[CallService] Using ICE servers:', iceServers.map(s => s.urls));

      console.log('[CallService] Creating RTCPeerConnection...');

      // CRITICAL: Wrap RTCPeerConnection instantiation with retry mechanism
      // This prevents TurboModule NSException crashes from reaching Hermes
      let peerConnection: any = null;
      let creationError: Error | null = null;
      const maxRetries = 2;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[CallService] RTCPeerConnection creation attempt ${attempt}/${maxRetries}`);
          peerConnection = new RTCPeerConnection({ iceServers });

          if (peerConnection) {
            console.log('[CallService] RTCPeerConnection created successfully');
            creationError = null;
            break;
          }
        } catch (error) {
          creationError = error as Error;
          console.error(`[CallService] RTCPeerConnection attempt ${attempt} failed:`, creationError?.message || error);

          // Wait before retry to let event loop clear any pending native errors
          if (attempt < maxRetries) {
            console.log('[CallService] Waiting before retry...');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      if (!peerConnection) {
        const errorMsg = creationError?.message || 'Unknown error';
        console.error('[CallService] All RTCPeerConnection creation attempts failed:', errorMsg);
        throw new Error(`Failed to create peer connection after ${maxRetries} attempts: ${errorMsg}`);
      }

      this.peerConnection = peerConnection as unknown as RTCPeerConnection;

      // iOS PATH A: Add audio transceiver upfront for OUTGOING calls only
      // The transceiver starts with no track (silent), audio will be added via replaceTrack
      // after CallKit activates the audio session. This prevents renegotiation.
      // For incoming calls, the offer already has audio m-line, so we don't need to add it.
      if (Platform.OS === 'ios' && this.currentSession && !this.currentSession.isIncoming) {
        try {
          console.log('[CallService] iOS PATH A: Adding audio transceiver for outgoing call');
          (this.peerConnection as any).addTransceiver('audio', { direction: 'sendrecv' });
          console.log('[CallService] iOS PATH A: Audio transceiver added');
        } catch (e) {
          console.warn('[CallService] iOS PATH A: Failed to add audio transceiver:', e);
        }
      }

    // Handle ICE candidates - wrapped in try-catch to prevent native crashes
    (this.peerConnection as any).onicecandidate = (event: any) => {
      try {
        // Capture session data locally to prevent race condition with cleanup
        const session = this.currentSession;
        if (event && event.candidate && session && !this.isCleaningUp) {
          let candidateData: any;
          try {
            candidateData = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
          } catch (e) {
            console.warn('[CallService] Failed to serialize ICE candidate:', e);
            candidateData = event.candidate;
          }
          this.sendSignalingMessage(session.contactId, {
            type: 'ice_candidate',
            callId: session.callId,
            candidate: candidateData,
          });
        }
      } catch (e) {
        console.error('[CallService] onicecandidate handler error:', e);
      }
    };

    // Handle connection state changes - wrapped in try-catch to prevent native crashes
    (this.peerConnection as any).onconnectionstatechange = async () => {
      try {
        // Early exit if cleanup is in progress to prevent race conditions
        if (this.isCleaningUp) {
          console.log('[CallService] Ignoring connection state change - cleanup in progress');
          return;
        }

        // Safe access to connection state
        let state: string | undefined;
        try {
          state = (this.peerConnection as any)?.connectionState;
        } catch (e) {
          console.warn('[CallService] Failed to get connectionState:', e);
          return;
        }
        console.log('[CallService] Connection state:', state);

        // Capture session locally to prevent race condition
        const session = this.currentSession;

        if (state === 'connected') {
          // Stop ringback as backup (in case call_answer handler didn't run first)
          // Only for outgoing calls that had ringback
          if (session && !session.isIncoming) {
            try {
              await this.stopRingbackAndConfigureActiveCall();
            } catch (e) {
              console.warn('[CallService] Failed to stop ringback:', e);
            }
          }

          // Re-check session after async operation
          if (this.currentSession && !this.isCleaningUp) {
            this.currentSession.state = 'connected';
            this.currentSession.startTime = Date.now();

            // iOS: Tell CallKit the call is now active/connected
            if (Platform.OS === 'ios') {
              console.log('[CallService] iOS: Reporting call connected to CallKit');
              callKeepService.reportCallConnected(this.currentSession.callId);
            }

            this.notifyStateChange('connected');
          }
        } else if (state === 'disconnected' || state === 'failed') {
          // Only end call if not already cleaning up
          if (!this.isCleaningUp) {
            console.log('[CallService] WebRTC connection failed/disconnected, ending call');
            await this.endCall();
          }
        }
      } catch (e) {
        console.error('[CallService] onconnectionstatechange handler error:', e);
      }
    };

    // Handle ICE connection state changes (more granular than connection state)
    (this.peerConnection as any).oniceconnectionstatechange = () => {
      try {
        const iceState = (this.peerConnection as any)?.iceConnectionState;
        console.log('[CallService] ICE connection state:', iceState);
      } catch (e) {
        console.error('[CallService] oniceconnectionstatechange handler error:', e);
      }
    };

    // Handle ICE gathering state changes
    (this.peerConnection as any).onicegatheringstatechange = () => {
      try {
        const gatheringState = (this.peerConnection as any)?.iceGatheringState;
        console.log('[CallService] ICE gathering state:', gatheringState);
      } catch (e) {
        console.error('[CallService] onicegatheringstatechange handler error:', e);
      }
    };

    // Handle signaling state changes
    (this.peerConnection as any).onsignalingstatechange = () => {
      try {
        const signalingState = (this.peerConnection as any)?.signalingState;
        console.log('[CallService] Signaling state:', signalingState);
      } catch (e) {
        console.error('[CallService] onsignalingstatechange handler error:', e);
      }
    };

    // Handle remote tracks - wrapped in try-catch to prevent native crashes
    (this.peerConnection as any).ontrack = (event: any) => {
      try {
        console.log('[CallService] Remote track received:', event?.track?.kind);
        console.log('[CallService] Event streams:', event?.streams?.length || 0);

        // Use the stream from the event directly (preferred method)
        if (event && event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0] as unknown as MediaStream;
          console.log('[CallService] Using event stream directly');
        } else if (event && event.track) {
          // Fallback: create stream and add track
          if (!this.remoteStream) {
            try {
              this.remoteStream = new RNMediaStream() as unknown as MediaStream;
              console.log('[CallService] Created new remote stream');
            } catch (streamError) {
              console.error('[CallService] Failed to create remote MediaStream:', streamError);
              return;
            }
          }
          try {
            (this.remoteStream as any).addTrack(event.track);
            console.log('[CallService] Added track to remote stream');
          } catch (trackError) {
            console.warn('[CallService] Failed to add track to remote stream:', trackError);
          }
        }

        if (this.remoteStreamHandler && this.remoteStream) {
          console.log('[CallService] Notifying remote stream handler');
          try {
            this.remoteStreamHandler(this.remoteStream);
          } catch (handlerError) {
            console.error('[CallService] remoteStreamHandler error:', handlerError);
          }
        }
      } catch (e) {
        console.error('[CallService] ontrack handler error:', e);
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
          await this.endCall();
        }
        break;

      case 'call_reject':
        // Call was rejected
        if (this.currentSession?.callId === message.callId) {
          const sessionToClean = this.currentSession;
          if (sessionToClean) {
            this.currentSession = null;
            this.notifyStateChange('ended');
            // Await cleanup to ensure resources are released
            await this.cleanup(sessionToClean);
          }
        }
        break;

      case 'call_end':
        // Call ended by remote peer
        if (this.currentSession?.callId === message.callId) {
          const sessionToClean = this.currentSession;
          if (sessionToClean) {
            this.currentSession = null;
            this.notifyStateChange('ended');
            // Await cleanup to ensure resources are released
            await this.cleanup(sessionToClean);
          }
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

      // Reset audio session state
      this.pendingAudioStart = null;
      this.audioState = 'idle';
      this.audioStartedForCallId = null;
      // Reset iOS PATH A state - CRITICAL: prevent ghost audio attach
      this.pendingCallSetup = null;
      this.audioAttachedForCallId = null;
      this.audioAttachAllowed = false;
      // Note: isAudioSessionActivated is managed by CallKit callbacks on iOS
      // On Android, we reset it here
      if (Platform.OS !== 'ios') {
        this.isAudioSessionActivated = false;
      }

      // Stop InCallManager
      // On iOS, this is also handled by onAudioSessionDeactivated callback
      // but we call it here as a fallback for edge cases
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

      // Stop local stream - use release() instead of track.stop() to avoid
      // TurboModule crashes on iOS 26 when stopping video capture
      if (this.localStream) {
        try {
          // First disable all tracks (safer than stopping)
          const tracks = this.localStream.getTracks();
          tracks.forEach(track => {
            try {
              track.enabled = false;
              console.log('[CallService] Disabled track:', track.kind);
            } catch (e) {
              console.warn('[CallService] Failed to disable track:', e);
            }
          });

          // Use release() method if available (react-native-webrtc specific)
          // This is safer than calling track.stop() which can crash TurboModules on iOS 26
          if (typeof (this.localStream as any).release === 'function') {
            (this.localStream as any).release();
            console.log('[CallService] Released local stream');
          } else {
            // Fallback: stop audio tracks only (video track.stop() crashes on iOS 26)
            tracks.forEach(track => {
              try {
                if (track.kind === 'audio') {
                  track.stop();
                  console.log('[CallService] Stopped audio track');
                }
                // Skip video track.stop() - release() handles it or it will be GC'd
              } catch (e) {
                console.warn('[CallService] Failed to stop track:', e);
              }
            });
          }
        } catch (e) {
          console.warn('[CallService] Failed to cleanup local stream:', e);
        }
        this.localStream = null;
      }

      // Clear remote stream - use release() to avoid TurboModule crashes
      if (this.remoteStream) {
        try {
          // Disable tracks first
          const tracks = this.remoteStream.getTracks();
          tracks.forEach(track => {
            try {
              track.enabled = false;
            } catch (e) {
              // Ignore
            }
          });

          // Use release() if available
          if (typeof (this.remoteStream as any).release === 'function') {
            (this.remoteStream as any).release();
            console.log('[CallService] Released remote stream');
          }
        } catch (e) {
          // Ignore errors on remote stream cleanup
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

      // Clear TURN credentials cache to ensure fresh credentials for next call
      this.turnCredentials = null;
      this.turnCredentialsExpiry = 0;

      // Remove audio event listeners (headphone button support)
      this.removeAudioEventListeners();

      // Clear session (may already be null if endCall was called)
      if (this.currentSession) {
        this.currentSession = null;
      }

      // Small delay to ensure all resources are released before allowing new calls
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('[CallService] Cleanup complete - ready for new call');
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

      // Reset audio session state
      this.pendingAudioStart = null;
      this.audioState = 'idle';
      this.audioStartedForCallId = null;
      // Reset iOS PATH A state - CRITICAL: prevent ghost audio attach
      this.pendingCallSetup = null;
      this.audioAttachedForCallId = null;
      this.audioAttachAllowed = false;
      if (Platform.OS !== 'ios') {
        this.isAudioSessionActivated = false;
      }

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

      // Stop all streams - use release() to avoid TurboModule crashes on iOS 26
      if (this.localStream) {
        try {
          // Disable all tracks first
          this.localStream.getTracks().forEach(track => {
            try { track.enabled = false; } catch (e) {}
          });
          // Use release() if available (safer than track.stop() for video)
          if (typeof (this.localStream as any).release === 'function') {
            (this.localStream as any).release();
          }
        } catch (e) {}
        this.localStream = null;
      }

      if (this.remoteStream) {
        try {
          // Disable all tracks first
          this.remoteStream.getTracks().forEach(track => {
            try { track.enabled = false; } catch (e) {}
          });
          // Use release() if available
          if (typeof (this.remoteStream as any).release === 'function') {
            (this.remoteStream as any).release();
          }
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

      // Clear TURN credentials cache
      this.turnCredentials = null;
      this.turnCredentialsExpiry = 0;

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

      // Small delay before allowing new calls
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('[CallService] Force reset complete - ready for new call');
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
