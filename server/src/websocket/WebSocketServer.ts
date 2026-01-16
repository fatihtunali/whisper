import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { connectionManager } from './ConnectionManager';
import { messageRouter } from '../services/MessageRouter';
import { messageQueue } from '../services/MessageQueue';
import { adminService } from '../services/AdminService';
import { reportService } from '../services/ReportService';
import { authService } from '../services/AuthService';
import { blockService } from '../services/BlockService';
import { rateLimiter } from '../services/RateLimiter';
import { groupStore } from '../services/GroupStore';
import { generateTurnCredentials } from '../index';
import { pushService } from '../services/PushService';
import {
  ClientMessage,
  ServerMessage,
  RegisterChallengeMessage,
  RegisterAckMessage,
  PongMessage,
  ErrorMessage,
  ReactionReceivedMessage,
  TypingStatusMessage,
  BlockAckMessage,
  UnblockAckMessage,
  AccountDeletedMessage,
  IncomingCallMessage,
  CallAnsweredMessage,
  CallIceCandidateReceivedMessage,
  CallEndedMessage,
  GroupCreatedMessage,
  GroupMessageReceivedMessage,
  GroupUpdatedMessage,
  MemberLeftGroupMessage,
  PublicKeyResponseMessage,
} from '../types';
import nacl from 'tweetnacl';

export class WebSocketServer {
  private wss: WSServer;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private socketIdCounter = 0;
  private socketIds: Map<WebSocket, string> = new Map();

  constructor(server: HTTPServer) {
    this.wss = new WSServer({ server });
    this.setupEventHandlers();
    this.startCleanupInterval();
    console.log('[WebSocket] Server initialized');
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (socket: WebSocket) => {
      // Assign unique socket ID for challenge-response tracking
      const socketId = `socket-${++this.socketIdCounter}`;
      this.socketIds.set(socket, socketId);
      console.log(`[WebSocket] New connection: ${socketId}`);

      socket.on('message', (data: Buffer) => {
        this.handleMessage(socket, data);
      });

      socket.on('close', async () => {
        const sid = this.socketIds.get(socket);
        this.socketIds.delete(socket);

        // Clean up any pending auth challenge
        if (sid) {
          authService.removePendingChallenge(sid);
        }

        const whisperId = await connectionManager.unregisterBySocket(socket);
        if (whisperId) {
          console.log(`[WebSocket] Disconnected: ${whisperId}`);
        }
      });

      socket.on('error', async (error: Error) => {
        console.error('[WebSocket] Socket error:', error);
        const sid = this.socketIds.get(socket);
        this.socketIds.delete(socket);
        if (sid) {
          authService.removePendingChallenge(sid);
        }
        await connectionManager.unregisterBySocket(socket);
      });
    });
  }

  private handleMessage(socket: WebSocket, data: Buffer): void {
    let message: ClientMessage;

    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      this.sendError(socket, 'PARSE_ERROR', 'Invalid JSON message');
      return;
    }

    switch (message.type) {
      case 'register':
        this.handleRegister(socket, message.payload);
        break;

      case 'register_proof':
        this.handleRegisterProof(socket, message.payload);
        break;

      case 'send_message':
        this.handleSendMessage(socket, message.payload);
        break;

      case 'delivery_receipt':
        this.handleDeliveryReceipt(socket, message.payload);
        break;

      case 'fetch_pending':
        this.handleFetchPending(socket, message.payload);
        break;

      case 'ping':
        this.handlePing(socket);
        break;

      case 'report_user':
        this.handleReportUser(socket, message.payload);
        break;

      case 'reaction':
        this.handleReaction(socket, message.payload);
        break;

      case 'typing':
        this.handleTyping(socket, message.payload);
        break;

      case 'block_user':
        this.handleBlockUser(socket, message.payload);
        break;

      case 'unblock_user':
        this.handleUnblockUser(socket, message.payload);
        break;

      case 'delete_account':
        this.handleDeleteAccount(socket, message.payload);
        break;

      case 'call_initiate':
        this.handleCallInitiate(socket, message.payload);
        break;

      case 'call_answer':
        this.handleCallAnswer(socket, message.payload);
        break;

      case 'call_ice_candidate':
        this.handleCallIceCandidate(socket, message.payload);
        break;

      case 'call_end':
        this.handleCallEnd(socket, message.payload);
        break;

      // Group message handlers
      case 'create_group':
        this.handleCreateGroup(socket, message.payload);
        break;

      case 'send_group_message':
        this.handleSendGroupMessage(socket, message.payload);
        break;

      case 'update_group':
        this.handleUpdateGroup(socket, message.payload);
        break;

      case 'leave_group':
        this.handleLeaveGroup(socket, message.payload);
        break;

      case 'lookup_public_key':
        this.handleLookupPublicKey(socket, message.payload);
        break;

      case 'get_turn_credentials':
        this.handleGetTurnCredentials(socket);
        break;

      default:
        this.sendError(socket, 'UNKNOWN_TYPE', `Unknown message type`);
    }
  }

  private handleRegister(
    socket: WebSocket,
    payload: {
      whisperId: string;
      publicKey: string;
      signingPublicKey: string;
      pushToken?: string;
      voipToken?: string;
      platform?: string;
      prefs?: { sendReadReceipts: boolean; sendTypingIndicator: boolean; hideOnlineStatus: boolean };
    }
  ): void {
    const { whisperId, publicKey, signingPublicKey, pushToken, voipToken, platform, prefs } = payload;

    // Get socket ID
    const socketId = this.socketIds.get(socket);
    if (!socketId) {
      this.sendError(socket, 'INTERNAL_ERROR', 'Socket not tracked');
      return;
    }

    // Validate Whisper ID format
    if (!whisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(whisperId)) {
      this.sendError(socket, 'INVALID_ID', 'Invalid Whisper ID format');
      return;
    }

    // Check if user is banned
    if (adminService.isBanned(whisperId)) {
      console.warn(`[WebSocket] Banned user attempted to connect: ${whisperId}`);
      this.sendError(socket, 'BANNED', 'This account has been suspended');
      socket.close(1008, 'Account suspended');
      return;
    }

    // Validate public key (X25519 encryption key)
    if (!publicKey || publicKey.length < 10) {
      this.sendError(socket, 'INVALID_KEY', 'Invalid public key');
      return;
    }

    // Validate signing public key (Ed25519 authentication key)
    if (!signingPublicKey || signingPublicKey.length < 10) {
      this.sendError(socket, 'INVALID_KEY', 'Invalid signing public key');
      return;
    }

    // Create authentication challenge
    const challenge = authService.createChallenge(socketId, {
      whisperId,
      publicKey,
      signingPublicKey,
      pushToken,
      voipToken,
      platform,
      prefs,
    });

    // Send challenge to client
    const challengeMsg: RegisterChallengeMessage = {
      type: 'register_challenge',
      payload: { challenge },
    };
    this.send(socket, challengeMsg);

    console.log(`[WebSocket] Challenge sent to ${whisperId}`);
  }

  private async handleRegisterProof(
    socket: WebSocket,
    payload: { signature: string }
  ): Promise<void> {
    const { signature } = payload;

    // Get socket ID
    const socketId = this.socketIds.get(socket);
    if (!socketId) {
      this.sendError(socket, 'INTERNAL_ERROR', 'Socket not tracked');
      return;
    }

    // Verify the signature
    const result = authService.verifyProof(socketId, signature);

    if (!result.success || !result.data) {
      const errorCode = result.error || 'AUTH_FAILED';
      const errorMsg =
        errorCode === 'CHALLENGE_EXPIRED'
          ? 'Authentication challenge expired'
          : errorCode === 'NO_CHALLENGE'
          ? 'No pending challenge found'
          : 'Authentication failed';

      this.sendError(socket, errorCode, errorMsg);
      return;
    }

    // Authentication successful - register the client
    const { whisperId, publicKey, signingPublicKey, pushToken, voipToken, platform, prefs } = result.data;

    await connectionManager.register(whisperId, publicKey, signingPublicKey, socket, pushToken, prefs, voipToken, platform);

    // Log token registration status for debugging
    console.log(`[WebSocket] Tokens for ${whisperId}: push=${pushToken ? 'yes' : 'NO'}, voip=${voipToken ? 'yes' : 'NO'}, platform=${platform || 'unknown'}`);

    // Send acknowledgment
    const ack: RegisterAckMessage = {
      type: 'register_ack',
      payload: { success: true },
    };
    this.send(socket, ack);

    // Deliver any pending messages
    const delivered = await messageRouter.deliverPending(whisperId);

    // Deliver any pending group invites
    const pendingInvites = await groupStore.getPendingInvites(whisperId);
    for (const invite of pendingInvites) {
      const groupCreatedMessage: GroupCreatedMessage = {
        type: 'group_created',
        payload: {
          groupId: invite.groupId,
          name: invite.name,
          createdBy: invite.createdBy,
          members: invite.members,
          createdAt: invite.createdAt,
        },
      };
      this.send(socket, groupCreatedMessage);
    }

    const hidden = prefs?.hideOnlineStatus ? ' [hidden]' : '';
    console.log(`[WebSocket] Authenticated and registered ${whisperId}, delivered ${delivered} pending messages, ${pendingInvites.length} group invites${hidden}`);
  }

  private async handleSendMessage(
    socket: WebSocket,
    payload: {
      messageId: string;
      toWhisperId: string;
      encryptedContent: string;
      nonce: string;
      // Media attachments - passed through as-is
      encryptedVoice?: string;
      voiceDuration?: number;
      encryptedImage?: string;
      imageMetadata?: { width: number; height: number };
      encryptedFile?: string;
      fileMetadata?: { name: string; size: number; mimeType: string };
      isForwarded?: boolean;
      replyTo?: { messageId: string; content: string; senderId: string };
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register before sending messages');
      return;
    }

    const {
      messageId, toWhisperId, encryptedContent, nonce,
      encryptedVoice, voiceDuration, encryptedImage, imageMetadata,
      encryptedFile, fileMetadata, isForwarded, replyTo
    } = payload;

    // Validate recipient Whisper ID
    if (!toWhisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(toWhisperId)) {
      this.sendError(socket, 'INVALID_RECIPIENT', 'Invalid recipient Whisper ID');
      return;
    }

    // Check if sender is blocked by recipient
    if (blockService.isBlocked(client.whisperId, toWhisperId)) {
      this.sendError(socket, 'BLOCKED', 'You are blocked by this user');
      return;
    }

    // Route the message with all media attachments
    const status = await messageRouter.routeMessage(
      messageId,
      client.whisperId,
      toWhisperId,
      encryptedContent,
      nonce,
      {
        encryptedVoice,
        voiceDuration,
        encryptedImage,
        imageMetadata,
        encryptedFile,
        fileMetadata,
        isForwarded,
        replyTo,
      }
    );

    // Notify sender of delivery status
    // 'delivered' if recipient was online, 'pending' if queued
    // Note: 'sent' status happens immediately after the message is received by server
    messageRouter.notifyDeliveryStatus(
      client.whisperId,
      messageId,
      status === 'delivered' ? 'delivered' : 'pending',
      toWhisperId
    );
  }

  private handleDeliveryReceipt(
    socket: WebSocket,
    payload: {
      messageId: string;
      toWhisperId: string;
      status: 'delivered' | 'read';
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { messageId, toWhisperId, status } = payload;

    // Don't forward read receipts if client has disabled them in prefs
    if (status === 'read' && client.prefs?.sendReadReceipts === false) {
      return;
    }

    // Forward the receipt to the original sender
    messageRouter.forwardReceipt(client.whisperId, toWhisperId, messageId, status);
  }

  private async handleFetchPending(
    socket: WebSocket,
    payload: { cursor?: string } = {}
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { cursor } = payload;

    // Get paginated pending messages
    const result = await messageQueue.getPendingPaginated(
      client.whisperId,
      cursor || null,
      50 // Default limit
    );

    // Send pending messages with pagination info (including media attachments)
    const pendingMsg: ServerMessage = {
      type: 'pending_messages',
      payload: {
        messages: result.messages.map(msg => ({
          messageId: msg.id,
          fromWhisperId: msg.fromWhisperId,
          encryptedContent: msg.encryptedContent,
          nonce: msg.nonce,
          timestamp: msg.timestamp,
          senderPublicKey: msg.senderPublicKey,
          // Include media attachments if present
          ...(msg.encryptedVoice && { encryptedVoice: msg.encryptedVoice }),
          ...(msg.voiceDuration && { voiceDuration: msg.voiceDuration }),
          ...(msg.encryptedImage && { encryptedImage: msg.encryptedImage }),
          ...(msg.imageMetadata && { imageMetadata: msg.imageMetadata }),
          ...(msg.encryptedFile && { encryptedFile: msg.encryptedFile }),
          ...(msg.fileMetadata && { fileMetadata: msg.fileMetadata }),
          ...(msg.isForwarded && { isForwarded: msg.isForwarded }),
          ...(msg.replyTo && { replyTo: msg.replyTo }),
        })),
        cursor: result.cursor,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
    this.send(socket, pendingMsg);

    // Only clear pending messages when all have been delivered (no more pages)
    if (!result.hasMore && result.messages.length > 0) {
      await messageQueue.clearPending(client.whisperId);
    }

    console.log(`[WebSocket] Sent ${result.messages.length} pending messages to ${client.whisperId}${result.hasMore ? ' (more available)' : ''}`);
  }

  private async handlePing(socket: WebSocket): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (client) {
      await connectionManager.updatePing(client.whisperId);
    }

    const pong: PongMessage = {
      type: 'pong',
      payload: {},
    };
    this.send(socket, pong);
  }

  private handleReportUser(
    socket: WebSocket,
    payload: {
      reportedWhisperId: string;
      reason: 'inappropriate_content' | 'harassment' | 'spam' | 'child_safety' | 'other';
      description?: string;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { reportedWhisperId, reason, description } = payload;

    // Validate reported Whisper ID
    if (!reportedWhisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(reportedWhisperId)) {
      this.sendError(socket, 'INVALID_REPORTED_ID', 'Invalid reported user Whisper ID');
      return;
    }

    // Submit the report
    const report = reportService.submitReport(
      client.whisperId,
      reportedWhisperId,
      reason,
      description
    );

    // Send acknowledgment
    const ack: ServerMessage = {
      type: 'report_ack',
      payload: {
        reportId: report.id,
        success: true,
      },
    };
    this.send(socket, ack);

    console.log(`[WebSocket] Report ${report.id} submitted by ${client.whisperId}`);
  }

  private handleReaction(
    socket: WebSocket,
    payload: {
      messageId: string;
      toWhisperId: string;
      emoji: string | null;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { messageId, toWhisperId, emoji } = payload;

    // Validate recipient Whisper ID
    if (!toWhisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(toWhisperId)) {
      this.sendError(socket, 'INVALID_RECIPIENT', 'Invalid recipient Whisper ID');
      return;
    }

    // Check if sender is blocked by recipient - silently drop
    if (blockService.isBlocked(client.whisperId, toWhisperId)) {
      return;
    }

    // Forward reaction to recipient if online
    const recipient = connectionManager.get(toWhisperId);
    if (recipient) {
      const reactionMessage: ReactionReceivedMessage = {
        type: 'reaction_received',
        payload: {
          messageId,
          fromWhisperId: client.whisperId,
          emoji,
        },
      };
      this.send(recipient.socket, reactionMessage);
      console.log(`[WebSocket] Reaction forwarded from ${client.whisperId} to ${toWhisperId}`);
    }
    // Note: Reactions are not queued for offline users - they're transient
  }

  private handleTyping(
    socket: WebSocket,
    payload: {
      toWhisperId: string;
      isTyping: boolean;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { toWhisperId, isTyping } = payload;

    // Validate recipient Whisper ID
    if (!toWhisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(toWhisperId)) {
      this.sendError(socket, 'INVALID_RECIPIENT', 'Invalid recipient Whisper ID');
      return;
    }

    // Don't forward typing status if sender has hidden their online status
    // or disabled typing indicator in prefs (typing implies being online)
    if (client.prefs?.hideOnlineStatus || client.prefs?.sendTypingIndicator === false) {
      return;
    }

    // Rate limit typing indicators (max 1 per 2 seconds per sender/recipient)
    if (rateLimiter.checkTypingLimit(client.whisperId, toWhisperId)) {
      this.sendError(socket, 'RATE_LIMITED', 'Too many typing indicators');
      return;
    }

    // Check if sender is blocked by recipient - silently drop
    if (blockService.isBlocked(client.whisperId, toWhisperId)) {
      return;
    }

    // Forward typing status to recipient if online
    const recipient = connectionManager.get(toWhisperId);
    if (recipient) {
      const typingMessage: TypingStatusMessage = {
        type: 'typing_status',
        payload: {
          fromWhisperId: client.whisperId,
          isTyping,
        },
      };
      this.send(recipient.socket, typingMessage);
    }
    // Note: Typing status is not queued for offline users - it's transient
  }

  // Block handlers
  private handleBlockUser(
    socket: WebSocket,
    payload: { whisperId: string }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { whisperId } = payload;

    // Validate Whisper ID format
    if (!whisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(whisperId)) {
      this.sendError(socket, 'INVALID_ID', 'Invalid Whisper ID format');
      return;
    }

    // Cannot block yourself
    if (whisperId === client.whisperId) {
      this.sendError(socket, 'INVALID_OPERATION', 'Cannot block yourself');
      return;
    }

    // Block the user
    blockService.block(client.whisperId, whisperId);

    // Send acknowledgment
    const ack: BlockAckMessage = {
      type: 'block_ack',
      payload: { whisperId, success: true },
    };
    this.send(socket, ack);

    console.log(`[WebSocket] ${client.whisperId} blocked ${whisperId}`);
  }

  private handleUnblockUser(
    socket: WebSocket,
    payload: { whisperId: string }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { whisperId } = payload;

    // Validate Whisper ID format
    if (!whisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(whisperId)) {
      this.sendError(socket, 'INVALID_ID', 'Invalid Whisper ID format');
      return;
    }

    // Unblock the user
    blockService.unblock(client.whisperId, whisperId);

    // Send acknowledgment
    const ack: UnblockAckMessage = {
      type: 'unblock_ack',
      payload: { whisperId, success: true },
    };
    this.send(socket, ack);

    console.log(`[WebSocket] ${client.whisperId} unblocked ${whisperId}`);
  }

  // Account deletion handler
  private async handleDeleteAccount(
    socket: WebSocket,
    payload: {
      confirmation: string;
      timestamp: number;
      signature: string;
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { confirmation, timestamp, signature } = payload;

    // 1. Verify confirmation string
    if (confirmation !== 'DELETE_MY_ACCOUNT') {
      this.sendError(socket, 'INVALID_CONFIRMATION', 'Invalid confirmation string');
      return;
    }

    // 2. Verify timestamp is within 5 minutes
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;
    if (Math.abs(now - timestamp) > fiveMinutesMs) {
      this.sendError(socket, 'CHALLENGE_EXPIRED', 'Timestamp is too old or too far in the future');
      return;
    }

    // 3. Verify Ed25519 signature of "DELETE_MY_ACCOUNT:{timestamp}"
    try {
      const message = `DELETE_MY_ACCOUNT:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, 'base64');
      const publicKeyBytes = Buffer.from(client.signingPublicKey, 'base64');

      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );

      if (!isValid) {
        this.sendError(socket, 'AUTH_FAILED', 'Invalid signature');
        return;
      }
    } catch (error) {
      this.sendError(socket, 'AUTH_FAILED', 'Signature verification failed');
      return;
    }

    // 4. Delete all user data
    const whisperId = client.whisperId;

    // Clear pending messages for this user
    await messageQueue.clearPending(whisperId);

    // Clear all blocks by and against this user
    blockService.clearBlocks(whisperId);

    // Clear user from all groups (deletes groups they created)
    await groupStore.clearUserGroups(whisperId);

    // Unregister from connection manager
    await connectionManager.unregister(whisperId);

    // 5. Send confirmation
    const accountDeletedMsg: AccountDeletedMessage = {
      type: 'account_deleted',
      payload: { success: true },
    };
    this.send(socket, accountDeletedMsg);

    console.log(`[WebSocket] Account deleted: ${whisperId}`);

    // 6. Close the connection
    socket.close(1000, 'Account deleted');
  }

  // Call signaling handlers
  private async handleCallInitiate(
    socket: WebSocket,
    payload: {
      toWhisperId: string;
      callId: string;
      offer: string;
      isVideo?: boolean;
      callerName?: string;
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { toWhisperId, callId, offer, isVideo, callerName } = payload;

    // Validate recipient Whisper ID
    if (!toWhisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(toWhisperId)) {
      this.sendError(socket, 'INVALID_RECIPIENT', 'Invalid recipient Whisper ID');
      return;
    }

    // Check if caller is blocked by recipient
    if (blockService.isBlocked(client.whisperId, toWhisperId)) {
      this.sendError(socket, 'BLOCKED', 'Cannot call this user');
      return;
    }

    // Forward call to recipient if online
    const recipient = connectionManager.get(toWhisperId);
    if (recipient) {
      const incomingCallMessage: IncomingCallMessage = {
        type: 'incoming_call',
        payload: {
          fromWhisperId: client.whisperId,
          callId,
          offer,
          isVideo: isVideo || false,
        },
      };
      this.send(recipient.socket, incomingCallMessage);

      // Notify caller that the call is ringing on recipient's device
      this.send(socket, {
        type: 'call_ringing',
        payload: {
          callId,
          toWhisperId,
        },
      });

      // Also send push notification to wake up the app if in background
      if (recipient.pushToken) {
        pushService.sendCallNotification(
          recipient.pushToken,
          client.whisperId,
          callId,
          isVideo || false
        );
      }

      console.log(`[WebSocket] ${isVideo ? 'Video' : 'Voice'} call initiated from ${client.whisperId} to ${toWhisperId}`);
    } else {
      // Recipient offline - send push notifications to wake up their phone
      const voipToken = await connectionManager.getVoIPToken(toWhisperId);
      const pushToken = await connectionManager.getPushToken(toWhisperId);

      console.log(`[WebSocket] Recipient ${toWhisperId} is offline. VoIP token: ${voipToken ? 'yes' : 'no'}, Push token: ${pushToken ? 'yes' : 'no'}`);

      let pushSent = false;

      // For iOS: Try VoIP push first (makes phone ring with native call UI)
      if (voipToken) {
        const voipSent = await pushService.sendVoIPPush(
          voipToken,
          client.whisperId,
          callId,
          isVideo || false,
          callerName
        );
        if (voipSent) {
          console.log(`[WebSocket] VoIP push sent to offline iOS user ${toWhisperId}`);
          pushSent = true;
        } else {
          console.warn(`[WebSocket] VoIP push failed for ${toWhisperId}, will try regular push`);
        }
      }

      // Always send regular push notification as well (for Android, and as iOS backup)
      // Android needs this to show call notification
      // iOS can use this as backup if VoIP push fails
      if (pushToken) {
        const regularPushSent = await pushService.sendCallNotification(
          pushToken,
          client.whisperId,
          callId,
          isVideo || false
        );
        if (regularPushSent) {
          console.log(`[WebSocket] Regular push notification sent to offline user ${toWhisperId}`);
          pushSent = true;
        } else {
          console.warn(`[WebSocket] Regular push notification failed for ${toWhisperId}`);
        }
      }

      if (pushSent) {
        // At least one push was sent - don't send error, phone might still ring
        console.log(`[WebSocket] Call notification sent to ${toWhisperId}, waiting for response...`);
      } else {
        // No push could be sent - truly unreachable
        console.warn(`[WebSocket] No push token available for ${toWhisperId}`);
        this.sendError(socket, 'RECIPIENT_OFFLINE', 'Recipient is not available');
      }
    }
  }

  private handleCallAnswer(
    socket: WebSocket,
    payload: {
      toWhisperId: string;
      callId: string;
      answer: string;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { toWhisperId, callId, answer } = payload;

    // Forward answer to caller if online
    const recipient = connectionManager.get(toWhisperId);
    if (recipient) {
      const callAnsweredMessage: CallAnsweredMessage = {
        type: 'call_answered',
        payload: {
          fromWhisperId: client.whisperId,
          callId,
          answer,
        },
      };
      this.send(recipient.socket, callAnsweredMessage);
      console.log(`[WebSocket] Call answered from ${client.whisperId} to ${toWhisperId}`);
    }
  }

  private handleCallIceCandidate(
    socket: WebSocket,
    payload: {
      toWhisperId: string;
      callId: string;
      candidate: string;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { toWhisperId, callId, candidate } = payload;

    // Forward ICE candidate to peer if online
    const recipient = connectionManager.get(toWhisperId);
    if (recipient) {
      const iceCandidateMessage: CallIceCandidateReceivedMessage = {
        type: 'call_ice_candidate',
        payload: {
          fromWhisperId: client.whisperId,
          callId,
          candidate,
        },
      };
      this.send(recipient.socket, iceCandidateMessage);
    }
  }

  private handleCallEnd(
    socket: WebSocket,
    payload: {
      toWhisperId: string;
      callId: string;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { toWhisperId, callId } = payload;

    // Forward call end to peer if online
    const recipient = connectionManager.get(toWhisperId);
    if (recipient) {
      const callEndedMessage: CallEndedMessage = {
        type: 'call_ended',
        payload: {
          fromWhisperId: client.whisperId,
          callId,
        },
      };
      this.send(recipient.socket, callEndedMessage);
      console.log(`[WebSocket] Call ended from ${client.whisperId} to ${toWhisperId}`);
    }
  }

  // Group handlers
  private async handleCreateGroup(
    socket: WebSocket,
    payload: {
      groupId: string;
      name: string;
      members: string[];
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { groupId, name, members } = payload;

    // Validate group ID format
    if (!groupId || !/^GRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(groupId)) {
      this.sendError(socket, 'INVALID_GROUP_ID', 'Invalid group ID format');
      return;
    }

    // Validate group name
    if (!name || name.length < 1 || name.length > 50) {
      this.sendError(socket, 'INVALID_GROUP_NAME', 'Group name must be 1-50 characters');
      return;
    }

    // Validate members
    if (!members || members.length < 1) {
      this.sendError(socket, 'INVALID_MEMBERS', 'Group must have at least one member besides creator');
      return;
    }

    const createdAt = Date.now();
    const allMembers = [client.whisperId, ...members.filter(m => m !== client.whisperId)];

    // Save group to MySQL
    await groupStore.createGroup(groupId, name, client.whisperId, members);

    // Notify all online members about the new group
    const groupCreatedMessage: GroupCreatedMessage = {
      type: 'group_created',
      payload: {
        groupId,
        name,
        createdBy: client.whisperId,
        members: allMembers,
        createdAt,
      },
    };

    // Send to all members (including creator) - queue for offline
    for (const memberId of allMembers) {
      const member = connectionManager.get(memberId);
      if (member) {
        this.send(member.socket, groupCreatedMessage);
      } else if (memberId !== client.whisperId) {
        // Queue invite for offline member
        await groupStore.queueInvite(memberId, {
          groupId,
          name,
          createdBy: client.whisperId,
          members: allMembers,
          createdAt,
        });

        // Send push notification
        const pushToken = await connectionManager.getPushToken(memberId);
        if (pushToken) {
          pushService.sendNotification(
            pushToken,
            'Group Invite',
            `You were added to "${name}"`,
            { type: 'group_invite', groupId }
          ).catch(err => console.error('[WebSocket] Group invite push failed:', err));
        }
      }
    }

    console.log(`[WebSocket] Group ${groupId} created by ${client.whisperId} with ${allMembers.length} members`);
  }

  private async handleSendGroupMessage(
    socket: WebSocket,
    payload: {
      groupId: string;
      messageId: string;
      encryptedContent: string;
      nonce: string;
      senderName?: string;
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { groupId, messageId, encryptedContent, nonce, senderName } = payload;

    // Validate group ID format
    if (!groupId || !/^GRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(groupId)) {
      this.sendError(socket, 'INVALID_GROUP_ID', 'Invalid group ID format');
      return;
    }

    // Check if group exists
    const group = await groupStore.getGroup(groupId);
    if (!group) {
      this.sendError(socket, 'GROUP_NOT_FOUND', 'Group does not exist');
      return;
    }

    // Check if sender is a member of the group
    if (!(await groupStore.isMember(groupId, client.whisperId))) {
      this.sendError(socket, 'UNAUTHORIZED', 'You are not a member of this group');
      return;
    }

    const timestamp = Date.now();

    // Create the message to broadcast
    const groupMessageReceived: GroupMessageReceivedMessage = {
      type: 'group_message_received',
      payload: {
        groupId,
        messageId,
        fromWhisperId: client.whisperId,
        encryptedContent,
        nonce,
        timestamp,
        senderName,
      },
    };

    // Send only to group members (excluding sender)
    const members = await groupStore.getMembers(groupId);
    let deliveredCount = 0;
    for (const memberId of members) {
      if (memberId === client.whisperId) continue; // Skip sender
      const member = connectionManager.get(memberId);
      if (member) {
        this.send(member.socket, groupMessageReceived);
        deliveredCount++;
      }
    }

    console.log(`[WebSocket] Group message ${messageId} sent to group ${groupId} (${deliveredCount}/${members.length - 1} members online)`);
  }

  private async handleUpdateGroup(
    socket: WebSocket,
    payload: {
      groupId: string;
      name?: string;
      addMembers?: string[];
      removeMembers?: string[];
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { groupId, name, addMembers, removeMembers } = payload;

    // Validate group ID format
    if (!groupId || !/^GRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(groupId)) {
      this.sendError(socket, 'INVALID_GROUP_ID', 'Invalid group ID format');
      return;
    }

    // Check if group exists
    const group = await groupStore.getGroup(groupId);
    if (!group) {
      this.sendError(socket, 'GROUP_NOT_FOUND', 'Group does not exist');
      return;
    }

    // Only group creator can update the group
    if (!(await groupStore.isCreator(groupId, client.whisperId))) {
      this.sendError(socket, 'UNAUTHORIZED', 'Only group creator can update the group');
      return;
    }

    // Apply membership changes
    if (addMembers && addMembers.length > 0) {
      await groupStore.addMembers(groupId, addMembers);
    }
    if (removeMembers && removeMembers.length > 0) {
      for (const memberId of removeMembers) {
        await groupStore.removeMember(groupId, memberId);
      }
    }
    if (name) {
      await groupStore.updateGroupName(groupId, name);
    }

    // Create update notification
    const groupUpdatedMessage: GroupUpdatedMessage = {
      type: 'group_updated',
      payload: {
        groupId,
        updatedBy: client.whisperId,
        name,
        addedMembers: addMembers,
        removedMembers: removeMembers,
      },
    };

    // Send to all current group members (including newly added)
    const members = await groupStore.getMembers(groupId);
    for (const memberId of members) {
      const member = connectionManager.get(memberId);
      if (member) {
        this.send(member.socket, groupUpdatedMessage);
      }
    }

    // Also send to removed members so they know they were removed
    if (removeMembers) {
      for (const memberId of removeMembers) {
        const member = connectionManager.get(memberId);
        if (member) {
          this.send(member.socket, groupUpdatedMessage);
        }
      }
    }

    console.log(`[WebSocket] Group ${groupId} updated by ${client.whisperId}`);
  }

  private async handleLeaveGroup(
    socket: WebSocket,
    payload: {
      groupId: string;
    }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { groupId } = payload;

    // Validate group ID format
    if (!groupId || !/^GRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(groupId)) {
      this.sendError(socket, 'INVALID_GROUP_ID', 'Invalid group ID format');
      return;
    }

    // Check if user is actually a member
    if (!(await groupStore.isMember(groupId, client.whisperId))) {
      this.sendError(socket, 'NOT_A_MEMBER', 'You are not a member of this group');
      return;
    }

    // Get current members BEFORE leaving (to notify them)
    const members = await groupStore.getMembers(groupId);

    // Remove member or delete group if creator leaves
    await groupStore.removeMember(groupId, client.whisperId);

    // Notify all group members about member leaving
    const memberLeftMessage: MemberLeftGroupMessage = {
      type: 'member_left_group',
      payload: {
        groupId,
        memberId: client.whisperId,
      },
    };

    // Send to all members (including the leaving member)
    for (const memberId of members) {
      const member = connectionManager.get(memberId);
      if (member) {
        this.send(member.socket, memberLeftMessage);
      }
    }

    console.log(`[WebSocket] Member ${client.whisperId} left group ${groupId}`);
  }

  // Public key lookup handler - for message requests
  private async handleLookupPublicKey(
    socket: WebSocket,
    payload: { whisperId: string }
  ): Promise<void> {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const { whisperId } = payload;

    // Validate Whisper ID format
    if (!whisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(whisperId)) {
      this.sendError(socket, 'INVALID_ID', 'Invalid Whisper ID format');
      return;
    }

    // Cannot look up yourself
    if (whisperId === client.whisperId) {
      this.sendError(socket, 'INVALID_OPERATION', 'Cannot look up your own public key');
      return;
    }

    // Check if user exists and get their public key
    const publicKey = await connectionManager.getPublicKey(whisperId);
    const exists = await connectionManager.userExists(whisperId);

    // Send response
    const response: PublicKeyResponseMessage = {
      type: 'public_key_response',
      payload: {
        whisperId,
        publicKey,
        exists,
      },
    };
    this.send(socket, response);

    console.log(`[WebSocket] Public key lookup for ${whisperId} by ${client.whisperId}: ${exists ? 'found' : 'not found'}`);
  }

  // TURN credentials handler for WebRTC calls
  private handleGetTurnCredentials(socket: WebSocket): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    const credentials = generateTurnCredentials(client.whisperId);

    const response: ServerMessage = {
      type: 'turn_credentials',
      payload: credentials,
    };
    this.send(socket, response);

    console.log(`[WebSocket] TURN credentials sent to ${client.whisperId}`);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    const error: ErrorMessage = {
      type: 'error',
      payload: { code, message },
    };
    this.send(socket, error);
  }

  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(async () => {
      await connectionManager.cleanupStale();
      await messageQueue.cleanupExpired();
    }, 60 * 1000);
  }

  // Get server statistics
  async getStats(): Promise<{
    activeConnections: number;
    registeredUsers: number;
    pendingMessages: { users: number; messages: number }
  }> {
    return {
      activeConnections: connectionManager.getCount(),
      registeredUsers: await connectionManager.getRegisteredCount(),
      pendingMessages: await messageQueue.getStats(),
    };
  }

  // Graceful shutdown
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.wss.close();
    console.log('[WebSocket] Server closed');
  }
}
