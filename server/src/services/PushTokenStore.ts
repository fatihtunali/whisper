import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class PushTokenStore {
  private pool: mysql.Pool;
  private initialized: boolean = false;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'whisper',
      waitForConnections: true,
      connectionLimit: 50,
      queueLimit: 0,
    });
    console.log('[PushTokenStore] MySQL connection pool created');
  }

  // Initialize the table if it doesn't exist
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS push_tokens (
          whisper_id VARCHAR(20) PRIMARY KEY,
          push_token VARCHAR(255) NOT NULL,
          voip_token VARCHAR(255) DEFAULT NULL,
          platform VARCHAR(20) DEFAULT 'unknown',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add voip_token column if it doesn't exist (for existing tables)
      try {
        await this.pool.execute(`
          ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS voip_token VARCHAR(255) DEFAULT NULL
        `);
      } catch (e) {
        // Column might already exist, ignore error
      }

      this.initialized = true;
      console.log('[PushTokenStore] Table initialized');
    } catch (error) {
      console.error('[PushTokenStore] Failed to initialize table:', error);
      throw error;
    }
  }

  // Store or update a push token
  async store(whisperId: string, pushToken: string, platform: string = 'unknown'): Promise<void> {
    try {
      await this.pool.execute(
        `INSERT INTO push_tokens (whisper_id, push_token, platform)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE push_token = ?, platform = ?, updated_at = CURRENT_TIMESTAMP`,
        [whisperId, pushToken, platform, pushToken, platform]
      );
      console.log(`[PushTokenStore] Stored token for ${whisperId}`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to store token:', error);
    }
  }

  // Get push token for a user
  async get(whisperId: string): Promise<string | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT push_token FROM push_tokens WHERE whisper_id = ?',
        [whisperId]
      );
      const results = rows as Array<{ push_token: string }>;
      return results.length > 0 ? results[0].push_token : null;
    } catch (error) {
      console.error('[PushTokenStore] Failed to get token:', error);
      return null;
    }
  }

  // Get all push tokens (for loading into memory on startup)
  async getAll(): Promise<Map<string, string>> {
    const tokens = new Map<string, string>();
    try {
      const [rows] = await this.pool.execute('SELECT whisper_id, push_token FROM push_tokens');
      const results = rows as Array<{ whisper_id: string; push_token: string }>;
      for (const row of results) {
        tokens.set(row.whisper_id, row.push_token);
      }
      console.log(`[PushTokenStore] Loaded ${tokens.size} push tokens from database`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to load tokens:', error);
    }
    return tokens;
  }

  // Remove a push token
  async remove(whisperId: string): Promise<void> {
    try {
      await this.pool.execute('DELETE FROM push_tokens WHERE whisper_id = ?', [whisperId]);
      console.log(`[PushTokenStore] Removed token for ${whisperId}`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to remove token:', error);
    }
  }

  // Check if a user has a push token
  async exists(whisperId: string): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT 1 FROM push_tokens WHERE whisper_id = ? LIMIT 1',
        [whisperId]
      );
      return (rows as Array<unknown>).length > 0;
    } catch (error) {
      console.error('[PushTokenStore] Failed to check existence:', error);
      return false;
    }
  }

  // Store or update a VoIP token (iOS only)
  async storeVoIPToken(whisperId: string, voipToken: string): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE push_tokens SET voip_token = ?, updated_at = CURRENT_TIMESTAMP WHERE whisper_id = ?`,
        [voipToken, whisperId]
      );
      console.log(`[PushTokenStore] Stored VoIP token for ${whisperId}`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to store VoIP token:', error);
    }
  }

  // Get VoIP token for a user
  async getVoIPToken(whisperId: string): Promise<string | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT voip_token FROM push_tokens WHERE whisper_id = ?',
        [whisperId]
      );
      const results = rows as Array<{ voip_token: string | null }>;
      return results.length > 0 ? results[0].voip_token : null;
    } catch (error) {
      console.error('[PushTokenStore] Failed to get VoIP token:', error);
      return null;
    }
  }

  // Get all VoIP tokens (for loading into memory on startup)
  async getAllVoIPTokens(): Promise<Map<string, string>> {
    const tokens = new Map<string, string>();
    try {
      const [rows] = await this.pool.execute(
        'SELECT whisper_id, voip_token FROM push_tokens WHERE voip_token IS NOT NULL'
      );
      const results = rows as Array<{ whisper_id: string; voip_token: string }>;
      for (const row of results) {
        if (row.voip_token) {
          tokens.set(row.whisper_id, row.voip_token);
        }
      }
      console.log(`[PushTokenStore] Loaded ${tokens.size} VoIP tokens from database`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to load VoIP tokens:', error);
    }
    return tokens;
  }

  // Get count of stored tokens
  async getCount(): Promise<number> {
    try {
      const [rows] = await this.pool.execute('SELECT COUNT(*) as count FROM push_tokens');
      const results = rows as Array<{ count: number }>;
      return results[0].count;
    } catch (error) {
      console.error('[PushTokenStore] Failed to get count:', error);
      return 0;
    }
  }
}

// Singleton instance
export const pushTokenStore = new PushTokenStore();
export default pushTokenStore;
