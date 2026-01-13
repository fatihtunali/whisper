import { CallSession, CallState, Contact } from '../types';
import { generateId } from '../utils/helpers';
import { messagingService } from './MessagingService';

// WebRTC configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

  constructor() {
    // Set up signaling message handlers
    this.setupSignalingHandlers();
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
      this.localStream = stream as MediaStream;
      console.log('[CallService] Local media stream initialized');
      return this.localStream;
    } catch (error) {
      console.error('[CallService] Failed to get user media:', error);
      throw error;
    }
  }

  // Start an outgoing call
  async startCall(contact: Contact, isVideo: boolean): Promise<string> {
    if (this.currentSession) {
      throw new Error('Call already in progress');
    }

    const callId = generateId();

    // Create session
    this.currentSession = {
      callId,
      contactId: contact.whisperId,
      isIncoming: false,
      isVideo,
      state: 'calling',
      isMuted: false,
      isSpeakerOn: false,
      isCameraOn: isVideo,
      isFrontCamera: true,
    };

    this.notifyStateChange('calling');

    try {
      // Initialize local media
      await this.initializeMedia(isVideo);

      // Create peer connection
      await this.createPeerConnection();

      // Add local tracks to peer connection
      if (this.localStream && this.peerConnection) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
      }

      // Create offer
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });

      await this.peerConnection!.setLocalDescription(offer);

      // Send call offer via signaling
      this.sendSignalingMessage(contact.whisperId, {
        type: 'call_offer',
        callId,
        isVideo,
        sdp: offer.sdp,
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

    // Update session
    this.currentSession = {
      callId,
      contactId,
      isIncoming: true,
      isVideo,
      state: 'connecting',
      isMuted: false,
      isSpeakerOn: false,
      isCameraOn: isVideo,
      isFrontCamera: true,
    };

    this.notifyStateChange('connecting');

    try {
      // Initialize local media
      await this.initializeMedia(isVideo);

      // Create peer connection
      await this.createPeerConnection();

      // Add local tracks
      if (this.localStream && this.peerConnection) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
      }

      // Set remote description (the offer)
      await this.peerConnection!.setRemoteDescription({
        type: 'offer',
        sdp: remoteSdp,
      });

      // Process any pending ICE candidates
      await this.processPendingIceCandidates();

      // Create answer
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);

      // Send answer via signaling
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
  rejectCall(callId: string, contactId: string): void {
    this.sendSignalingMessage(contactId, {
      type: 'call_reject',
      callId,
    });

    this.cleanup();
    console.log('[CallService] Call rejected:', callId);
  }

  // End the current call
  endCall(): void {
    if (this.currentSession) {
      // Notify remote peer
      this.sendSignalingMessage(this.currentSession.contactId, {
        type: 'call_end',
        callId: this.currentSession.callId,
      });
    }

    this.cleanup();
    this.notifyStateChange('ended');
    console.log('[CallService] Call ended');
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
  toggleSpeaker(): boolean {
    if (!this.currentSession) return false;

    // Speaker control depends on the platform
    // For react-native-webrtc, use InCallManager
    this.currentSession.isSpeakerOn = !this.currentSession.isSpeakerOn;
    return this.currentSession.isSpeakerOn;
  }

  // Private: Create peer connection
  private async createPeerConnection(): Promise<void> {
    // Dynamically import react-native-webrtc
    const { RTCPeerConnection, MediaStream: RNMediaStream } = await import('react-native-webrtc');

    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    }) as RTCPeerConnection;

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
    (this.peerConnection as any).onconnectionstatechange = () => {
      const state = (this.peerConnection as any)?.connectionState;
      console.log('[CallService] Connection state:', state);

      if (state === 'connected') {
        if (this.currentSession) {
          this.currentSession.state = 'connected';
          this.currentSession.startTime = Date.now();
        }
        this.notifyStateChange('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        this.endCall();
      }
    };

    // Handle remote tracks
    (this.peerConnection as any).ontrack = (event: any) => {
      console.log('[CallService] Remote track received:', event.track?.kind);

      if (!this.remoteStream) {
        this.remoteStream = new RNMediaStream() as unknown as MediaStream;
      }

      if (event.track) {
        (this.remoteStream as any).addTrack(event.track);
      }

      if (this.remoteStreamHandler) {
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
          isVideo: false, // Voice calls only for now
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
        if (this.currentSession) {
          // Already in a call, reject
          this.sendSignalingMessage(fromWhisperId, {
            type: 'call_reject',
            callId: message.callId,
            reason: 'busy',
          });
          return;
        }

        // Create pending session
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
          this.cleanup();
          this.notifyStateChange('ended');
        }
        break;

      case 'call_end':
        // Call ended by remote peer
        if (this.currentSession?.callId === message.callId) {
          this.cleanup();
          this.notifyStateChange('ended');
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
    const { type, callId, sdp, candidate, ...rest } = message;

    let wsMessage: { type: string; payload: Record<string, unknown> };

    switch (type) {
      case 'call_offer':
        wsMessage = {
          type: 'call_initiate',
          payload: {
            toWhisperId,
            callId,
            offer: sdp,
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
  private cleanup(): void {
    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clear remote stream
    this.remoteStream = null;
    if (this.remoteStreamHandler) {
      this.remoteStreamHandler(null);
    }

    // Clear pending ICE candidates
    this.pendingIceCandidates = [];

    // Clear session
    this.currentSession = null;
  }
}

// Singleton instance
export const callService = new CallService();
export default callService;
