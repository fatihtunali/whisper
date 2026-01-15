import { WebSocket } from 'ws';
import { ConnectedClient, PrivacyPrefs } from '../types';
import { publicKeyStore } from '../services/PublicKeyStore';
import { pushTokenStore } from '../services/PushTokenStore';
import { redisService } from '../services/RedisService';

class ConnectionManager {
  // In-memory map for WebSocket references (can't be stored in Redis)
  private clients: Map<string, ConnectedClient> = new Map();
  // Socket ID to Whisper ID mapping for quick lookup
  private socketToUser: Map<WebSocket, string> = new Map();
  private initialized: boolean = false;
  private useRedis: boolean = false;

  // Initialize - connect to Redis and load data
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize push token store (MySQL fallback)
      await pushTokenStore.initialize();

      // Try to connect to Redis
      try {
        await redisService.initialize();
        this.useRedis = redisService.isReady();
        if (this.useRedis) {
          console.log('[ConnectionManager] Redis enabled for presence management');
        }
      } catch (redisError) {
        console.warn('[ConnectionManager] Redis not available, using in-memory only:', redisError);
        this.useRedis = false;
      }

      this.initialized = true;
      console.log(`[ConnectionManager] Initialized (Redis: ${this.useRedis ? 'enabled' : 'disabled'})`);
    } catch (error) {
      console.error('[ConnectionManager] Failed to initialize:', error);
    }
  }

  // Generate a unique socket ID
  private generateSocketId(): string {
    return `socket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Register a new client connection
  async register(
    whisperId: string,
    publicKey: string,
    signingPublicKey: string,
    socket: WebSocket,
    pushToken?: string,
    prefs?: PrivacyPrefs,
    voipToken?: string,
    platform?: string
  ): Promise<void> {
    const socketId = this.generateSocketId();

    // If client already connected, close old connection
    const existing = this.clients.get(whisperId);
    if (existing && existing.socket !== socket) {
      console.log(`[ConnectionManager] Closing old connection for ${whisperId}`);
      this.socketToUser.delete(existing.socket);
      existing.socket.close(1000, 'New connection established');
    }

    const client: ConnectedClient = {
      whisperId,
      publicKey,
      signingPublicKey,
      socket,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      pushToken,
      prefs,
    };

    // Store in memory (for WebSocket access)
    this.clients.set(whisperId, client);
    this.socketToUser.set(socket, whisperId);

    // Store in Redis (for fast presence lookups and multi-instance support)
    if (this.useRedis) {
      await redisService.setOnline(whisperId, socketId, 300); // 5 min TTL

      // Cache tokens in Redis
      if (pushToken) {
        await redisService.setPushToken(whisperId, pushToken);
      }
      if (voipToken) {
        await redisService.setVoIPToken(whisperId, voipToken);
      }
      // Cache public key
      await redisService.setPublicKey(whisperId, publicKey);
    }

    // Store public keys persistently in MySQL
    publicKeyStore.store(whisperId, publicKey, signingPublicKey);

    // Store push token in MySQL (persistent backup)
    if (pushToken) {
      pushTokenStore.store(whisperId, pushToken, platform || 'unknown').catch(err =>
        console.error(`[ConnectionManager] Failed to persist push token:`, err)
      );
    }

    // Store VoIP token in MySQL
    if (voipToken) {
      pushTokenStore.storeVoIPToken(whisperId, voipToken).catch(err =>
        console.error(`[ConnectionManager] Failed to persist VoIP token:`, err)
      );
    }

    const hidden = prefs?.hideOnlineStatus ? ' [hidden]' : '';
    console.log(`[ConnectionManager] Registered: ${whisperId} (${this.clients.size} total)${hidden}`);
  }

  // Remove a client connection
  async unregister(whisperId: string): Promise<void> {
    const client = this.clients.get(whisperId);
    if (client) {
      this.socketToUser.delete(client.socket);
      this.clients.delete(whisperId);

      // Remove from Redis
      if (this.useRedis) {
        await redisService.setOffline(whisperId, '');
      }

      console.log(`[ConnectionManager] Unregistered: ${whisperId} (${this.clients.size} total)`);
    }
  }

  // Remove by socket reference (for disconnect events)
  async unregisterBySocket(socket: WebSocket): Promise<string | null> {
    const whisperId = this.socketToUser.get(socket);
    if (whisperId) {
      this.socketToUser.delete(socket);
      this.clients.delete(whisperId);

      // Remove from Redis
      if (this.useRedis) {
        await redisService.setOffline(whisperId, '');
      }

      console.log(`[ConnectionManager] Unregistered by socket: ${whisperId} (${this.clients.size} total)`);
      return whisperId;
    }
    return null;
  }

  // Get a client by Whisper ID
  get(whisperId: string): ConnectedClient | undefined {
    return this.clients.get(whisperId);
  }

  // Check if a client is online (local instance)
  isOnline(whisperId: string): boolean {
    const client = this.clients.get(whisperId);
    if (!client) return false;
    return client.socket.readyState === WebSocket.OPEN;
  }

  // Check if user is online anywhere (Redis - multi-instance support)
  async isOnlineGlobal(whisperId: string): Promise<boolean> {
    // First check local
    if (this.isOnline(whisperId)) return true;

    // Then check Redis
    if (this.useRedis) {
      return redisService.isOnline(whisperId);
    }

    return false;
  }

  // Check if a client appears online (respects hideOnlineStatus setting)
  appearsOnline(whisperId: string): boolean {
    const client = this.clients.get(whisperId);
    if (!client) return false;
    if (client.prefs?.hideOnlineStatus) return false;
    return client.socket.readyState === WebSocket.OPEN;
  }

  // Check if a client has hidden their online status
  isOnlineStatusHidden(whisperId: string): boolean {
    const client = this.clients.get(whisperId);
    if (!client) return false;
    return client.prefs?.hideOnlineStatus === true;
  }

  // Get socket for a client
  getSocket(whisperId: string): WebSocket | null {
    const client = this.clients.get(whisperId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return null;
    }
    return client.socket;
  }

  // Update last ping time and refresh Redis TTL
  async updatePing(whisperId: string): Promise<void> {
    const client = this.clients.get(whisperId);
    if (client) {
      client.lastPing = Date.now();

      // Refresh Redis TTL
      if (this.useRedis) {
        await redisService.refreshPresence(whisperId, '', 300);
      }
    }
  }

  // Get client by socket
  getBySocket(socket: WebSocket): ConnectedClient | null {
    const whisperId = this.socketToUser.get(socket);
    if (whisperId) {
      return this.clients.get(whisperId) || null;
    }
    return null;
  }

  // Get total connected clients count (local instance)
  getCount(): number {
    return this.clients.size;
  }

  // Get total online count (global - from Redis)
  async getGlobalCount(): Promise<number> {
    if (this.useRedis) {
      return redisService.getOnlineCount();
    }
    return this.clients.size;
  }

  // Get all connected Whisper IDs
  getAllIds(): string[] {
    return Array.from(this.clients.keys());
  }

  // Get push token for a user (check Redis first, then MySQL)
  async getPushToken(whisperId: string): Promise<string | null> {
    // Check online client first
    const client = this.clients.get(whisperId);
    if (client?.pushToken) {
      return client.pushToken;
    }

    // Check Redis cache
    if (this.useRedis) {
      const token = await redisService.getPushToken(whisperId);
      if (token) return token;
    }

    // Fallback to MySQL
    return pushTokenStore.get(whisperId);
  }

  // Get VoIP token for a user
  async getVoIPToken(whisperId: string): Promise<string | null> {
    // Check Redis cache first
    if (this.useRedis) {
      const token = await redisService.getVoIPToken(whisperId);
      if (token) return token;
    }

    // Fallback to MySQL
    return pushTokenStore.getVoIPToken(whisperId);
  }

  // Get public key for a user (works even when offline)
  async getPublicKey(whisperId: string): Promise<string | null> {
    // First check if user is online
    const client = this.clients.get(whisperId);
    if (client) {
      return client.publicKey;
    }

    // Check Redis cache
    if (this.useRedis) {
      const key = await redisService.getPublicKey(whisperId);
      if (key) return key;
    }

    // Fall back to MySQL
    return publicKeyStore.getPublicKey(whisperId);
  }

  // Check if a user exists in the system (has ever connected)
  userExists(whisperId: string): boolean {
    return publicKeyStore.exists(whisperId);
  }

  // Get last seen timestamp
  async getLastSeen(whisperId: string): Promise<number | null> {
    if (this.useRedis) {
      return redisService.getLastSeen(whisperId);
    }
    return null;
  }

  // Clean up stale connections (no ping for 2 minutes)
  async cleanupStale(): Promise<number> {
    const staleThreshold = Date.now() - 2 * 60 * 1000; // 2 minutes
    let cleaned = 0;

    for (const [whisperId, client] of this.clients) {
      if (client.lastPing < staleThreshold) {
        console.log(`[ConnectionManager] Cleaning stale connection: ${whisperId}`);
        client.socket.close(1000, 'Connection timeout');
        this.socketToUser.delete(client.socket);
        this.clients.delete(whisperId);

        // Remove from Redis
        if (this.useRedis) {
          await redisService.setOffline(whisperId, '');
        }

        cleaned++;
      }
    }

    return cleaned;
  }

  // Get Redis status
  isRedisEnabled(): boolean {
    return this.useRedis;
  }

  // Get Redis info
  async getRedisInfo(): Promise<{ connectedClients: number; usedMemory: string } | null> {
    if (this.useRedis) {
      return redisService.getInfo();
    }
    return null;
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
export default connectionManager;
