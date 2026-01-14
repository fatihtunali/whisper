/**
 * GroupStore - MySQL persistent storage for group metadata
 *
 * Stores ONLY minimal data needed to maintain groups:
 * - groupId, name, createdBy, members[], createdAt
 *
 * NO message content is stored - privacy preserved
 */

import mysql from 'mysql2/promise';

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

class GroupStore {
  private pool: mysql.Pool | null = null;

  // Lazy initialization of the pool
  private getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'whisper',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      console.log('[GroupStore] MySQL connection pool created');
    }
    return this.pool;
  }

  constructor() {
    // Pool is now lazily initialized
  }

  // Create a new group
  async createGroup(groupId: string, name: string, createdBy: string, members: string[]): Promise<void> {
    const connection = await this.getPool().getConnection();
    const createdAt = Date.now();

    try {
      await connection.beginTransaction();

      // Insert group
      await connection.execute(
        'INSERT INTO chat_groups (group_id, name, created_by, created_at) VALUES (?, ?, ?, ?)',
        [groupId, name, createdBy, createdAt]
      );

      // Insert all members (including creator)
      const allMembers = [createdBy, ...members.filter(m => m !== createdBy)];
      for (const memberId of allMembers) {
        await connection.execute(
          'INSERT INTO group_members (group_id, whisper_id, joined_at) VALUES (?, ?, ?)',
          [groupId, memberId, createdAt]
        );
      }

      await connection.commit();
      console.log(`[GroupStore] Created group ${groupId} with ${allMembers.length} members`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get a group with members
  async getGroup(groupId: string): Promise<StoredGroup | null> {
    const [rows] = await this.getPool().execute(
      'SELECT g.group_id, g.name, g.created_by, g.created_at FROM chat_groups g WHERE g.group_id = ?',
      [groupId]
    ) as any;

    if (rows.length === 0) return null;

    const group = rows[0];

    // Get members
    const [memberRows] = await this.getPool().execute(
      'SELECT whisper_id FROM group_members WHERE group_id = ?',
      [groupId]
    ) as any;

    return {
      groupId: group.group_id,
      name: group.name,
      createdBy: group.created_by,
      members: memberRows.map((m: any) => m.whisper_id),
      createdAt: Number(group.created_at),
    };
  }

  // Get all groups for a user
  async getGroupsForUser(whisperId: string): Promise<StoredGroup[]> {
    const [rows] = await this.getPool().execute(
      `SELECT g.group_id, g.name, g.created_by, g.created_at
       FROM chat_groups g
       INNER JOIN group_members gm ON g.group_id = gm.group_id
       WHERE gm.whisper_id = ?`,
      [whisperId]
    ) as any;

    const groups: StoredGroup[] = [];
    for (const row of rows) {
      const [memberRows] = await this.getPool().execute(
        'SELECT whisper_id FROM group_members WHERE group_id = ?',
        [row.group_id]
      ) as any;

      groups.push({
        groupId: row.group_id,
        name: row.name,
        createdBy: row.created_by,
        members: memberRows.map((m: any) => m.whisper_id),
        createdAt: Number(row.created_at),
      });
    }

    return groups;
  }

  // Check if group exists
  async exists(groupId: string): Promise<boolean> {
    const [rows] = await this.getPool().execute(
      'SELECT 1 FROM chat_groups WHERE group_id = ?',
      [groupId]
    ) as any;
    return rows.length > 0;
  }

  // Check if user is member
  async isMember(groupId: string, whisperId: string): Promise<boolean> {
    const [rows] = await this.getPool().execute(
      'SELECT 1 FROM group_members WHERE group_id = ? AND whisper_id = ?',
      [groupId, whisperId]
    ) as any;
    return rows.length > 0;
  }

  // Check if user is creator
  async isCreator(groupId: string, whisperId: string): Promise<boolean> {
    const [rows] = await this.getPool().execute(
      'SELECT 1 FROM chat_groups WHERE group_id = ? AND created_by = ?',
      [groupId, whisperId]
    ) as any;
    return rows.length > 0;
  }

  // Get members
  async getMembers(groupId: string): Promise<string[]> {
    const [rows] = await this.getPool().execute(
      'SELECT whisper_id FROM group_members WHERE group_id = ?',
      [groupId]
    ) as any;
    return rows.map((r: any) => r.whisper_id);
  }

  // Add members to group
  async addMembers(groupId: string, newMembers: string[]): Promise<boolean> {
    const exists = await this.exists(groupId);
    if (!exists) return false;

    const joinedAt = Date.now();
    for (const memberId of newMembers) {
      try {
        await this.getPool().execute(
          'INSERT IGNORE INTO group_members (group_id, whisper_id, joined_at) VALUES (?, ?, ?)',
          [groupId, memberId, joinedAt]
        );
      } catch (error) {
        console.error(`[GroupStore] Failed to add member ${memberId}:`, error);
      }
    }

    return true;
  }

  // Remove member from group
  async removeMember(groupId: string, whisperId: string): Promise<boolean> {
    // Check if user is creator
    const isCreator = await this.isCreator(groupId, whisperId);
    if (isCreator) {
      // Delete entire group
      await this.getPool().execute('DELETE FROM chat_groups WHERE group_id = ?', [groupId]);
      console.log(`[GroupStore] Deleted group ${groupId} (creator left)`);
      return true;
    }

    await this.getPool().execute(
      'DELETE FROM group_members WHERE group_id = ? AND whisper_id = ?',
      [groupId, whisperId]
    );
    return true;
  }

  // Update group name
  async updateGroupName(groupId: string, name: string): Promise<boolean> {
    const [result] = await this.getPool().execute(
      'UPDATE chat_groups SET name = ? WHERE group_id = ?',
      [name, groupId]
    ) as any;
    return result.affectedRows > 0;
  }

  // Delete group
  async deleteGroup(groupId: string): Promise<void> {
    await this.getPool().execute('DELETE FROM chat_groups WHERE group_id = ?', [groupId]);
  }

  // Queue pending invite for offline user
  async queueInvite(whisperId: string, invite: PendingGroupInvite): Promise<void> {
    try {
      await this.getPool().execute(
        `INSERT INTO pending_group_invites
         (whisper_id, group_id, name, created_by, members, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), members = VALUES(members)`,
        [
          whisperId,
          invite.groupId,
          invite.name,
          invite.createdBy,
          JSON.stringify(invite.members),
          invite.createdAt,
        ]
      );
      console.log(`[GroupStore] Queued invite for ${whisperId} to group ${invite.groupId}`);
    } catch (error) {
      console.error('[GroupStore] Failed to queue invite:', error);
    }
  }

  // Get and clear pending invites for user
  async getPendingInvites(whisperId: string): Promise<PendingGroupInvite[]> {
    const [rows] = await this.getPool().execute(
      'SELECT group_id, name, created_by, members, created_at FROM pending_group_invites WHERE whisper_id = ?',
      [whisperId]
    ) as any;

    if (rows.length > 0) {
      // Clear after fetching
      await this.getPool().execute('DELETE FROM pending_group_invites WHERE whisper_id = ?', [whisperId]);
    }

    return rows.map((r: any) => ({
      groupId: r.group_id,
      name: r.name,
      createdBy: r.created_by,
      members: JSON.parse(r.members),
      createdAt: Number(r.created_at),
    }));
  }

  // Clear all groups where user is a member (for account deletion)
  async clearUserGroups(whisperId: string): Promise<void> {
    // Get groups created by user and delete them
    const [createdGroups] = await this.getPool().execute(
      'SELECT group_id FROM chat_groups WHERE created_by = ?',
      [whisperId]
    ) as any;

    for (const row of createdGroups) {
      await this.getPool().execute('DELETE FROM chat_groups WHERE group_id = ?', [row.group_id]);
    }

    // Remove user from all groups they're a member of
    await this.getPool().execute(
      'DELETE FROM group_members WHERE whisper_id = ?',
      [whisperId]
    );

    console.log(`[GroupStore] Cleared groups for user ${whisperId}`);
  }

  // Get stats
  async getStats(): Promise<{ totalGroups: number }> {
    const [rows] = await this.getPool().execute('SELECT COUNT(*) as count FROM chat_groups') as any;
    return {
      totalGroups: rows[0].count,
    };
  }
}

// Singleton
export const groupStore = new GroupStore();
export default groupStore;
