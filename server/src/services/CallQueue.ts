/**
 * CallQueue Service
 *
 * Temporarily stores pending call offers for offline users.
 * When a user comes online, any pending call offers are delivered immediately.
 * Calls expire after 60 seconds (matching the caller's timeout).
 */

interface PendingCall {
  callId: string;
  fromWhisperId: string;
  offer: string;
  isVideo: boolean;
  callerName?: string;
  timestamp: number;
}

// Call TTL in milliseconds (60 seconds - matches caller timeout)
const CALL_TTL = 60 * 1000;

// Cleanup interval (every 10 seconds)
const CLEANUP_INTERVAL = 10 * 1000;

class CallQueue {
  // Map of whisperId -> pending call
  // Only store one pending call per user (latest call wins)
  private pendingCalls: Map<string, PendingCall> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Queue a call offer for an offline user
   */
  queueCall(
    toWhisperId: string,
    fromWhisperId: string,
    callId: string,
    offer: string,
    isVideo: boolean,
    callerName?: string
  ): void {
    // Remove any existing pending call for this user
    this.pendingCalls.delete(toWhisperId);

    const pendingCall: PendingCall = {
      callId,
      fromWhisperId,
      offer,
      isVideo,
      callerName,
      timestamp: Date.now(),
    };

    this.pendingCalls.set(toWhisperId, pendingCall);
    console.log(`[CallQueue] Queued call for ${toWhisperId}: callId=${callId}, from=${fromWhisperId}`);
  }

  /**
   * Get and remove pending call for a user (when they come online)
   * Returns null if no pending call or if call has expired
   */
  getPendingCall(whisperId: string): PendingCall | null {
    const pendingCall = this.pendingCalls.get(whisperId);

    if (!pendingCall) {
      return null;
    }

    // Check if call has expired
    if (Date.now() - pendingCall.timestamp > CALL_TTL) {
      console.log(`[CallQueue] Pending call for ${whisperId} has expired`);
      this.pendingCalls.delete(whisperId);
      return null;
    }

    // Remove from queue and return
    this.pendingCalls.delete(whisperId);
    console.log(`[CallQueue] Delivering pending call to ${whisperId}: callId=${pendingCall.callId}`);
    return pendingCall;
  }

  /**
   * Cancel a pending call (when caller hangs up)
   */
  cancelCall(callId: string): void {
    for (const [whisperId, call] of this.pendingCalls.entries()) {
      if (call.callId === callId) {
        this.pendingCalls.delete(whisperId);
        console.log(`[CallQueue] Cancelled pending call: callId=${callId}`);
        return;
      }
    }
  }

  /**
   * Cancel all pending calls from a specific user
   */
  cancelCallsFromUser(fromWhisperId: string): void {
    for (const [whisperId, call] of this.pendingCalls.entries()) {
      if (call.fromWhisperId === fromWhisperId) {
        this.pendingCalls.delete(whisperId);
        console.log(`[CallQueue] Cancelled pending call from ${fromWhisperId} to ${whisperId}`);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): { pendingCalls: number } {
    return {
      pendingCalls: this.pendingCalls.size,
    };
  }

  /**
   * Start the cleanup interval to remove expired calls
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, CLEANUP_INTERVAL);
  }

  /**
   * Clean up expired pending calls
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [whisperId, call] of this.pendingCalls.entries()) {
      if (now - call.timestamp > CALL_TTL) {
        this.pendingCalls.delete(whisperId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CallQueue] Cleaned up ${cleaned} expired pending calls`);
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const callQueue = new CallQueue();
export default callQueue;
