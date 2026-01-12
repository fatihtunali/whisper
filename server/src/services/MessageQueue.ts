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
    nonce: string
  ): void {
    const message: PendingMessage = {
      id: messageId,
      fromWhisperId,
      toWhisperId,
      encryptedContent,
      nonce,
      timestamp: Date.now(),
      expiresAt: Date.now() + MESSAGE_TTL_MS,
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
