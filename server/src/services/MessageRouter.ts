import { WebSocket } from 'ws';
import { connectionManager } from '../websocket/ConnectionManager';
import { messageQueue } from './MessageQueue';
import { pushService } from './PushService';
import {
  ServerMessage,
  MessageReceivedMessage,
  MessageDeliveredMessage,
  PendingMessagesMessage,
  DeliveryStatusMessage,
} from '../types';

class MessageRouter {
  // Send a message to a client
  private send(socket: WebSocket, message: ServerMessage): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[MessageRouter] Failed to send message:', error);
      return false;
    }
  }

  // Route an encrypted message to recipient
  routeMessage(
    messageId: string,
    fromWhisperId: string,
    toWhisperId: string,
    encryptedContent: string,
    nonce: string
  ): 'delivered' | 'pending' | 'error' {
    const recipientSocket = connectionManager.getSocket(toWhisperId);

    // Get sender's public key for recipients who don't have sender in contacts
    // Use getPublicKey which falls back to persistent store when sender is offline
    const senderPublicKey = connectionManager.getPublicKey(fromWhisperId) || undefined;

    if (recipientSocket) {
      // Recipient is online - deliver immediately
      const message: MessageReceivedMessage = {
        type: 'message_received',
        payload: {
          messageId,
          fromWhisperId,
          encryptedContent,
          nonce,
          timestamp: Date.now(),
          senderPublicKey, // Include sender's public key for message requests
        },
      };

      if (this.send(recipientSocket, message)) {
        console.log(`[MessageRouter] Delivered ${messageId} from ${fromWhisperId} to ${toWhisperId}`);
        return 'delivered';
      }
    }

    // Recipient is offline or delivery failed - queue the message
    messageQueue.enqueue(messageId, fromWhisperId, toWhisperId, encryptedContent, nonce, senderPublicKey);
    console.log(`[MessageRouter] Queued ${messageId} for offline user ${toWhisperId}`);

    // Send push notification if recipient has a push token
    const pushToken = connectionManager.getPushToken(toWhisperId);
    if (pushToken) {
      pushService.sendMessageNotification(pushToken, fromWhisperId)
        .catch(err => console.error('[MessageRouter] Push notification failed:', err));
    }

    return 'pending';
  }

  // Notify sender about message delivery status
  notifyDeliveryStatus(
    senderWhisperId: string,
    messageId: string,
    status: 'sent' | 'delivered' | 'pending'
  ): void {
    const senderSocket = connectionManager.getSocket(senderWhisperId);
    if (!senderSocket) return;

    const message: MessageDeliveredMessage = {
      type: 'message_delivered',
      payload: {
        messageId,
        status,
      },
    };

    this.send(senderSocket, message);
  }

  // Forward delivery/read receipt to original sender
  forwardReceipt(
    fromWhisperId: string,
    toWhisperId: string,
    messageId: string,
    status: 'delivered' | 'read'
  ): void {
    const senderSocket = connectionManager.getSocket(toWhisperId);
    if (!senderSocket) {
      console.log(`[MessageRouter] Cannot forward receipt - ${toWhisperId} is offline`);
      return;
    }

    const message: DeliveryStatusMessage = {
      type: 'delivery_status',
      payload: {
        messageId,
        status,
      },
    };

    if (this.send(senderSocket, message)) {
      console.log(`[MessageRouter] Forwarded ${status} receipt for ${messageId} to ${toWhisperId}`);
    }
  }

  // Deliver pending messages when user comes online
  deliverPending(whisperId: string): number {
    const socket = connectionManager.getSocket(whisperId);
    if (!socket) return 0;

    const pending = messageQueue.getPending(whisperId);
    if (pending.length === 0) return 0;

    const message: PendingMessagesMessage = {
      type: 'pending_messages',
      payload: {
        messages: pending.map(msg => ({
          messageId: msg.id,
          fromWhisperId: msg.fromWhisperId,
          encryptedContent: msg.encryptedContent,
          nonce: msg.nonce,
          timestamp: msg.timestamp,
          senderPublicKey: msg.senderPublicKey,
        })),
        cursor: null,
        nextCursor: null,
        hasMore: false,
      },
    };

    if (this.send(socket, message)) {
      console.log(`[MessageRouter] Delivered ${pending.length} pending messages to ${whisperId}`);
      messageQueue.clearPending(whisperId);
      return pending.length;
    }

    return 0;
  }
}

// Singleton instance
export const messageRouter = new MessageRouter();
export default messageRouter;
