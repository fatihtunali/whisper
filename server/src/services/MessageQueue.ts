import mysql from 'mysql2/promise';
import { PendingMessage } from '../types';

// Time-to-live for pending messages: 72 hours
const MESSAGE_TTL_MS = 72 * 60 * 60 * 1000;

class MessageQueue {
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'whisper',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log('[MessageQueue] MySQL connection pool created');

    // Start cleanup interval
    setInterval(() => this.cleanupExpired(), 60 * 60 * 1000); // Every hour
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

    try {
      await this.pool.execute(
        `INSERT INTO pending_messages (
          message_id, from_whisper_id, to_whisper_id, encrypted_content, nonce,
          sender_public_key, timestamp, encrypted_voice, voice_duration,
          encrypted_image, image_width, image_height, encrypted_file,
          file_name, file_size, file_mime_type, is_forwarded,
          reply_to_message_id, reply_to_content, reply_to_sender_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE timestamp = VALUES(timestamp)`,
        [
          messageId,
          fromWhisperId,
          toWhisperId,
          encryptedContent,
          nonce,
          senderPublicKey || null,
          timestamp,
          media?.encryptedVoice || null,
          media?.voiceDuration || null,
          media?.encryptedImage || null,
          media?.imageMetadata?.width || null,
          media?.imageMetadata?.height || null,
          media?.encryptedFile || null,
          media?.fileMetadata?.name || null,
          media?.fileMetadata?.size || null,
          media?.fileMetadata?.mimeType || null,
          media?.isForwarded || false,
          media?.replyTo?.messageId || null,
          media?.replyTo?.content || null,
          media?.replyTo?.senderId || null,
        ]
      );

      const count = await this.getPendingCount(toWhisperId);
      console.log(`[MessageQueue] Queued message ${messageId} for ${toWhisperId} (${count} pending)`);
    } catch (error) {
      console.error('[MessageQueue] Failed to enqueue message:', error);
    }
  }

  // Get all pending messages for a user
  async getPending(whisperId: string): Promise<PendingMessage[]> {
    const expiryTime = Date.now() - MESSAGE_TTL_MS;

    const [rows] = await this.pool.execute(
      `SELECT * FROM pending_messages
       WHERE to_whisper_id = ? AND timestamp > ?
       ORDER BY timestamp ASC`,
      [whisperId, expiryTime]
    ) as any;

    return rows.map((row: any) => this.rowToMessage(row));
  }

  // Convert database row to PendingMessage
  private rowToMessage(row: any): PendingMessage {
    const message: PendingMessage = {
      id: row.message_id,
      fromWhisperId: row.from_whisper_id,
      toWhisperId: row.to_whisper_id,
      encryptedContent: row.encrypted_content,
      nonce: row.nonce,
      timestamp: Number(row.timestamp),
      expiresAt: Number(row.timestamp) + MESSAGE_TTL_MS,
      senderPublicKey: row.sender_public_key || undefined,
    };

    // Add media attachments if present
    if (row.encrypted_voice) {
      message.encryptedVoice = row.encrypted_voice;
    }
    if (row.voice_duration) {
      message.voiceDuration = row.voice_duration;
    }
    if (row.encrypted_image) {
      message.encryptedImage = row.encrypted_image;
    }
    if (row.image_width && row.image_height) {
      message.imageMetadata = { width: row.image_width, height: row.image_height };
    }
    if (row.encrypted_file) {
      message.encryptedFile = row.encrypted_file;
    }
    if (row.file_name) {
      message.fileMetadata = {
        name: row.file_name,
        size: Number(row.file_size),
        mimeType: row.file_mime_type,
      };
    }
    if (row.is_forwarded) {
      message.isForwarded = true;
    }
    if (row.reply_to_message_id) {
      message.replyTo = {
        messageId: row.reply_to_message_id,
        content: row.reply_to_content,
        senderId: row.reply_to_sender_id,
      };
    }

    return message;
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
    const [result] = await this.pool.execute(
      'DELETE FROM pending_messages WHERE to_whisper_id = ?',
      [whisperId]
    ) as any;

    const count = result.affectedRows;
    if (count > 0) {
      console.log(`[MessageQueue] Cleared ${count} pending messages for ${whisperId}`);
    }
    return count;
  }

  // Remove a specific message from the queue
  async removeMessage(toWhisperId: string, messageId: string): Promise<boolean> {
    const [result] = await this.pool.execute(
      'DELETE FROM pending_messages WHERE to_whisper_id = ? AND message_id = ?',
      [toWhisperId, messageId]
    ) as any;

    return result.affectedRows > 0;
  }

  // Get count of pending messages for a user
  async getPendingCount(whisperId: string): Promise<number> {
    const expiryTime = Date.now() - MESSAGE_TTL_MS;

    const [rows] = await this.pool.execute(
      'SELECT COUNT(*) as count FROM pending_messages WHERE to_whisper_id = ? AND timestamp > ?',
      [whisperId, expiryTime]
    ) as any;

    return rows[0].count;
  }

  // Get total messages in queue
  async getTotalCount(): Promise<number> {
    const expiryTime = Date.now() - MESSAGE_TTL_MS;

    const [rows] = await this.pool.execute(
      'SELECT COUNT(*) as count FROM pending_messages WHERE timestamp > ?',
      [expiryTime]
    ) as any;

    return rows[0].count;
  }

  // Clean up expired messages
  async cleanupExpired(): Promise<number> {
    const expiryTime = Date.now() - MESSAGE_TTL_MS;

    const [result] = await this.pool.execute(
      'DELETE FROM pending_messages WHERE timestamp < ?',
      [expiryTime]
    ) as any;

    if (result.affectedRows > 0) {
      console.log(`[MessageQueue] Cleaned ${result.affectedRows} expired messages`);
    }

    return result.affectedRows;
  }

  // Get queue statistics
  async getStats(): Promise<{ users: number; messages: number }> {
    const expiryTime = Date.now() - MESSAGE_TTL_MS;

    const [userRows] = await this.pool.execute(
      'SELECT COUNT(DISTINCT to_whisper_id) as count FROM pending_messages WHERE timestamp > ?',
      [expiryTime]
    ) as any;

    const [msgRows] = await this.pool.execute(
      'SELECT COUNT(*) as count FROM pending_messages WHERE timestamp > ?',
      [expiryTime]
    ) as any;

    return {
      users: userRows[0].count,
      messages: msgRows[0].count,
    };
  }
}

// Singleton instance
export const messageQueue = new MessageQueue();
export default messageQueue;
