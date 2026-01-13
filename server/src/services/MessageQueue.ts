import { PendingMessage } from '../types';

// Time-to-live for pending messages: 72 hours
const MESSAGE_TTL_MS = 72 * 60 * 60 * 1000;

class MessageQueue {
  // Map of recipientWhisperId -> array of pending messages
  private queue: Map<string, PendingMessage[]> = new Map();

  // Add a message to the queue for an offline user
  enqueue(
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
  ): void {
    const message: PendingMessage = {
      id: messageId,
      fromWhisperId,
      toWhisperId,
      encryptedContent,
      nonce,
      timestamp: Date.now(),
      expiresAt: Date.now() + MESSAGE_TTL_MS,
      senderPublicKey,
      // Include media attachments if present
      ...(media?.encryptedVoice && { encryptedVoice: media.encryptedVoice }),
      ...(media?.voiceDuration && { voiceDuration: media.voiceDuration }),
      ...(media?.encryptedImage && { encryptedImage: media.encryptedImage }),
      ...(media?.imageMetadata && { imageMetadata: media.imageMetadata }),
      ...(media?.encryptedFile && { encryptedFile: media.encryptedFile }),
      ...(media?.fileMetadata && { fileMetadata: media.fileMetadata }),
      ...(media?.isForwarded && { isForwarded: media.isForwarded }),
      ...(media?.replyTo && { replyTo: media.replyTo }),
    };

    const userQueue = this.queue.get(toWhisperId) || [];
    userQueue.push(message);
    this.queue.set(toWhisperId, userQueue);

    console.log(`[MessageQueue] Queued message ${messageId} for ${toWhisperId} (${userQueue.length} pending)`);
  }

  // Get all pending messages for a user
  getPending(whisperId: string): PendingMessage[] {
    const userQueue = this.queue.get(whisperId) || [];
    // Filter out expired messages
    const now = Date.now();
    return userQueue.filter(msg => msg.expiresAt > now);
  }

  /**
   * Get pending messages with cursor-based pagination
   * Messages are returned in FIFO order (oldest first)
   * @param whisperId User's Whisper ID
   * @param cursor Message ID to start after (null for first page)
   * @param limit Maximum number of messages to return (default 50)
   */
  getPendingPaginated(
    whisperId: string,
    cursor: string | null,
    limit: number = 50
  ): {
    messages: PendingMessage[];
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
  } {
    const allMessages = this.getPending(whisperId);

    // Find start index based on cursor
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = allMessages.findIndex(msg => msg.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1; // Start after the cursor
      }
    }

    // Get the page of messages
    const pageMessages = allMessages.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allMessages.length;

    // Determine next cursor (last message ID in this page)
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
  clearPending(whisperId: string): number {
    const count = this.queue.get(whisperId)?.length || 0;
    this.queue.delete(whisperId);
    if (count > 0) {
      console.log(`[MessageQueue] Cleared ${count} pending messages for ${whisperId}`);
    }
    return count;
  }

  // Remove a specific message from the queue
  removeMessage(toWhisperId: string, messageId: string): boolean {
    const userQueue = this.queue.get(toWhisperId);
    if (!userQueue) return false;

    const index = userQueue.findIndex(msg => msg.id === messageId);
    if (index === -1) return false;

    userQueue.splice(index, 1);

    if (userQueue.length === 0) {
      this.queue.delete(toWhisperId);
    } else {
      this.queue.set(toWhisperId, userQueue);
    }

    return true;
  }

  // Get count of pending messages for a user
  getPendingCount(whisperId: string): number {
    return this.getPending(whisperId).length;
  }

  // Get total messages in queue
  getTotalCount(): number {
    let total = 0;
    for (const userQueue of this.queue.values()) {
      total += userQueue.length;
    }
    return total;
  }

  // Clean up expired messages
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [whisperId, userQueue] of this.queue) {
      const validMessages = userQueue.filter(msg => msg.expiresAt > now);
      const expiredCount = userQueue.length - validMessages.length;

      if (expiredCount > 0) {
        cleaned += expiredCount;
        if (validMessages.length === 0) {
          this.queue.delete(whisperId);
        } else {
          this.queue.set(whisperId, validMessages);
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[MessageQueue] Cleaned ${cleaned} expired messages`);
    }

    return cleaned;
  }

  // Get queue statistics
  getStats(): { users: number; messages: number } {
    return {
      users: this.queue.size,
      messages: this.getTotalCount(),
    };
  }
}

// Singleton instance
export const messageQueue = new MessageQueue();
export default messageQueue;
