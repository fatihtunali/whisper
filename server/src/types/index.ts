import { WebSocket } from 'ws';

// Connected client
export interface ConnectedClient {
  whisperId: string;
  publicKey: string;
  socket: WebSocket;
  connectedAt: number;
  lastPing: number;
}

// Pending message for offline users
export interface PendingMessage {
  id: string;
  fromWhisperId: string;
  toWhisperId: string;
  encryptedContent: string;
  nonce: string;
  timestamp: number;
  expiresAt: number;
}

// Client -> Server message types
export type ClientMessageType =
  | 'register'
  | 'send_message'
  | 'delivery_receipt'
  | 'fetch_pending'
  | 'ping';

// Server -> Client message types
export type ServerMessageType =
  | 'register_ack'
  | 'message_received'
  | 'message_delivered'
  | 'pending_messages'
  | 'delivery_status'
  | 'pong'
  | 'error';

// Client -> Server messages
export interface RegisterMessage {
  type: 'register';
  payload: {
    whisperId: string;
    publicKey: string;
  };
}

export interface SendMessageMessage {
  type: 'send_message';
  payload: {
    messageId: string;
    toWhisperId: string;
    encryptedContent: string;
    nonce: string;
  };
}

export interface DeliveryReceiptMessage {
  type: 'delivery_receipt';
  payload: {
    messageId: string;
    toWhisperId: string; // Original sender to notify
    status: 'delivered' | 'read';
  };
}

export interface FetchPendingMessage {
  type: 'fetch_pending';
  payload: Record<string, never>;
}

export interface PingMessage {
  type: 'ping';
  payload: Record<string, never>;
}

export type ClientMessage =
  | RegisterMessage
  | SendMessageMessage
  | DeliveryReceiptMessage
  | FetchPendingMessage
  | PingMessage;

// Server -> Client messages
export interface RegisterAckMessage {
  type: 'register_ack';
  payload: {
    success: boolean;
    error?: string;
  };
}

export interface MessageReceivedMessage {
  type: 'message_received';
  payload: {
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
  };
}

export interface MessageDeliveredMessage {
  type: 'message_delivered';
  payload: {
    messageId: string;
    status: 'sent' | 'delivered' | 'pending';
  };
}

export interface PendingMessagesMessage {
  type: 'pending_messages';
  payload: {
    messages: Array<{
      messageId: string;
      fromWhisperId: string;
      encryptedContent: string;
      nonce: string;
      timestamp: number;
    }>;
  };
}

export interface DeliveryStatusMessage {
  type: 'delivery_status';
  payload: {
    messageId: string;
    status: 'delivered' | 'read';
  };
}

export interface PongMessage {
  type: 'pong';
  payload: Record<string, never>;
}

export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}

export type ServerMessage =
  | RegisterAckMessage
  | MessageReceivedMessage
  | MessageDeliveredMessage
  | PendingMessagesMessage
  | DeliveryStatusMessage
  | PongMessage
  | ErrorMessage;
