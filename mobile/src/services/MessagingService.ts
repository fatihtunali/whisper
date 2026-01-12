import { LocalUser, Message, Contact } from '../types';
import { cryptoService } from '../crypto/CryptoService';
import { secureStorage } from '../storage/SecureStorage';
import { generateId } from '../utils/helpers';

const WS_URL = 'wss://sarjmobile.com/ws';
const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 30000;

type MessageHandler = (message: Message, contact: Contact) => void;
type StatusHandler = (messageId: string, status: Message['status']) => void;
type ConnectionHandler = (connected: boolean) => void;

class MessagingService {
  private ws: WebSocket | null = null;
  private user: LocalUser | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;

  // Event handlers
  private onMessageReceived: MessageHandler | null = null;
  private onStatusUpdate: StatusHandler | null = null;
  private onConnectionChange: ConnectionHandler | null = null;

  // Set event handlers
  setOnMessageReceived(handler: MessageHandler | null): void {
    this.onMessageReceived = handler;
  }

  setOnStatusUpdate(handler: StatusHandler | null): void {
    this.onStatusUpdate = handler;
  }

  setOnConnectionChange(handler: ConnectionHandler | null): void {
    this.onConnectionChange = handler;
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
        this.register();
        this.startPing();
        this.onConnectionChange?.(true);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[MessagingService] Disconnected');
        this.isConnecting = false;
        this.stopPing();
        this.onConnectionChange?.(false);
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

    this.onConnectionChange?.(false);
  }

  // Check if connected
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Send a message to a contact
  async sendMessage(contact: Contact, content: string): Promise<Message> {
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
    };

    // Save to local storage first
    await secureStorage.addMessage(contact.whisperId, message);
    await secureStorage.updateConversation(contact.whisperId, {
      lastMessage: message,
      updatedAt: Date.now(),
    });

    // Encrypt the message
    const { encrypted, nonce } = cryptoService.encryptMessage(
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

      // Update status to 'sent' (server received it)
      message.status = 'sent';
      await secureStorage.updateMessageStatus(contact.whisperId, messageId, 'sent');
    } else {
      // Mark as failed if not connected
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

  // Private: Register with server
  private register(): void {
    if (!this.user) return;

    this.send({
      type: 'register',
      payload: {
        whisperId: this.user.whisperId,
        publicKey: this.user.publicKey,
      },
    });
  }

  // Private: Handle incoming WebSocket message
  private async handleMessage(data: string): Promise<void> {
    try {
      const message = JSON.parse(data);
      console.log('[MessagingService] Received:', message.type);

      switch (message.type) {
        case 'register_ack':
          console.log('[MessagingService] Registered successfully');
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

        case 'error':
          console.error('[MessagingService] Server error:', message.payload);
          break;
      }
    } catch (error) {
      console.error('[MessagingService] Failed to parse message:', error);
    }
  }

  // Private: Handle incoming encrypted message
  private async handleIncomingMessage(payload: {
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
  }): Promise<void> {
    if (!this.user) return;

    const { messageId, fromWhisperId, encryptedContent, nonce, timestamp } = payload;

    // Get the sender's contact info
    const contact = await secureStorage.getContact(fromWhisperId);
    if (!contact) {
      console.warn('[MessagingService] Message from unknown contact:', fromWhisperId);
      return;
    }

    // Decrypt the message
    const content = cryptoService.decryptMessage(
      encryptedContent,
      nonce,
      this.user.privateKey,
      contact.publicKey
    );

    if (!content) {
      console.error('[MessagingService] Failed to decrypt message');
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
    };

    // Save to storage
    await secureStorage.addMessage(fromWhisperId, message);

    // Update conversation
    const conversation = await secureStorage.getOrCreateConversation(fromWhisperId);
    await secureStorage.updateConversation(fromWhisperId, {
      lastMessage: message,
      updatedAt: timestamp,
      unreadCount: conversation.unreadCount + 1,
    });

    // Send delivery receipt
    this.sendDeliveryReceipt(fromWhisperId, messageId, 'delivered');

    // Notify handler
    this.onMessageReceived?.(message, contact);

    console.log('[MessagingService] Message received from', fromWhisperId);
  }

  // Private: Handle delivery status update
  private handleDeliveryStatus(payload: {
    messageId: string;
    status: 'sent' | 'delivered' | 'pending' | 'read';
  }): void {
    const { messageId, status } = payload;

    // Map 'pending' to 'sent' for UI purposes
    const uiStatus = status === 'pending' ? 'sent' : status;

    this.onStatusUpdate?.(messageId, uiStatus as Message['status']);
    console.log('[MessagingService] Message', messageId, 'status:', status);
  }

  // Private: Handle pending messages on reconnect
  private async handlePendingMessages(messages: Array<{
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
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

    console.log('[MessagingService] Reconnecting in', RECONNECT_DELAY, 'ms');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.user) {
        this.connect(this.user);
      }
    }, RECONNECT_DELAY);
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
}

// Singleton instance
export const messagingService = new MessagingService();
export default messagingService;
