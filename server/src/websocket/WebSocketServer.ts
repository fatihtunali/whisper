import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { connectionManager } from './ConnectionManager';
import { messageRouter } from '../services/MessageRouter';
import { messageQueue } from '../services/MessageQueue';
import {
  ClientMessage,
  ServerMessage,
  RegisterAckMessage,
  PongMessage,
  ErrorMessage,
} from '../types';

export class WebSocketServer {
  private wss: WSServer;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(server: HTTPServer) {
    this.wss = new WSServer({ server });
    this.setupEventHandlers();
    this.startCleanupInterval();
    console.log('[WebSocket] Server initialized');
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (socket: WebSocket) => {
      console.log('[WebSocket] New connection');

      socket.on('message', (data: Buffer) => {
        this.handleMessage(socket, data);
      });

      socket.on('close', () => {
        const whisperId = connectionManager.unregisterBySocket(socket);
        if (whisperId) {
          console.log(`[WebSocket] Disconnected: ${whisperId}`);
        }
      });

      socket.on('error', (error) => {
        console.error('[WebSocket] Socket error:', error);
        connectionManager.unregisterBySocket(socket);
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

      case 'send_message':
        this.handleSendMessage(socket, message.payload);
        break;

      case 'delivery_receipt':
        this.handleDeliveryReceipt(socket, message.payload);
        break;

      case 'fetch_pending':
        this.handleFetchPending(socket);
        break;

      case 'ping':
        this.handlePing(socket);
        break;

      default:
        this.sendError(socket, 'UNKNOWN_TYPE', `Unknown message type`);
    }
  }

  private handleRegister(
    socket: WebSocket,
    payload: { whisperId: string; publicKey: string }
  ): void {
    const { whisperId, publicKey } = payload;

    // Validate Whisper ID format
    if (!whisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(whisperId)) {
      this.sendError(socket, 'INVALID_ID', 'Invalid Whisper ID format');
      return;
    }

    // Validate public key
    if (!publicKey || publicKey.length < 10) {
      this.sendError(socket, 'INVALID_KEY', 'Invalid public key');
      return;
    }

    // Register the client
    connectionManager.register(whisperId, publicKey, socket);

    // Send acknowledgment
    const ack: RegisterAckMessage = {
      type: 'register_ack',
      payload: { success: true },
    };
    this.send(socket, ack);

    // Deliver any pending messages
    const delivered = messageRouter.deliverPending(whisperId);
    console.log(`[WebSocket] Registered ${whisperId}, delivered ${delivered} pending messages`);
  }

  private handleSendMessage(
    socket: WebSocket,
    payload: {
      messageId: string;
      toWhisperId: string;
      encryptedContent: string;
      nonce: string;
    }
  ): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register before sending messages');
      return;
    }

    const { messageId, toWhisperId, encryptedContent, nonce } = payload;

    // Validate recipient Whisper ID
    if (!toWhisperId || !/^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(toWhisperId)) {
      this.sendError(socket, 'INVALID_RECIPIENT', 'Invalid recipient Whisper ID');
      return;
    }

    // Route the message
    const status = messageRouter.routeMessage(
      messageId,
      client.whisperId,
      toWhisperId,
      encryptedContent,
      nonce
    );

    // Notify sender of delivery status
    // 'delivered' if recipient was online, 'pending' if queued
    // Note: 'sent' status happens immediately after the message is received by server
    messageRouter.notifyDeliveryStatus(
      client.whisperId,
      messageId,
      status === 'delivered' ? 'delivered' : 'pending'
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

    // Forward the receipt to the original sender
    messageRouter.forwardReceipt(client.whisperId, toWhisperId, messageId, status);
  }

  private handleFetchPending(socket: WebSocket): void {
    const client = connectionManager.getBySocket(socket);
    if (!client) {
      this.sendError(socket, 'NOT_REGISTERED', 'You must register first');
      return;
    }

    messageRouter.deliverPending(client.whisperId);
  }

  private handlePing(socket: WebSocket): void {
    const client = connectionManager.getBySocket(socket);
    if (client) {
      connectionManager.updatePing(client.whisperId);
    }

    const pong: PongMessage = {
      type: 'pong',
      payload: {},
    };
    this.send(socket, pong);
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
    this.cleanupInterval = setInterval(() => {
      connectionManager.cleanupStale();
      messageQueue.cleanupExpired();
    }, 60 * 1000);
  }

  // Get server statistics
  getStats(): { connections: number; pendingMessages: { users: number; messages: number } } {
    return {
      connections: connectionManager.getCount(),
      pendingMessages: messageQueue.getStats(),
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
