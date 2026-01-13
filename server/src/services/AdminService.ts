// Admin Service - Handles user bans and account management for Child Safety compliance

// Super Admin configuration
export const SUPER_ADMIN = {
  email: 'fatihtunali@gmail.com',
  name: 'Fatih Tunali',
};

export interface BannedUser {
  whisperId: string;
  reason: 'child_safety' | 'harassment' | 'spam' | 'terms_violation' | 'other';
  bannedAt: number;
  bannedBy: string; // Admin identifier
  relatedReportIds: string[];
  notes?: string;
}

class AdminService {
  private bannedUsers: Map<string, BannedUser> = new Map();

  // Get super admin info
  getSuperAdmin(): typeof SUPER_ADMIN {
    return SUPER_ADMIN;
  }

  // Ban a user
  banUser(
    whisperId: string,
    reason: BannedUser['reason'],
    adminId: string,
    relatedReportIds: string[] = [],
    notes?: string
  ): BannedUser {
    const ban: BannedUser = {
      whisperId,
      reason,
      bannedAt: Date.now(),
      bannedBy: adminId,
      relatedReportIds,
      notes,
    };

    this.bannedUsers.set(whisperId, ban);
    console.log(`[AdminService] User ${whisperId} banned for ${reason} by ${adminId}`);

    // Log child safety bans with high priority
    if (reason === 'child_safety') {
      console.warn(`[AdminService] ⚠️ CHILD SAFETY BAN: ${whisperId}`);
    }

    return ban;
  }

  // Unban a user
  unbanUser(whisperId: string, adminId: string): boolean {
    if (!this.bannedUsers.has(whisperId)) {
      return false;
    }

    this.bannedUsers.delete(whisperId);
    console.log(`[AdminService] User ${whisperId} unbanned by ${adminId}`);
    return true;
  }

  // Check if a user is banned
  isBanned(whisperId: string): boolean {
    return this.bannedUsers.has(whisperId);
  }

  // Get ban details for a user
  getBanDetails(whisperId: string): BannedUser | null {
    return this.bannedUsers.get(whisperId) || null;
  }

  // Get all banned users
  getAllBannedUsers(): BannedUser[] {
    return Array.from(this.bannedUsers.values());
  }

  // Get bans by reason
  getBansByReason(reason: BannedUser['reason']): BannedUser[] {
    return Array.from(this.bannedUsers.values())
      .filter(ban => ban.reason === reason);
  }

  // Get statistics
  getStats(): {
    total: number;
    childSafety: number;
    harassment: number;
    spam: number;
    other: number;
  } {
    const all = Array.from(this.bannedUsers.values());
    return {
      total: all.length,
      childSafety: all.filter(b => b.reason === 'child_safety').length,
      harassment: all.filter(b => b.reason === 'harassment').length,
      spam: all.filter(b => b.reason === 'spam').length,
      other: all.filter(b => b.reason === 'other' || b.reason === 'terms_violation').length,
    };
  }

  // Export ban data for law enforcement
  exportForLawEnforcement(whisperIds: string[]): object[] {
    return whisperIds
      .map(id => this.bannedUsers.get(id))
      .filter((b): b is BannedUser => b !== null)
      .map(b => ({
        bannedUserId: b.whisperId,
        reason: b.reason,
        bannedAt: new Date(b.bannedAt).toISOString(),
        relatedReportIds: b.relatedReportIds,
        // Note: No message content - E2E encrypted
      }));
  }
}

// Singleton instance
export const adminService = new AdminService();
export default adminService;
