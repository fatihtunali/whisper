import { LocalUser, Message, Contact, MessageReplyTo, VoiceMessage, ImageAttachment, FileAttachment, Group } from '../types';
import { cryptoService } from '../crypto/CryptoService';
import { secureStorage } from '../storage/SecureStorage';
import { generateId, generateGroupId } from '../utils/helpers';

const WS_URL = 'wss://sarjmobile.com/ws';
const INITIAL_RECONNECT_DELAY = 1000; // Start with 1 second
const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds
const PING_INTERVAL = 15000; // Reduced from 30s to 15s to keep connection alive

type MessageHandler = (message: Message, contact: Contact) => void;
type StatusHandler = (messageId: string, status: Message['status']) => void;
type ConnectionHandler = (connected: boolean) => void;
type ReactionHandler = (messageId: string, oderId: string, emoji: string | null) => void;
type TypingHandler = (fromWhisperId: string, isTyping: boolean) => void;
type GroupMessageHandler = (message: Message, group: Group) => void;
type GroupUpdateHandler = (groupId: string, updates: Partial<Group>) => void;

// Public key lookup result
interface PublicKeyLookupResult {
  whisperId: string;
  publicKey: string | null;
  exists: boolean;
}

class MessagingService {
  private ws: WebSocket | null = null;
  private user: LocalUser | null = null;
  private pushToken: string | null = null;
  private voipToken: string | null = null;
  private platform: string = 'unknown';
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isRegistering = false; // Track if registration is in progress
  private needsReregistration = false; // Flag to re-register after current completes
  private reconnectAttempts = 0; // For exponential backoff

  // Pending public key lookups - for async request/response
  private pendingLookups: Map<string, {
    resolve: (result: PublicKeyLookupResult) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // TURN credentials handler (set by CallService)
  public turnCredentialsHandler: ((credentials: any) => void) | null = null;

  // Event handlers - now arrays to support multiple listeners
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private reactionHandlers: Set<ReactionHandler> = new Set();
  private typingHandlers: Set<TypingHandler> = new Set();
  private groupMessageHandlers: Set<GroupMessageHandler> = new Set();
  private groupUpdateHandlers: Set<GroupUpdateHandler> = new Set();

  // Add/remove event handlers
  addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  addStatusHandler(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
  }

  removeStatusHandler(handler: StatusHandler): void {
    this.statusHandlers.delete(handler);
  }

  addConnectionHandler(handler: ConnectionHandler): void {
    this.connectionHandlers.add(handler);
  }

  removeConnectionHandler(handler: ConnectionHandler): void {
    this.connectionHandlers.delete(handler);
  }

  addReactionHandler(handler: ReactionHandler): void {
    this.reactionHandlers.add(handler);
  }

  removeReactionHandler(handler: ReactionHandler): void {
    this.reactionHandlers.delete(handler);
  }

  addTypingHandler(handler: TypingHandler): void {
    this.typingHandlers.add(handler);
  }

  removeTypingHandler(handler: TypingHandler): void {
    this.typingHandlers.delete(handler);
  }

  addGroupMessageHandler(handler: GroupMessageHandler): void {
    this.groupMessageHandlers.add(handler);
  }

  removeGroupMessageHandler(handler: GroupMessageHandler): void {
    this.groupMessageHandlers.delete(handler);
  }

  addGroupUpdateHandler(handler: GroupUpdateHandler): void {
    this.groupUpdateHandlers.add(handler);
  }

  removeGroupUpdateHandler(handler: GroupUpdateHandler): void {
    this.groupUpdateHandlers.delete(handler);
  }

  // Legacy single handler methods (for backwards compatibility)
  setOnMessageReceived(handler: MessageHandler | null): void {
    // Clear all and add single handler
    this.messageHandlers.clear();
    if (handler) this.messageHandlers.add(handler);
  }

  setOnStatusUpdate(handler: StatusHandler | null): void {
    this.statusHandlers.clear();
    if (handler) this.statusHandlers.add(handler);
  }

  setOnConnectionChange(handler: ConnectionHandler | null): void {
    this.connectionHandlers.clear();
    if (handler) this.connectionHandlers.add(handler);
  }

  // Notify all handlers
  private notifyMessageHandlers(message: Message, contact: Contact): void {
    this.messageHandlers.forEach(handler => handler(message, contact));
  }

  private notifyStatusHandlers(messageId: string, status: Message['status']): void {
    this.statusHandlers.forEach(handler => handler(messageId, status));
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(connected));
  }

  private notifyReactionHandlers(messageId: string, oderId: string, emoji: string | null): void {
    this.reactionHandlers.forEach(handler => handler(messageId, oderId, emoji));
  }

  private notifyTypingHandlers(fromWhisperId: string, isTyping: boolean): void {
    this.typingHandlers.forEach(handler => handler(fromWhisperId, isTyping));
  }

  private notifyGroupMessageHandlers(message: Message, group: Group): void {
    this.groupMessageHandlers.forEach(handler => handler(message, group));
  }

  private notifyGroupUpdateHandlers(groupId: string, updates: Partial<Group>): void {
    this.groupUpdateHandlers.forEach(handler => handler(groupId, updates));
  }

  // Set push token - will re-register if already connected to update server
  setPushToken(token: string | null): void {
    const hadToken = !!this.pushToken;
    this.pushToken = token;
    console.log('[MessagingService] Push token set:', token ? 'yes' : 'no');

    // Re-register if connected and token changed
    if (token && !hadToken && this.isConnected()) {
      if (this.isRegistering) {
        // Registration in progress, mark for re-registration when complete
        console.log('[MessagingService] Registration in progress, will re-register after');
        this.needsReregistration = true;
      } else {
        console.log('[MessagingService] Re-registering with new push token');
        this.register();
      }
    }
  }

  // Set VoIP token for iOS - will re-register if already connected to update server
  setVoIPToken(token: string | null): void {
    const hadToken = !!this.voipToken;
    this.voipToken = token;
    console.log('[MessagingService] VoIP token set:', token ? 'yes' : 'no');

    // Re-register if connected and token changed
    if (token && !hadToken && this.isConnected()) {
      if (this.isRegistering) {
        // Registration in progress, mark for re-registration when complete
        console.log('[MessagingService] Registration in progress, will re-register after');
        this.needsReregistration = true;
      } else {
        console.log('[MessagingService] Re-registering with new VoIP token');
        this.register();
      }
    }
  }

  // Set platform (call before connect)
  setPlatform(platform: 'ios' | 'android' | 'unknown'): void {
    const wasUnknown = this.platform === 'unknown';
    this.platform = platform;
    console.log('[MessagingService] Platform set:', platform);

    // Re-register if we were unknown and now have real platform AND connected
    // This ensures server gets correct platform even if set after initial connect
    if (wasUnknown && platform !== 'unknown' && this.isConnected()) {
      if (this.isRegistering) {
        console.log('[MessagingService] Platform updated during registration, will re-register after');
        this.needsReregistration = true;
      } else {
        console.log('[MessagingService] Re-registering with correct platform');
        this.register();
      }
    }
  }

  // Connect to WebSocket server
  async connect(user: LocalUser): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('[MessagingService] Already connected or connecting');
      return;
    }

    this.user = user;
    this.isConnecting = true;

    try {
      console.log('[MessagingService] Connecting to', WS_URL);
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[MessagingService] Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset on successful connection
        this.register();
        this.startPing();
        this.notifyConnectionHandlers(true);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[MessagingService] Disconnected');
        this.isConnecting = false;
        this.isRegistering = false;
        this.needsReregistration = false;
        this.stopPing();
        this.notifyConnectionHandlers(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[MessagingService] WebSocket error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('[MessagingService] Connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  // Disconnect from server
  disconnect(): void {
    console.log('[MessagingService] Disconnecting');
    this.user = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }

    this.notifyConnectionHandlers(false);
  }

  // Check if connected
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Check connection and reconnect if needed (called when app resumes from background)
  async checkAndReconnect(): Promise<void> {
    if (!this.user) {
      console.log('[MessagingService] No user, skipping reconnect check');
      return;
    }

    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Check if WebSocket is actually connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[MessagingService] WebSocket already connected, sending ping');
      this.send({ type: 'ping', payload: {} });
      return;
    }

    // WebSocket is not connected, initiate reconnection
    console.log('[MessagingService] WebSocket disconnected, reconnecting...');
    this.reconnectAttempts = 0; // Reset backoff

    // Close stale WebSocket if exists
    if (this.ws) {
      try {
        this.ws.onclose = null; // Prevent recursive reconnect
        this.ws.close();
      } catch (e) {
        // Ignore close errors
      }
      this.ws = null;
    }

    // Reconnect immediately
    this.connect(this.user);
  }

  // Send a message to a contact
  async sendMessage(contact: Contact, content: string, replyTo?: MessageReplyTo): Promise<Message> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const messageId = generateId();

    // Create local message
    const message: Message = {
      id: messageId,
      conversationId: contact.whisperId,
      senderId: this.user.whisperId,
      content,
      timestamp: Date.now(),
      status: 'sending',
      ...(replyTo && { replyTo }),
    };

    // Save to local storage first
    await secureStorage.addMessage(contact.whisperId, message);
    await secureStorage.updateConversation(contact.whisperId, {
      lastMessage: message,
      updatedAt: Date.now(),
    });

    // Encrypt the message
    const { encrypted, nonce } = await cryptoService.encryptMessage(
      content,
      this.user.privateKey,
      contact.publicKey
    );

    // Send via WebSocket
    if (this.isConnected()) {
      this.send({
        type: 'send_message',
        payload: {
          messageId,
          toWhisperId: contact.whisperId,
          encryptedContent: encrypted,
          nonce,
        },
      });

      // Keep status as 'sending' - server will send delivery_status update
      // which will change it to 'sent', 'delivered', or 'pending'
    } else {
      // Mark as failed if not connected
      message.status = 'failed';
      await secureStorage.updateMessageStatus(contact.whisperId, messageId, 'failed');
    }

    return message;
  }

  // Send a voice message to a contact
  async sendVoiceMessage(
    contact: Contact,
    voiceBase64: string,
    duration: number,
    localUri: string
  ): Promise<Message> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const messageId = generateId();

    // Create local message with voice attachment
    const voice: VoiceMessage = {
      uri: localUri,
      duration,
    };

    const message: Message = {
      id: messageId,
      conversationId: contact.whisperId,
      senderId: this.user.whisperId,
      content: '', // Voice messages have no text content
      timestamp: Date.now(),
      status: 'sending',
      voice,
    };

    // Save to local storage first
    await secureStorage.addMessage(contact.whisperId, message);
    await secureStorage.updateConversation(contact.whisperId, {
      lastMessage: { ...message, content: 'Voice message' },
      updatedAt: Date.now(),
    });

    // Encrypt the voice data
    const { encrypted: encryptedVoice, nonce } = await cryptoService.encryptBinaryData(
      voiceBase64,
      this.user.privateKey,
      contact.publicKey
    );

    // Send via WebSocket
    if (this.isConnected()) {
      this.send({
        type: 'send_message',
        payload: {
          messageId,
          toWhisperId: contact.whisperId,
          encryptedContent: '', // No text content for voice
          nonce,
          encryptedVoice,
          voiceDuration: duration,
        },
      });

      // Keep status as 'sending' - server will send delivery_status update
    } else {
      message.status = 'failed';
      await secureStorage.updateMessageStatus(contact.whisperId, messageId, 'failed');
    }

    return message;
  }

  // Send an image message to a contact
  async sendImageMessage(
    contact: Contact,
    imageBase64: string,
    width: number,
    height: number,
    localUri: string
  ): Promise<Message> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const messageId = generateId();

    // Create local message with image attachment
    const image: ImageAttachment = {
      uri: localUri,
      width,
      height,
    };

    const message: Message = {
      id: messageId,
      conversationId: contact.whisperId,
      senderId: this.user.whisperId,
      content: '', // Image messages have no text content
      timestamp: Date.now(),
      status: 'sending',
      image,
    };

    // Save to local storage first
    await secureStorage.addMessage(contact.whisperId, message);
    await secureStorage.updateConversation(contact.whisperId, {
      lastMessage: { ...message, content: 'Photo' },
      updatedAt: Date.now(),
    });

    // Encrypt the image data
    const { encrypted: encryptedImage, nonce } = await cryptoService.encryptBinaryData(
      imageBase64,
      this.user.privateKey,
      contact.publicKey
    );

    // Send via WebSocket
    if (this.isConnected()) {
      this.send({
        type: 'send_message',
        payload: {
          messageId,
          toWhisperId: contact.whisperId,
          encryptedContent: '', // No text content for image
          nonce,
          encryptedImage,
          imageMetadata: { width, height },
        },
      });

      // Keep status as 'sending' - server will send delivery_status update
    } else {
      message.status = 'failed';
      await secureStorage.updateMessageStatus(contact.whisperId, messageId, 'failed');
    }

    return message;
  }

  // Send a file message to a contact
  async sendFileMessage(
    contact: Contact,
    file: FileAttachment,
    fileBase64: string
  ): Promise<Message> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const messageId = generateId();

    // Create local message with file attachment
    const message: Message = {
      id: messageId,
      conversationId: contact.whisperId,
      senderId: this.user.whisperId,
      content: '', // File messages have no text content
      timestamp: Date.now(),
      status: 'sending',
      file: {
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        uri: file.uri,
      },
    };

    // Save to local storage first
    await secureStorage.addMessage(contact.whisperId, message);
    await secureStorage.updateConversation(contact.whisperId, {
      lastMessage: { ...message, content: `File: ${file.name}` },
      updatedAt: Date.now(),
    });

    // Encrypt the file data
    const { encrypted: encryptedFile, nonce } = await cryptoService.encryptBinaryData(
      fileBase64,
      this.user.privateKey,
      contact.publicKey
    );

    // Send via WebSocket
    if (this.isConnected()) {
      this.send({
        type: 'send_message',
        payload: {
          messageId,
          toWhisperId: contact.whisperId,
          encryptedContent: '', // No text content for file
          nonce,
          encryptedFile,
          fileMetadata: {
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
          },
        },
      });

      // Keep status as 'sending' - server will send delivery_status update
    } else {
      message.status = 'failed';
      await secureStorage.updateMessageStatus(contact.whisperId, messageId, 'failed');
    }

    return message;
  }

  // Send a delivery receipt
  async sendDeliveryReceipt(
    toWhisperId: string,
    messageId: string,
    status: 'delivered' | 'read'
  ): Promise<void> {
    if (!this.isConnected()) return;

    this.send({
      type: 'delivery_receipt',
      payload: {
        messageId,
        toWhisperId,
        status,
      },
    });
  }

  // Report a user for inappropriate behavior
  reportUser(
    reportedWhisperId: string,
    reason: 'inappropriate_content' | 'harassment' | 'spam' | 'child_safety' | 'other',
    description?: string
  ): boolean {
    if (!this.isConnected()) {
      console.error('[MessagingService] Cannot report - not connected');
      return false;
    }

    this.send({
      type: 'report_user',
      payload: {
        reportedWhisperId,
        reason,
        description,
      },
    });

    console.log('[MessagingService] Report submitted for', reportedWhisperId, 'reason:', reason);
    return true;
  }

  // Send a reaction to a message
  async sendReaction(
    toWhisperId: string,
    messageId: string,
    emoji: string | null
  ): Promise<boolean> {
    if (!this.isConnected() || !this.user) {
      console.error('[MessagingService] Cannot send reaction - not connected');
      return false;
    }

    this.send({
      type: 'reaction',
      payload: {
        messageId,
        toWhisperId,
        emoji,
      },
    });

    // Update local message with own reaction
    await secureStorage.updateMessageReaction(toWhisperId, messageId, this.user.whisperId, emoji);

    console.log('[MessagingService] Reaction sent for message', messageId, 'emoji:', emoji);
    return true;
  }

  // Send typing status to a contact
  sendTypingStatus(toWhisperId: string, isTyping: boolean): void {
    if (!this.isConnected()) return;

    this.send({
      type: 'typing',
      payload: {
        toWhisperId,
        isTyping,
      },
    });
  }

  // Forward a message to a contact (re-encrypted for the new recipient)
  async forwardMessage(contact: Contact, content: string): Promise<Message> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const messageId = generateId();

    // Create local message with isForwarded flag
    const message: Message = {
      id: messageId,
      conversationId: contact.whisperId,
      senderId: this.user.whisperId,
      content,
      timestamp: Date.now(),
      status: 'sending',
      isForwarded: true,
    };

    // Save to local storage first
    await secureStorage.addMessage(contact.whisperId, message);
    await secureStorage.updateConversation(contact.whisperId, {
      lastMessage: message,
      updatedAt: Date.now(),
    });

    // Encrypt the message for the new recipient
    const { encrypted, nonce } = await cryptoService.encryptMessage(
      content,
      this.user.privateKey,
      contact.publicKey
    );

    // Send via WebSocket
    if (this.isConnected()) {
      this.send({
        type: 'send_message',
        payload: {
          messageId,
          toWhisperId: contact.whisperId,
          encryptedContent: encrypted,
          nonce,
          isForwarded: true,
        },
      });

      // Keep status as 'sending' - server will send delivery_status update
    } else {
      // Mark as failed if not connected
      message.status = 'failed';
      await secureStorage.updateMessageStatus(contact.whisperId, messageId, 'failed');
    }

    return message;
  }

  // ============ GROUP MESSAGING METHODS ============

  // Create a new group
  async createGroup(name: string, memberIds: string[]): Promise<Group> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const groupId = generateGroupId();
    const now = Date.now();

    // Create local group object
    const group: Group = {
      id: groupId,
      name,
      members: [this.user.whisperId, ...memberIds],
      createdBy: this.user.whisperId,
      createdAt: now,
    };

    // Save to local storage
    await secureStorage.saveGroup(group);

    // Create group conversation
    await secureStorage.getOrCreateGroupConversation(groupId);

    // Notify server about new group
    if (this.isConnected()) {
      this.send({
        type: 'create_group',
        payload: {
          groupId,
          name,
          members: memberIds, // Excluding creator, server adds them
        },
      });
    }

    console.log('[MessagingService] Group created:', groupId);
    return group;
  }

  // Send a message to a group
  async sendGroupMessage(group: Group, content: string): Promise<Message> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    const messageId = generateId();
    const now = Date.now();

    // Get the current user's name/username for display
    const senderName = this.user.username || this.user.whisperId;

    // Create local message
    const message: Message = {
      id: messageId,
      conversationId: group.id,
      senderId: this.user.whisperId,
      content,
      timestamp: now,
      status: 'sending',
      groupId: group.id,
      senderName,
    };

    // Save to local storage
    await secureStorage.addGroupMessage(group.id, message);
    await secureStorage.updateGroupConversation(group.id, {
      lastMessage: message,
      updatedAt: now,
    });

    // For group messages, we use a simplified encryption approach for MVP
    // In production, you'd use proper group encryption (e.g., Signal's group protocol)
    // For now, we encrypt with the sender's keys for transit
    const { encrypted, nonce } = await cryptoService.encryptForGroup(
      content,
      this.user.privateKey
    );

    // Send via WebSocket
    if (this.isConnected()) {
      this.send({
        type: 'send_group_message',
        payload: {
          groupId: group.id,
          messageId,
          encryptedContent: encrypted,
          nonce,
          senderName,
        },
      });

      // Keep status as 'sending' - server will send delivery_status update
    } else {
      message.status = 'failed';
      await secureStorage.updateGroupMessageStatus(group.id, messageId, 'failed');
    }

    return message;
  }

  // Update a group (name, members)
  async updateGroup(
    groupId: string,
    updates: { name?: string; addMembers?: string[]; removeMembers?: string[] }
  ): Promise<void> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    // Update locally
    const group = await secureStorage.getGroup(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    const localUpdates: Partial<Group> = {};

    if (updates.name) {
      localUpdates.name = updates.name;
    }

    if (updates.addMembers && updates.addMembers.length > 0) {
      localUpdates.members = [...new Set([...group.members, ...updates.addMembers])];
    }

    if (updates.removeMembers && updates.removeMembers.length > 0) {
      localUpdates.members = (localUpdates.members || group.members).filter(
        m => !updates.removeMembers!.includes(m)
      );
    }

    await secureStorage.updateGroup(groupId, localUpdates);

    // Notify server
    if (this.isConnected()) {
      this.send({
        type: 'update_group',
        payload: {
          groupId,
          ...updates,
        },
      });
    }

    console.log('[MessagingService] Group updated:', groupId);
  }

  // Leave a group
  async leaveGroup(groupId: string): Promise<void> {
    if (!this.user) {
      throw new Error('Not authenticated');
    }

    // Remove self from local group
    const group = await secureStorage.getGroup(groupId);
    if (group) {
      const newMembers = group.members.filter(m => m !== this.user!.whisperId);

      if (newMembers.length === 0) {
        // Last member, delete the group
        await secureStorage.deleteGroup(groupId);
      } else {
        await secureStorage.updateGroup(groupId, { members: newMembers });
      }
    }

    // Notify server
    if (this.isConnected()) {
      this.send({
        type: 'leave_group',
        payload: {
          groupId,
        },
      });
    }

    console.log('[MessagingService] Left group:', groupId);
  }

  // ============ END GROUP METHODS ============

  // Private: Register with server
  private async register(): Promise<void> {
    if (!this.user) return;

    // Mark registration as in progress
    this.isRegistering = true;
    this.needsReregistration = false;

    // Get privacy settings
    const privacySettings = await secureStorage.getPrivacySettings();

    // Build prefs object for server
    const prefs = {
      sendReadReceipts: privacySettings.readReceipts !== false, // Default true
      sendTypingIndicator: privacySettings.typingIndicator !== false, // Default true
      hideOnlineStatus: !privacySettings.showOnlineStatus,
    };

    console.log(`[MessagingService] Registering with tokens: push=${this.pushToken ? 'yes' : 'no'}, voip=${this.voipToken ? 'yes' : 'no'}`);

    this.send({
      type: 'register',
      payload: {
        whisperId: this.user.whisperId,
        publicKey: this.user.publicKey,
        signingPublicKey: this.user.signingPublicKey,
        pushToken: this.pushToken || undefined,
        voipToken: this.voipToken || undefined,
        platform: this.platform,
        prefs,
      },
    });
  }

  // Private: Handle incoming WebSocket message
  private async handleMessage(data: string): Promise<void> {
    try {
      const message = JSON.parse(data);
      console.log('[MessagingService] Received:', message.type);

      switch (message.type) {
        case 'register_challenge':
          await this.handleRegisterChallenge(message.payload);
          break;

        case 'register_ack':
          console.log('[MessagingService] Registered successfully');
          this.isRegistering = false;
          // Check if tokens were updated during registration
          if (this.needsReregistration) {
            console.log('[MessagingService] Tokens updated during registration, re-registering...');
            this.needsReregistration = false;
            this.register();
          }
          break;

        case 'message_received':
          await this.handleIncomingMessage(message.payload);
          break;

        case 'message_delivered':
          this.handleDeliveryStatus(message.payload);
          break;

        case 'delivery_status':
          this.handleDeliveryStatus(message.payload);
          break;

        case 'pending_messages':
          await this.handlePendingMessages(message.payload.messages);
          break;

        case 'pong':
          // Heartbeat response, no action needed
          break;

        case 'report_ack':
          console.log('[MessagingService] Report acknowledged:', message.payload.reportId);
          break;

        case 'error':
          console.error('[MessagingService] Server error:', message.payload);
          // Handle specific call-related errors
          if (message.payload.code === 'RECIPIENT_OFFLINE') {
            this.handleCallSignaling('recipient_offline', message.payload);
          }
          break;

        case 'reaction_received':
          await this.handleReactionReceived(message.payload);
          break;

        case 'typing_status':
          this.handleTypingStatus(message.payload);
          break;

        // Call signaling messages - forward to CallService
        case 'incoming_call':
        case 'call_answered':
        case 'call_ice_candidate':
        case 'call_ended':
        case 'call_ringing':
          this.handleCallSignaling(message.type, message.payload);
          break;

        // Group messages
        case 'group_created':
          await this.handleGroupCreated(message.payload);
          break;

        case 'group_message_received':
          await this.handleGroupMessageReceived(message.payload);
          break;

        case 'group_updated':
          await this.handleGroupUpdated(message.payload);
          break;

        case 'member_left_group':
          await this.handleMemberLeftGroup(message.payload);
          break;

        case 'public_key_response':
          this.handlePublicKeyResponse(message.payload);
          break;

        case 'turn_credentials':
          // Forward to CallService handler
          if (this.turnCredentialsHandler) {
            this.turnCredentialsHandler(message.payload);
          }
          break;
      }
    } catch (error) {
      console.error('[MessagingService] Failed to parse message:', error);
    }
  }

  // Private: Handle authentication challenge from server
  private async handleRegisterChallenge(payload: { challenge: string }): Promise<void> {
    if (!this.user) {
      console.error('[MessagingService] Cannot respond to challenge - no user');
      return;
    }

    const { challenge } = payload;
    console.log('[MessagingService] Received authentication challenge');

    try {
      // Decode the challenge from base64
      const challengeBytes = this.decodeBase64(challenge);

      // Sign the challenge with our Ed25519 signing key
      const signature = cryptoService.sign(challengeBytes, this.user.signingPrivateKey);

      // Send the proof back to server
      this.send({
        type: 'register_proof',
        payload: { signature },
      });

      console.log('[MessagingService] Sent authentication proof');
    } catch (error) {
      console.error('[MessagingService] Failed to sign challenge:', error);
    }
  }

  // Private: Decode base64 string to Uint8Array
  private decodeBase64(str: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const len = str.length;
    let bufferLength = (len * 3) / 4;
    if (str[len - 1] === '=') bufferLength--;
    if (str[len - 2] === '=') bufferLength--;
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = chars.indexOf(str[i]);
      const b = chars.indexOf(str[i + 1]);
      const c = chars.indexOf(str[i + 2]);
      const d = chars.indexOf(str[i + 3]);
      bytes[p++] = (a << 2) | (b >> 4);
      if (c !== -1 && str[i + 2] !== '=') bytes[p++] = ((b & 15) << 4) | (c >> 2);
      if (d !== -1 && str[i + 3] !== '=') bytes[p++] = ((c & 3) << 6) | d;
    }
    return bytes;
  }

  // Private: Forward call signaling to CallService
  private handleCallSignaling(type: string, payload: any): void {
    // Dynamically import to avoid circular dependencies
    import('./CallService').then(({ callService }) => {
      callService.handleWebSocketMessage(type, payload);
    });
  }

  // Private: Handle typing status from server
  private handleTypingStatus(payload: {
    fromWhisperId: string;
    isTyping: boolean;
  }): void {
    const { fromWhisperId, isTyping } = payload;
    this.notifyTypingHandlers(fromWhisperId, isTyping);
  }

  // Private: Handle incoming reaction
  private async handleReactionReceived(payload: {
    messageId: string;
    fromWhisperId: string;
    emoji: string | null;
  }): Promise<void> {
    const { messageId, fromWhisperId, emoji } = payload;

    // Update local message with the reaction
    // The conversationId is the fromWhisperId since reactions come from the other user
    await secureStorage.updateMessageReaction(fromWhisperId, messageId, fromWhisperId, emoji);

    // Notify handlers
    this.notifyReactionHandlers(messageId, fromWhisperId, emoji);

    console.log('[MessagingService] Reaction received from', fromWhisperId, 'for message', messageId);
  }

  // Private: Handle incoming encrypted message
  private async handleIncomingMessage(payload: {
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
    encryptedVoice?: string;
    voiceDuration?: number;
    encryptedImage?: string;
    imageMetadata?: { width: number; height: number };
    encryptedFile?: string;
    fileMetadata?: { name: string; size: number; mimeType: string };
    isForwarded?: boolean;
    replyTo?: { messageId: string; content: string; senderId: string };
    senderPublicKey?: string; // For message requests from unknown senders
  }): Promise<void> {
    if (!this.user) return;

    const {
      messageId, fromWhisperId, encryptedContent, nonce, timestamp,
      encryptedVoice, voiceDuration, encryptedImage, imageMetadata,
      encryptedFile, fileMetadata, isForwarded, replyTo, senderPublicKey
    } = payload;

    // Get the sender's contact info
    let contact = await secureStorage.getContact(fromWhisperId);

    // If contact doesn't exist but we have their public key, create a message request
    if (!contact && senderPublicKey) {
      console.log('[MessagingService] Message request from:', fromWhisperId);
      // Create a pending contact (message request)
      contact = {
        whisperId: fromWhisperId,
        publicKey: senderPublicKey,
        addedAt: timestamp,
        isMessageRequest: true, // Flag to indicate this is a message request
      };
      await secureStorage.addContact(contact);
    }

    if (!contact) {
      console.warn('[MessagingService] Message from unknown contact without public key:', fromWhisperId);
      return;
    }

    // Ignore messages from blocked users
    if (contact.isBlocked) {
      console.log('[MessagingService] Ignoring message from blocked user:', fromWhisperId);
      return;
    }

    // Handle voice message
    let voice: VoiceMessage | undefined;
    if (encryptedVoice && voiceDuration) {
      const decryptedVoiceBase64 = cryptoService.decryptBinaryData(
        encryptedVoice,
        nonce,
        this.user.privateKey,
        contact.publicKey
      );

      if (decryptedVoiceBase64) {
        // Save voice data to a local file
        const voiceUri = await this.saveVoiceToFile(decryptedVoiceBase64, messageId);
        if (voiceUri) {
          voice = {
            uri: voiceUri,
            duration: voiceDuration,
          };
        }
      }
    }

    // Handle image attachment
    let image: ImageAttachment | undefined;
    if (encryptedImage && imageMetadata) {
      const decryptedImageBase64 = cryptoService.decryptBinaryData(
        encryptedImage,
        nonce,
        this.user.privateKey,
        contact.publicKey
      );

      if (decryptedImageBase64) {
        // Save image data to a local file
        const imageUri = await this.saveImageToFile(decryptedImageBase64, messageId);
        if (imageUri) {
          image = {
            uri: imageUri,
            width: imageMetadata.width,
            height: imageMetadata.height,
          };
        }
      }
    }

    // Handle file attachment
    let file: FileAttachment | undefined;
    if (encryptedFile && fileMetadata) {
      const decryptedFileBase64 = cryptoService.decryptBinaryData(
        encryptedFile,
        nonce,
        this.user.privateKey,
        contact.publicKey
      );

      if (decryptedFileBase64) {
        // Save file data to a local file
        const fileUri = await this.saveFileToLocal(decryptedFileBase64, messageId, fileMetadata.name);
        if (fileUri) {
          file = {
            name: fileMetadata.name,
            size: fileMetadata.size,
            mimeType: fileMetadata.mimeType,
            uri: fileUri,
          };
        }
      }
    }

    // Decrypt text content (may be empty for voice/file messages)
    let content = '';
    if (encryptedContent) {
      const decryptedContent = cryptoService.decryptMessage(
        encryptedContent,
        nonce,
        this.user.privateKey,
        contact.publicKey
      );
      content = decryptedContent || '';
    }

    // For voice/image/file-only messages, we may have no text content
    if (!content && !voice && !image && !file) {
      console.error('[MessagingService] Failed to decrypt message - no content, voice, image, or file');
      return;
    }

    // Create message object
    const message: Message = {
      id: messageId,
      conversationId: fromWhisperId,
      senderId: fromWhisperId,
      content,
      timestamp,
      status: 'delivered',
      voice,
      image,
      file,
      isForwarded,
      ...(replyTo && { replyTo }),
    };

    // Save to storage
    await secureStorage.addMessage(fromWhisperId, message);

    // Update conversation
    const conversation = await secureStorage.getOrCreateConversation(fromWhisperId);
    // Determine display content for the last message preview
    let displayContent = content;
    if (voice) {
      displayContent = 'Voice message';
    } else if (image) {
      displayContent = 'Photo';
    } else if (file) {
      displayContent = `File: ${file.name}`;
    }
    await secureStorage.updateConversation(fromWhisperId, {
      lastMessage: { ...message, content: displayContent },
      updatedAt: timestamp,
      unreadCount: conversation.unreadCount + 1,
    });

    // Send delivery receipt
    this.sendDeliveryReceipt(fromWhisperId, messageId, 'delivered');

    // Notify all handlers
    this.notifyMessageHandlers(message, contact);

    console.log('[MessagingService] Message received from', fromWhisperId);
  }

  // Private: Save voice data to local file
  private async saveVoiceToFile(base64Data: string, messageId: string): Promise<string | null> {
    try {
      // Dynamic import to avoid loading file system when not needed
      const FileSystem = await import('expo-file-system/legacy');
      const voiceDir = `${FileSystem.documentDirectory}voices/`;

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(voiceDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(voiceDir, { intermediates: true });
      }

      const filePath = `${voiceDir}${messageId}.m4a`;
      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: 'base64',
      });

      return filePath;
    } catch (error) {
      console.error('[MessagingService] Failed to save voice file:', error);
      return null;
    }
  }

  // Private: Save image data to local file
  private async saveImageToFile(base64Data: string, messageId: string): Promise<string | null> {
    try {
      // Dynamic import to avoid loading file system when not needed
      const FileSystem = await import('expo-file-system/legacy');
      const imagesDir = `${FileSystem.documentDirectory}images/`;

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(imagesDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });
      }

      const filePath = `${imagesDir}${messageId}.jpg`;
      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: 'base64',
      });

      return filePath;
    } catch (error) {
      console.error('[MessagingService] Failed to save image file:', error);
      return null;
    }
  }

  // Private: Save file data to local file
  private async saveFileToLocal(base64Data: string, messageId: string, fileName: string): Promise<string | null> {
    try {
      // Dynamic import to avoid loading file system when not needed
      const FileSystem = await import('expo-file-system/legacy');
      const filesDir = `${FileSystem.documentDirectory}files/`;

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(filesDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(filesDir, { intermediates: true });
      }

      // Get file extension from original filename
      const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
      const filePath = `${filesDir}${messageId}${ext}`;

      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: 'base64',
      });

      return filePath;
    } catch (error) {
      console.error('[MessagingService] Failed to save file:', error);
      return null;
    }
  }

  // Private: Handle delivery status update
  // Server sends:
  //   - message_delivered: { messageId, status, toWhisperId } - when server receives our message
  //   - delivery_status: { messageId, status, fromWhisperId } - when recipient reads/delivers
  private async handleDeliveryStatus(payload: {
    messageId: string;
    status: 'sent' | 'delivered' | 'pending' | 'read';
    toWhisperId?: string;  // From message_delivered
    fromWhisperId?: string; // From delivery_status
  }): Promise<void> {
    const { messageId, status, toWhisperId, fromWhisperId } = payload;

    // Map 'pending' to 'sent' for UI purposes
    const uiStatus = status === 'pending' ? 'sent' : status;

    // Determine which conversation this belongs to
    // message_delivered uses toWhisperId, delivery_status uses fromWhisperId
    const conversationId = toWhisperId || fromWhisperId;

    // Persist status to storage
    if (conversationId) {
      await secureStorage.updateMessageStatus(conversationId, messageId, uiStatus as Message['status']);
    } else {
      // If no conversation ID provided, try to find the message in all conversations
      const conversations = await secureStorage.getConversations();
      for (const conv of conversations) {
        const messages = await secureStorage.getMessages(conv.contactId);
        const msg = messages.find(m => m.id === messageId);
        if (msg) {
          await secureStorage.updateMessageStatus(conv.contactId, messageId, uiStatus as Message['status']);
          break;
        }
      }
    }

    this.notifyStatusHandlers(messageId, uiStatus as Message['status']);
    console.log('[MessagingService] Message', messageId, 'status:', status);
  }

  // Private: Handle pending messages on reconnect
  private async handlePendingMessages(messages: Array<{
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
    senderPublicKey?: string; // For message requests from unknown senders
    // Media attachments - passed through from server
    encryptedVoice?: string;
    voiceDuration?: number;
    encryptedImage?: string;
    imageMetadata?: { width: number; height: number };
    encryptedFile?: string;
    fileMetadata?: { name: string; size: number; mimeType: string };
    isForwarded?: boolean;
    replyTo?: { messageId: string; content: string; senderId: string };
  }>): Promise<void> {
    console.log('[MessagingService] Processing', messages.length, 'pending messages');

    for (const msg of messages) {
      await this.handleIncomingMessage(msg);
    }
  }

  // Private: Send WebSocket message
  private send(message: { type: string; payload: Record<string, unknown> }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Private: Schedule reconnection
  private scheduleReconnect(): void {
    if (this.reconnectTimeout || !this.user) return;

    // Exponential backoff: delay doubles with each attempt, up to max
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;

    console.log('[MessagingService] Reconnecting in', delay, 'ms (attempt', this.reconnectAttempts + ')');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.user) {
        this.connect(this.user);
      }
    }, delay);
  }

  // Private: Start ping interval
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping', payload: {} });
    }, PING_INTERVAL);
  }

  // Private: Stop ping interval
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ============ GROUP MESSAGE HANDLERS ============

  // Private: Handle group created notification
  private async handleGroupCreated(payload: {
    groupId: string;
    name: string;
    createdBy: string;
    members: string[];
    createdAt: number;
  }): Promise<void> {
    const { groupId, name, createdBy, members, createdAt } = payload;

    // Check if we already have this group
    const existingGroup = await secureStorage.getGroup(groupId);
    if (existingGroup) {
      console.log('[MessagingService] Group already exists:', groupId);
      return;
    }

    // Create and save the group
    const group: Group = {
      id: groupId,
      name,
      members,
      createdBy,
      createdAt,
    };

    await secureStorage.saveGroup(group);
    await secureStorage.getOrCreateGroupConversation(groupId);

    // Notify handlers
    this.notifyGroupUpdateHandlers(groupId, group);

    console.log('[MessagingService] Group created by another member:', groupId);
  }

  // Private: Handle incoming group message
  private async handleGroupMessageReceived(payload: {
    groupId: string;
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
    senderName?: string;
  }): Promise<void> {
    if (!this.user) return;

    const { groupId, messageId, fromWhisperId, encryptedContent, nonce, timestamp, senderName } = payload;

    // Check if we're a member of this group
    const group = await secureStorage.getGroup(groupId);
    if (!group) {
      console.log('[MessagingService] Ignoring message for unknown group:', groupId);
      return;
    }

    // Don't process our own messages
    if (fromWhisperId === this.user.whisperId) {
      return;
    }

    // Decrypt the message content
    // For MVP, we use simple decryption since we're not using proper group encryption
    const content = cryptoService.decryptFromGroup(
      encryptedContent,
      nonce,
      this.user.privateKey
    ) || encryptedContent; // Fallback to showing encrypted content if decryption fails

    // Create message object
    const message: Message = {
      id: messageId,
      conversationId: groupId,
      senderId: fromWhisperId,
      content,
      timestamp,
      status: 'delivered',
      groupId,
      senderName,
    };

    // Save to storage
    await secureStorage.addGroupMessage(groupId, message);

    // Update group conversation
    const conversation = await secureStorage.getOrCreateGroupConversation(groupId);
    await secureStorage.updateGroupConversation(groupId, {
      lastMessage: message,
      updatedAt: timestamp,
      unreadCount: conversation.unreadCount + 1,
    });

    // Notify handlers
    this.notifyGroupMessageHandlers(message, group);

    console.log('[MessagingService] Group message received in', groupId, 'from', fromWhisperId);
  }

  // Private: Handle group updated notification
  private async handleGroupUpdated(payload: {
    groupId: string;
    updatedBy: string;
    name?: string;
    addedMembers?: string[];
    removedMembers?: string[];
  }): Promise<void> {
    if (!this.user) return;

    const { groupId, updatedBy, name, addedMembers, removedMembers } = payload;

    // Get the group
    const group = await secureStorage.getGroup(groupId);
    if (!group) {
      console.log('[MessagingService] Ignoring update for unknown group:', groupId);
      return;
    }

    // Check if we were removed
    if (removedMembers?.includes(this.user.whisperId)) {
      // We were removed from the group
      await secureStorage.deleteGroup(groupId);
      this.notifyGroupUpdateHandlers(groupId, { members: [] });
      console.log('[MessagingService] Removed from group:', groupId);
      return;
    }

    // Apply updates
    const updates: Partial<Group> = {};

    if (name) {
      updates.name = name;
    }

    if (addedMembers && addedMembers.length > 0) {
      updates.members = [...new Set([...group.members, ...addedMembers])];
    }

    if (removedMembers && removedMembers.length > 0) {
      updates.members = (updates.members || group.members).filter(
        m => !removedMembers.includes(m)
      );
    }

    if (Object.keys(updates).length > 0) {
      await secureStorage.updateGroup(groupId, updates);
      this.notifyGroupUpdateHandlers(groupId, updates);
    }

    console.log('[MessagingService] Group updated:', groupId, 'by', updatedBy);
  }

  // Private: Handle member left group notification
  private async handleMemberLeftGroup(payload: {
    groupId: string;
    memberId: string;
  }): Promise<void> {
    const { groupId, memberId } = payload;

    const group = await secureStorage.getGroup(groupId);
    if (!group) {
      console.log('[MessagingService] Ignoring leave for unknown group:', groupId);
      return;
    }

    // Remove the member from the group
    const newMembers = group.members.filter(m => m !== memberId);
    await secureStorage.updateGroup(groupId, { members: newMembers });

    this.notifyGroupUpdateHandlers(groupId, { members: newMembers });

    console.log('[MessagingService] Member', memberId, 'left group:', groupId);
  }

  // ============ PUBLIC KEY LOOKUP FOR MESSAGE REQUESTS ============

  // Private: Handle public key response from server
  private handlePublicKeyResponse(payload: {
    whisperId: string;
    publicKey: string | null;
    exists: boolean;
  }): void {
    const { whisperId, publicKey, exists } = payload;
    console.log('[MessagingService] Public key response for', whisperId, ':', exists ? 'found' : 'not found');

    // Find and resolve the pending lookup
    const pending = this.pendingLookups.get(whisperId);
    if (pending) {
      pending.resolve({ whisperId, publicKey, exists });
      this.pendingLookups.delete(whisperId);
    }
  }

  // Public: Lookup a user's public key by Whisper ID
  // Returns null if user doesn't exist, or their public key if found
  async lookupPublicKey(whisperId: string): Promise<PublicKeyLookupResult> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server');
    }

    // Check if there's already a pending lookup
    const existing = this.pendingLookups.get(whisperId);
    if (existing) {
      return new Promise((resolve, reject) => {
        // Wait for the existing lookup to complete
        const originalResolve = existing.resolve;
        const originalReject = existing.reject;
        existing.resolve = (result) => {
          originalResolve(result);
          resolve(result);
        };
        existing.reject = (error) => {
          originalReject(error);
          reject(error);
        };
      });
    }

    return new Promise((resolve, reject) => {
      // Set a timeout for the lookup
      const timeout = setTimeout(() => {
        this.pendingLookups.delete(whisperId);
        reject(new Error('Public key lookup timed out'));
      }, 10000); // 10 second timeout

      // Store the resolve function
      this.pendingLookups.set(whisperId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      // Send the lookup request
      this.send({
        type: 'lookup_public_key',
        payload: { whisperId },
      });
    });
  }

  // Public: Send a message request to a user using only their Whisper ID
  // This looks up their public key first, then sends the message
  async sendMessageRequest(
    toWhisperId: string,
    content: string
  ): Promise<{ success: boolean; message?: Message; error?: string }> {
    if (!this.user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!this.isConnected()) {
      return { success: false, error: 'Not connected to server' };
    }

    try {
      // First, look up the recipient's public key
      console.log('[MessagingService] Looking up public key for', toWhisperId);
      const lookup = await this.lookupPublicKey(toWhisperId);

      if (!lookup.exists || !lookup.publicKey) {
        return { success: false, error: 'User not found' };
      }

      // Create a temporary contact to send the message
      const tempContact: Contact = {
        whisperId: toWhisperId,
        publicKey: lookup.publicKey,
        addedAt: Date.now(),
        isMessageRequest: false, // This is an outgoing request, not incoming
      };

      // Check if we already have this contact
      const existingContact = await secureStorage.getContact(toWhisperId);
      if (!existingContact) {
        // Save as a contact (they can be removed if blocked/rejected)
        await secureStorage.addContact(tempContact);
      }

      // Now send the message using the normal flow
      const message = await this.sendMessage(existingContact || tempContact, content);

      return { success: true, message };
    } catch (error) {
      console.error('[MessagingService] Failed to send message request:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const messagingService = new MessagingService();
export default messagingService;
