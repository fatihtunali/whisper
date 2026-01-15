/**
 * MessageQueue - Redis-based offline message queue
 *
 * Stores pending messages for offline users in Redis
 * Messages automatically expire after 72 hours (TTL)
 */

import { redisService } from './RedisService';
import { PendingMessage } from '../types';

// Time-to-live for pending messages: 72 hours in seconds
const MESSAGE_TTL_SECONDS = 72 * 60 * 60;
const MESSAGE_TTL_MS = MESSAGE_TTL_SECONDS * 1000;

// Redis key prefix for message queue
const QUEUE_KEY = 'whisper:queue:';  // whisper:queue:{toWhisperId} -> list of message IDs
const MSG_KEY = 'whisper:msg:';      // whisper:msg:{messageId} -> JSON message data

class MessageQueue {
  private initialized: boolean = false;

  constructor() {
    // Redis is initialized by ConnectionManager
  }

  // Add a message to the queue for an offline user
  async enqueue(
    messageId: string,
    fromWhisperId: string,
    toWhisperId: string,
    encryptedContent: string,
    nonce: string,
    senderPublicKey?: string,
    media?: {
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
    const timestamp = Date.now();

    const message: PendingMessage = {
      id: messageId,
      fromWhisperId,
      toWhisperId,
      encryptedContent,
      nonce,
      timestamp,
      expiresAt: timestamp + MESSAGE_TTL_MS,
      senderPublicKey,
      encryptedVoice: media?.encryptedVoice,
      voiceDuration: media?.voiceDuration,
      encryptedImage: media?.encryptedImage,
      imageMetadata: media?.imageMetadata,
      encryptedFile: media?.encryptedFile,
      fileMetadata: media?.fileMetadata,
      isForwarded: media?.isForwarded,
      replyTo: media?.replyTo,
    };

    try {
      // Store message data with TTL
      await redisService.setMessage(messageId, JSON.stringify(message), MESSAGE_TTL_SECONDS);

      // Add message ID to user's queue
      await redisService.addToQueue(toWhisperId, messageId);

      const count = await this.getPendingCount(toWhisperId);
      console.log(`[MessageQueue] Queued message ${messageId} for ${toWhisperId} (${count} pending)`);
    } catch (error) {
      console.error('[MessageQueue] Failed to enqueue message:', error);
    }
  }

  // Get all pending messages for a user
  async getPending(whisperId: string): Promise<PendingMessage[]> {
    try {
      const messageIds = await redisService.getQueueMessages(whisperId);
      const messages: PendingMessage[] = [];

      for (const msgId of messageIds) {
        const data = await redisService.getMessage(msgId);
        if (data) {
          try {
            const message = JSON.parse(data) as PendingMessage;
            // Check if message hasn't expired
            if (message.expiresAt > Date.now()) {
              messages.push(message);
            }
          } catch (e) {
            console.error(`[MessageQueue] Failed to parse message ${msgId}:`, e);
          }
        }
      }

      // Sort by timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);
      return messages;
    } catch (error) {
      console.error('[MessageQueue] Failed to get pending messages:', error);
      return [];
    }
  }

  // Get pending messages with cursor-based pagination
  async getPendingPaginated(
    whisperId: string,
    cursor: string | null,
    limit: number = 50
  ): Promise<{
    messages: PendingMessage[];
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const allMessages = await this.getPending(whisperId);

    // Find start index based on cursor
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = allMessages.findIndex(msg => msg.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    // Get the page of messages
    const pageMessages = allMessages.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allMessages.length;

    const nextCursor = pageMessages.length > 0 && hasMore
      ? pageMessages[pageMessages.length - 1].id
      : null;

    return {
      messages: pageMessages,
      cursor: cursor,
      nextCursor,
      hasMore,
    };
  }

  // Remove all pending messages for a user (after delivery)
  async clearPending(whisperId: string): Promise<number> {
    try {
      const messageIds = await redisService.getQueueMessages(whisperId);
      const count = messageIds.length;

      // Delete all message data
      for (const msgId of messageIds) {
        await redisService.deleteMessage(msgId);
      }

      // Clear the queue
      await redisService.clearQueue(whisperId);

      if (count > 0) {
        console.log(`[MessageQueue] Cleared ${count} pending messages for ${whisperId}`);
      }
      return count;
    } catch (error) {
      console.error('[MessageQueue] Failed to clear pending:', error);
      return 0;
    }
  }

  // Remove a specific message from the queue
  async removeMessage(toWhisperId: string, messageId: string): Promise<boolean> {
    try {
      await redisService.deleteMessage(messageId);
      await redisService.removeFromQueue(toWhisperId, messageId);
      return true;
    } catch (error) {
      console.error('[MessageQueue] Failed to remove message:', error);
      return false;
    }
  }

  // Get count of pending messages for a user
  async getPendingCount(whisperId: string): Promise<number> {
    try {
      return await redisService.getQueueLength(whisperId);
    } catch (error) {
      console.error('[MessageQueue] Failed to get pending count:', error);
      return 0;
    }
  }

  // Get total messages in queue (expensive - scans all keys)
  async getTotalCount(): Promise<number> {
    try {
      return await redisService.getTotalQueuedMessages();
    } catch (error) {
      console.error('[MessageQueue] Failed to get total count:', error);
      return 0;
    }
  }

  // Clean up expired messages (Redis TTL handles most of this automatically)
  async cleanupExpired(): Promise<number> {
    // Redis TTL automatically expires messages, but we should clean up queue references
    try {
      const cleaned = await redisService.cleanupExpiredQueues();
      if (cleaned > 0) {
        console.log(`[MessageQueue] Cleaned ${cleaned} expired queue entries`);
      }
      return cleaned;
    } catch (error) {
      console.error('[MessageQueue] Failed to cleanup expired:', error);
      return 0;
    }
  }

  // Get queue statistics
  async getStats(): Promise<{ users: number; messages: number }> {
    try {
      return await redisService.getQueueStats();
    } catch (error) {
      console.error('[MessageQueue] Failed to get stats:', error);
      return { users: 0, messages: 0 };
    }
  }
}

// Singleton instance
export const messageQueue = new MessageQueue();
export default messageQueue;
