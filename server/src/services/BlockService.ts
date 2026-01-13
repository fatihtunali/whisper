/**
 * BlockService - Server-side enforcement of P2P blocking
 *
 * When user A blocks user B:
 * - B cannot send messages to A (server rejects)
 * - B cannot call A (server rejects)
 * - B cannot send typing indicators to A (server drops silently)
 */

class BlockService {
  // Map from blocker -> Set of blocked users
  private blocks: Map<string, Set<string>> = new Map();

  /**
   * Block a user
   * @param blocker WhisperId of the user who is blocking
   * @param blocked WhisperId of the user being blocked
   */
  block(blocker: string, blocked: string): void {
    let blockedSet = this.blocks.get(blocker);
    if (!blockedSet) {
      blockedSet = new Set();
      this.blocks.set(blocker, blockedSet);
    }
    blockedSet.add(blocked);
    console.log(`[BlockService] ${blocker} blocked ${blocked}`);
  }

  /**
   * Unblock a user
   * @param blocker WhisperId of the user who is unblocking
   * @param blocked WhisperId of the user being unblocked
   */
  unblock(blocker: string, blocked: string): void {
    const blockedSet = this.blocks.get(blocker);
    if (blockedSet) {
      blockedSet.delete(blocked);
      if (blockedSet.size === 0) {
        this.blocks.delete(blocker);
      }
      console.log(`[BlockService] ${blocker} unblocked ${blocked}`);
    }
  }

  /**
   * Check if sender is blocked by recipient
   * @param sender WhisperId of the sender
   * @param recipient WhisperId of the recipient
   * @returns true if sender is blocked by recipient
   */
  isBlocked(sender: string, recipient: string): boolean {
    const blockedSet = this.blocks.get(recipient);
    return blockedSet?.has(sender) || false;
  }

  /**
   * Get all users blocked by a given user
   * @param whisperId WhisperId of the user
   * @returns Array of blocked WhisperIds
   */
  getBlockedUsers(whisperId: string): string[] {
    const blockedSet = this.blocks.get(whisperId);
    return blockedSet ? Array.from(blockedSet) : [];
  }

  /**
   * Clear all blocks for a user (used in account deletion)
   * @param whisperId WhisperId of the user
   */
  clearBlocks(whisperId: string): void {
    // Remove all blocks BY this user
    this.blocks.delete(whisperId);

    // Remove all blocks OF this user by others
    for (const [blocker, blockedSet] of this.blocks) {
      blockedSet.delete(whisperId);
      if (blockedSet.size === 0) {
        this.blocks.delete(blocker);
      }
    }

    console.log(`[BlockService] Cleared all blocks for ${whisperId}`);
  }

  /**
   * Get statistics
   */
  getStats(): { totalBlockers: number; totalBlocks: number } {
    let totalBlocks = 0;
    for (const blockedSet of this.blocks.values()) {
      totalBlocks += blockedSet.size;
    }
    return {
      totalBlockers: this.blocks.size,
      totalBlocks,
    };
  }
}

// Singleton instance
export const blockService = new BlockService();
export default blockService;
