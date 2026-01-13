/**
 * GroupService - Server-side tracking of group metadata for authorization
 *
 * Tracks:
 * - Group creator (only creator can update group)
 * - Group members (for message routing and authorization)
 */

interface GroupInfo {
  groupId: string;
  createdBy: string;
  members: Set<string>;
  createdAt: number;
}

class GroupService {
  // Map from groupId -> GroupInfo
  private groups: Map<string, GroupInfo> = new Map();

  /**
   * Create a new group
   */
  createGroup(groupId: string, createdBy: string, members: string[]): void {
    const allMembers = new Set([createdBy, ...members]);

    this.groups.set(groupId, {
      groupId,
      createdBy,
      members: allMembers,
      createdAt: Date.now(),
    });

    console.log(`[GroupService] Group ${groupId} created by ${createdBy} with ${allMembers.size} members`);
  }

  /**
   * Get group info
   */
  getGroup(groupId: string): GroupInfo | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Check if a user is the creator of a group
   */
  isCreator(groupId: string, whisperId: string): boolean {
    const group = this.groups.get(groupId);
    return group?.createdBy === whisperId;
  }

  /**
   * Check if a user is a member of a group
   */
  isMember(groupId: string, whisperId: string): boolean {
    const group = this.groups.get(groupId);
    return group?.members.has(whisperId) || false;
  }

  /**
   * Get all members of a group
   */
  getMembers(groupId: string): string[] {
    const group = this.groups.get(groupId);
    return group ? Array.from(group.members) : [];
  }

  /**
   * Add members to a group (only creator should be able to do this)
   */
  addMembers(groupId: string, members: string[]): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    for (const member of members) {
      group.members.add(member);
    }

    console.log(`[GroupService] Added ${members.length} members to group ${groupId}`);
    return true;
  }

  /**
   * Remove members from a group (only creator should be able to do this)
   */
  removeMembers(groupId: string, members: string[]): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    for (const member of members) {
      // Cannot remove the creator
      if (member !== group.createdBy) {
        group.members.delete(member);
      }
    }

    console.log(`[GroupService] Removed members from group ${groupId}`);
    return true;
  }

  /**
   * Remove a member who left voluntarily
   */
  memberLeft(groupId: string, whisperId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    // If creator leaves, delete the entire group
    if (group.createdBy === whisperId) {
      this.groups.delete(groupId);
      console.log(`[GroupService] Group ${groupId} deleted (creator left)`);
      return true;
    }

    group.members.delete(whisperId);
    console.log(`[GroupService] Member ${whisperId} left group ${groupId}`);
    return true;
  }

  /**
   * Clear all groups where a user is a member (used in account deletion)
   */
  clearUserGroups(whisperId: string): void {
    for (const [groupId, group] of this.groups) {
      if (group.createdBy === whisperId) {
        // Delete groups created by this user
        this.groups.delete(groupId);
        console.log(`[GroupService] Group ${groupId} deleted (creator account deleted)`);
      } else if (group.members.has(whisperId)) {
        // Remove from member list
        group.members.delete(whisperId);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): { totalGroups: number; totalMembers: number } {
    let totalMembers = 0;
    for (const group of this.groups.values()) {
      totalMembers += group.members.size;
    }
    return {
      totalGroups: this.groups.size,
      totalMembers,
    };
  }
}

// Singleton instance
export const groupService = new GroupService();
export default groupService;
