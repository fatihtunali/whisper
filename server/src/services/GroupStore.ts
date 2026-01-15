/**
 * GroupStore - Redis persistent storage for group metadata
 *
 * Stores ONLY minimal data needed to maintain groups:
 * - groupId, name, createdBy, members[], createdAt
 *
 * NO message content is stored - privacy preserved
 */

import { redisService } from './RedisService';

interface StoredGroup {
  groupId: string;
  name: string;
  createdBy: string;
  members: string[];
  createdAt: number;
}

interface PendingGroupInvite {
  groupId: string;
  name: string;
  createdBy: string;
  members: string[];
  createdAt: number;
}

// Redis key prefixes for groups
const GROUP_KEYS = {
  GROUP_DATA: 'whisper:group:',        // whisper:group:{groupId} -> JSON group metadata
  GROUP_MEMBERS: 'whisper:gmembers:',  // whisper:gmembers:{groupId} -> set of member IDs
  USER_GROUPS: 'whisper:ugroups:',     // whisper:ugroups:{whisperId} -> set of group IDs
  PENDING_INVITE: 'whisper:ginvite:',  // whisper:ginvite:{whisperId}:{groupId} -> JSON invite
  USER_INVITES: 'whisper:uinvites:',   // whisper:uinvites:{whisperId} -> set of group IDs
};

class GroupStore {
  constructor() {
    // Redis is initialized by ConnectionManager
  }

  // Create a new group
  async createGroup(groupId: string, name: string, createdBy: string, members: string[]): Promise<void> {
    const createdAt = Date.now();
    const allMembers = [createdBy, ...members.filter(m => m !== createdBy)];

    const groupData = {
      groupId,
      name,
      createdBy,
      createdAt,
    };

    try {
      // Store group metadata
      await redisService.setGroupData(groupId, JSON.stringify(groupData));

      // Add all members to group's member set
      for (const memberId of allMembers) {
        await redisService.addGroupMember(groupId, memberId);
        await redisService.addUserGroup(memberId, groupId);
      }

      console.log(`[GroupStore] Created group ${groupId} with ${allMembers.length} members`);
    } catch (error) {
      console.error('[GroupStore] Failed to create group:', error);
      throw error;
    }
  }

  // Get a group with members
  async getGroup(groupId: string): Promise<StoredGroup | null> {
    try {
      const data = await redisService.getGroupData(groupId);
      if (!data) return null;

      const groupData = JSON.parse(data);
      const members = await redisService.getGroupMembers(groupId);

      return {
        groupId: groupData.groupId,
        name: groupData.name,
        createdBy: groupData.createdBy,
        members,
        createdAt: groupData.createdAt,
      };
    } catch (error) {
      console.error('[GroupStore] Failed to get group:', error);
      return null;
    }
  }

  // Get all groups for a user
  async getGroupsForUser(whisperId: string): Promise<StoredGroup[]> {
    try {
      const groupIds = await redisService.getUserGroups(whisperId);
      const groups: StoredGroup[] = [];

      for (const groupId of groupIds) {
        const group = await this.getGroup(groupId);
        if (group) {
          groups.push(group);
        }
      }

      return groups;
    } catch (error) {
      console.error('[GroupStore] Failed to get groups for user:', error);
      return [];
    }
  }

  // Check if group exists
  async exists(groupId: string): Promise<boolean> {
    try {
      return await redisService.groupExists(groupId);
    } catch (error) {
      console.error('[GroupStore] Failed to check group existence:', error);
      return false;
    }
  }

  // Check if user is member
  async isMember(groupId: string, whisperId: string): Promise<boolean> {
    try {
      return await redisService.isGroupMember(groupId, whisperId);
    } catch (error) {
      console.error('[GroupStore] Failed to check membership:', error);
      return false;
    }
  }

  // Check if user is creator
  async isCreator(groupId: string, whisperId: string): Promise<boolean> {
    try {
      const data = await redisService.getGroupData(groupId);
      if (!data) return false;
      const groupData = JSON.parse(data);
      return groupData.createdBy === whisperId;
    } catch (error) {
      console.error('[GroupStore] Failed to check creator:', error);
      return false;
    }
  }

  // Get members
  async getMembers(groupId: string): Promise<string[]> {
    try {
      return await redisService.getGroupMembers(groupId);
    } catch (error) {
      console.error('[GroupStore] Failed to get members:', error);
      return [];
    }
  }

  // Add members to group
  async addMembers(groupId: string, newMembers: string[]): Promise<boolean> {
    try {
      const exists = await this.exists(groupId);
      if (!exists) return false;

      for (const memberId of newMembers) {
        await redisService.addGroupMember(groupId, memberId);
        await redisService.addUserGroup(memberId, groupId);
      }

      return true;
    } catch (error) {
      console.error('[GroupStore] Failed to add members:', error);
      return false;
    }
  }

  // Remove member from group
  async removeMember(groupId: string, whisperId: string): Promise<boolean> {
    try {
      const isCreator = await this.isCreator(groupId, whisperId);

      if (isCreator) {
        // Delete entire group
        await this.deleteGroup(groupId);
        console.log(`[GroupStore] Deleted group ${groupId} (creator left)`);
        return true;
      }

      // Just remove the member
      await redisService.removeGroupMember(groupId, whisperId);
      await redisService.removeUserGroup(whisperId, groupId);
      return true;
    } catch (error) {
      console.error('[GroupStore] Failed to remove member:', error);
      return false;
    }
  }

  // Update group name
  async updateGroupName(groupId: string, name: string): Promise<boolean> {
    try {
      const data = await redisService.getGroupData(groupId);
      if (!data) return false;

      const groupData = JSON.parse(data);
      groupData.name = name;
      await redisService.setGroupData(groupId, JSON.stringify(groupData));
      return true;
    } catch (error) {
      console.error('[GroupStore] Failed to update group name:', error);
      return false;
    }
  }

  // Delete group
  async deleteGroup(groupId: string): Promise<void> {
    try {
      // Get all members first
      const members = await redisService.getGroupMembers(groupId);

      // Remove group from all members' group lists
      for (const memberId of members) {
        await redisService.removeUserGroup(memberId, groupId);
      }

      // Delete group data and members set
      await redisService.deleteGroupData(groupId);
      await redisService.deleteGroupMembers(groupId);
    } catch (error) {
      console.error('[GroupStore] Failed to delete group:', error);
    }
  }

  // Queue pending invite for offline user
  async queueInvite(whisperId: string, invite: PendingGroupInvite): Promise<void> {
    try {
      await redisService.setPendingInvite(whisperId, invite.groupId, JSON.stringify(invite));
      console.log(`[GroupStore] Queued invite for ${whisperId} to group ${invite.groupId}`);
    } catch (error) {
      console.error('[GroupStore] Failed to queue invite:', error);
    }
  }

  // Get and clear pending invites for user
  async getPendingInvites(whisperId: string): Promise<PendingGroupInvite[]> {
    try {
      const invites = await redisService.getPendingInvites(whisperId);

      // Clear after fetching
      if (invites.length > 0) {
        await redisService.clearPendingInvites(whisperId);
      }

      return invites.map(data => JSON.parse(data));
    } catch (error) {
      console.error('[GroupStore] Failed to get pending invites:', error);
      return [];
    }
  }

  // Clear all groups where user is a member (for account deletion)
  async clearUserGroups(whisperId: string): Promise<void> {
    try {
      const groupIds = await redisService.getUserGroups(whisperId);

      for (const groupId of groupIds) {
        const isCreator = await this.isCreator(groupId, whisperId);
        if (isCreator) {
          // Delete groups created by user
          await this.deleteGroup(groupId);
        } else {
          // Just remove from member list
          await redisService.removeGroupMember(groupId, whisperId);
        }
      }

      // Clear user's group list
      await redisService.clearUserGroups(whisperId);
      console.log(`[GroupStore] Cleared groups for user ${whisperId}`);
    } catch (error) {
      console.error('[GroupStore] Failed to clear user groups:', error);
    }
  }

  // Get stats
  async getStats(): Promise<{ totalGroups: number }> {
    try {
      const count = await redisService.getGroupCount();
      return { totalGroups: count };
    } catch (error) {
      console.error('[GroupStore] Failed to get stats:', error);
      return { totalGroups: 0 };
    }
  }
}

// Singleton
export const groupStore = new GroupStore();
export default groupStore;
