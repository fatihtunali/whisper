/**
 * RateLimiter - Rate limiting for transient messages
 *
 * Prevents spam and abuse by limiting:
 * - Typing indicators: max 1 per 2 seconds per sender/recipient pair
 */

class RateLimiter {
  // Map of "sender:recipient" -> last timestamp
  private typingTimestamps: Map<string, number> = new Map();

  // Typing indicator rate limit: 2 seconds
  private static readonly TYPING_INTERVAL_MS = 2000;

  // Cleanup interval handle
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Check if a typing indicator should be rate limited
   * Returns true if rate limited (should NOT forward), false if OK
   */
  checkTypingLimit(sender: string, recipient: string): boolean {
    const key = `${sender}:${recipient}`;
    const now = Date.now();
    const last = this.typingTimestamps.get(key) || 0;

    if (now - last < RateLimiter.TYPING_INTERVAL_MS) {
      // Rate limited
      return true;
    }

    // Update timestamp and allow
    this.typingTimestamps.set(key, now);
    return false;
  }

  /**
   * Clean up old entries (older than 1 minute)
   */
  private cleanup(): void {
    const expiry = Date.now() - 60 * 1000;
    let cleaned = 0;

    for (const [key, timestamp] of this.typingTimestamps) {
      if (timestamp < expiry) {
        this.typingTimestamps.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleaned} stale entries`);
    }
  }

  /**
   * Get statistics
   */
  getStats(): { trackedPairs: number } {
    return {
      trackedPairs: this.typingTimestamps.size,
    };
  }

  /**
   * Shutdown cleanup interval
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
export default rateLimiter;
