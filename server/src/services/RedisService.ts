/**
 * RedisService - High-performance in-memory data store
 *
 * Used for:
 * - Online user presence (instant lookup)
 * - Active WebSocket connections tracking
 * - Pub/Sub for real-time message routing (enables horizontal scaling)
 *
 * Benefits over MySQL for real-time data:
 * - No connection pool limits
 * - 0.1ms vs 1-10ms latency
 * - Built-in pub/sub for multi-instance support
 */

import Redis from 'ioredis';

// Key prefixes for organization
const KEYS = {
  ONLINE: 'whisper:online:',           // whisper:online:{whisperId} -> socketId (active WebSocket)
  SOCKET: 'whisper:socket:',           // whisper:socket:{socketId} -> whisperId
  REGISTERED: 'whisper:registered:',   // whisper:registered:{whisperId} -> timestamp (installed/registered users)
  PUSH_TOKEN: 'whisper:push:',         // whisper:push:{whisperId} -> pushToken
  VOIP_TOKEN: 'whisper:voip:',         // whisper:voip:{whisperId} -> voipToken
  LAST_SEEN: 'whisper:lastseen:',      // whisper:lastseen:{whisperId} -> timestamp
  PUBLIC_KEY: 'whisper:pubkey:',       // whisper:pubkey:{whisperId} -> publicKey
};

// Pub/Sub channels
const CHANNELS = {
  MESSAGE: 'whisper:messages',         // For routing messages across instances
  CALL: 'whisper:calls',               // For routing call signals
  PRESENCE: 'whisper:presence',        // For presence updates
};

class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private isConnected: boolean = false;

  // Message handlers for pub/sub
  private messageHandler: ((channel: string, message: string) => void) | null = null;

  async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      // Main client for commands
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      // Separate connections for pub/sub (required by Redis)
      this.publisher = new Redis(redisUrl, { lazyConnect: true });
      this.subscriber = new Redis(redisUrl, { lazyConnect: true });

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      this.isConnected = true;
      console.log('[RedisService] Connected to Redis');

      // Set up subscriber
      this.subscriber.on('message', (channel: string, message: string) => {
        if (this.messageHandler) {
          this.messageHandler(channel, message);
        }
      });

      // Subscribe to channels
      await this.subscriber.subscribe(
        CHANNELS.MESSAGE,
        CHANNELS.CALL,
        CHANNELS.PRESENCE
      );
      console.log('[RedisService] Subscribed to channels');

    } catch (error) {
      console.error('[RedisService] Failed to connect:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // Check if connected
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  // Set message handler for pub/sub
  setMessageHandler(handler: (channel: string, message: string) => void): void {
    this.messageHandler = handler;
  }

  // ==================== PRESENCE ====================

  /**
   * Mark user as registered (installed the app)
   * This keeps users "online" for 24 hours after last activity
   * @param whisperId User's Whisper ID
   * @param ttl Time to live in seconds (default 24 hours)
   */
  async setRegistered(whisperId: string, ttl: number = 86400): Promise<void> {
    if (!this.client) return;
    await this.client.setex(KEYS.REGISTERED + whisperId, ttl, Date.now().toString());
  }

  /**
   * Check if user is registered (has been active in last 24 hours)
   */
  async isRegistered(whisperId: string): Promise<boolean> {
    if (!this.client) return false;
    const result = await this.client.exists(KEYS.REGISTERED + whisperId);
    return result === 1;
  }

  /**
   * Get count of all registered users (active in last 24 hours)
   */
  async getRegisteredCount(): Promise<number> {
    if (!this.client) return 0;
    const keys = await this.client.keys(KEYS.REGISTERED + '*');
    return keys.length;
  }

  /**
   * Mark user as online (active WebSocket connection)
   * @param whisperId User's Whisper ID
   * @param socketId WebSocket connection ID
   * @param ttl Time to live in seconds (default 5 minutes, refreshed on activity)
   */
  async setOnline(whisperId: string, socketId: string, ttl: number = 300): Promise<void> {
    if (!this.client) return;

    const pipeline = this.client.pipeline();

    // Set online status with TTL (active WebSocket)
    pipeline.setex(KEYS.ONLINE + whisperId, ttl, socketId);
    // Reverse mapping: socket -> user
    pipeline.setex(KEYS.SOCKET + socketId, ttl, whisperId);
    // Mark as registered with 24h TTL (stays "online" even when app is in background)
    pipeline.setex(KEYS.REGISTERED + whisperId, 86400, Date.now().toString());
    // Update last seen
    pipeline.set(KEYS.LAST_SEEN + whisperId, Date.now().toString());

    await pipeline.exec();

    // Publish presence update
    await this.publish(CHANNELS.PRESENCE, JSON.stringify({
      type: 'online',
      whisperId,
      timestamp: Date.now(),
    }));
  }

  /**
   * Mark user as offline
   */
  async setOffline(whisperId: string, socketId: string): Promise<void> {
    if (!this.client) return;

    const pipeline = this.client.pipeline();
    pipeline.del(KEYS.ONLINE + whisperId);
    pipeline.del(KEYS.SOCKET + socketId);
    pipeline.set(KEYS.LAST_SEEN + whisperId, Date.now().toString());
    await pipeline.exec();

    // Publish presence update
    await this.publish(CHANNELS.PRESENCE, JSON.stringify({
      type: 'offline',
      whisperId,
      timestamp: Date.now(),
    }));
  }

  /**
   * Check if user is online
   */
  async isOnline(whisperId: string): Promise<boolean> {
    if (!this.client) return false;
    const result = await this.client.exists(KEYS.ONLINE + whisperId);
    return result === 1;
  }

  /**
   * Get socket ID for online user
   */
  async getSocketId(whisperId: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(KEYS.ONLINE + whisperId);
  }

  /**
   * Get user ID from socket ID
   */
  async getWhisperIdBySocket(socketId: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(KEYS.SOCKET + socketId);
  }

  /**
   * Refresh TTL for active connection
   */
  async refreshPresence(whisperId: string, socketId: string, ttl: number = 300): Promise<void> {
    if (!this.client) return;

    const pipeline = this.client.pipeline();
    pipeline.expire(KEYS.ONLINE + whisperId, ttl);
    pipeline.expire(KEYS.SOCKET + socketId, ttl);
    await pipeline.exec();
  }

  /**
   * Get all online users count
   */
  async getOnlineCount(): Promise<number> {
    if (!this.client) return 0;
    const keys = await this.client.keys(KEYS.ONLINE + '*');
    return keys.length;
  }

  /**
   * Get last seen timestamp
   */
  async getLastSeen(whisperId: string): Promise<number | null> {
    if (!this.client) return null;
    const result = await this.client.get(KEYS.LAST_SEEN + whisperId);
    return result ? parseInt(result, 10) : null;
  }

  // ==================== TOKENS ====================

  /**
   * Store push token
   */
  async setPushToken(whisperId: string, token: string): Promise<void> {
    if (!this.client) return;
    await this.client.set(KEYS.PUSH_TOKEN + whisperId, token);
  }

  /**
   * Get push token
   */
  async getPushToken(whisperId: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(KEYS.PUSH_TOKEN + whisperId);
  }

  /**
   * Store VoIP token
   */
  async setVoIPToken(whisperId: string, token: string): Promise<void> {
    if (!this.client) return;
    await this.client.set(KEYS.VOIP_TOKEN + whisperId, token);
  }

  /**
   * Get VoIP token
   */
  async getVoIPToken(whisperId: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(KEYS.VOIP_TOKEN + whisperId);
  }

  // ==================== PUBLIC KEYS ====================

  /**
   * Store public key (cache from MySQL)
   */
  async setPublicKey(whisperId: string, publicKey: string, ttl: number = 86400): Promise<void> {
    if (!this.client) return;
    await this.client.setex(KEYS.PUBLIC_KEY + whisperId, ttl, publicKey);
  }

  /**
   * Get public key
   */
  async getPublicKey(whisperId: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(KEYS.PUBLIC_KEY + whisperId);
  }

  // ==================== PUB/SUB ====================

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<void> {
    if (!this.publisher) return;
    await this.publisher.publish(channel, message);
  }

  /**
   * Publish a routed message (for multi-instance support)
   */
  async publishMessage(toWhisperId: string, payload: any): Promise<void> {
    await this.publish(CHANNELS.MESSAGE, JSON.stringify({
      to: toWhisperId,
      payload,
      timestamp: Date.now(),
    }));
  }

  /**
   * Publish call signal
   */
  async publishCall(toWhisperId: string, payload: any): Promise<void> {
    await this.publish(CHANNELS.CALL, JSON.stringify({
      to: toWhisperId,
      payload,
      timestamp: Date.now(),
    }));
  }

  // ==================== UTILITIES ====================

  /**
   * Ping Redis
   */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<{ connectedClients: number; usedMemory: string } | null> {
    if (!this.client) return null;
    try {
      const info = await this.client.info('clients');
      const memInfo = await this.client.info('memory');

      const clientsMatch = info.match(/connected_clients:(\d+)/);
      const memMatch = memInfo.match(/used_memory_human:(\S+)/);

      return {
        connectedClients: clientsMatch ? parseInt(clientsMatch[1], 10) : 0,
        usedMemory: memMatch ? memMatch[1] : '0B',
      };
    } catch {
      return null;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe();
      this.subscriber.disconnect();
    }
    if (this.publisher) {
      this.publisher.disconnect();
    }
    if (this.client) {
      this.client.disconnect();
    }
    this.isConnected = false;
    console.log('[RedisService] Disconnected');
  }
}

// Export channels for external use
export { CHANNELS };

// Singleton instance
export const redisService = new RedisService();
export default redisService;
