/**
 * PushTokenStore - Redis-based push token storage
 *
 * Stores push tokens and VoIP tokens in Redis for fast access
 * Tokens persist indefinitely (no TTL) until explicitly removed
 */

import { redisService } from './RedisService';

class PushTokenStore {
  private initialized: boolean = false;
  // In-memory cache for fast lookups
  private pushTokens: Map<string, string> = new Map();
  private voipTokens: Map<string, string> = new Map();
  private platforms: Map<string, string> = new Map();

  // Initialize - Redis is already initialized by ConnectionManager
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load existing tokens from Redis into memory cache
    await this.loadAllTokens();

    this.initialized = true;
    console.log('[PushTokenStore] Initialized with Redis');
  }

  // Load all tokens from Redis into memory
  private async loadAllTokens(): Promise<void> {
    try {
      const pushTokens = await redisService.getAllPushTokens();
      const voipTokens = await redisService.getAllVoIPTokens();

      this.pushTokens = pushTokens;
      this.voipTokens = voipTokens;

      console.log(`[PushTokenStore] Loaded ${pushTokens.size} push tokens, ${voipTokens.size} VoIP tokens from Redis`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to load tokens from Redis:', error);
    }
  }

  // Store or update a push token
  async store(whisperId: string, pushToken: string, platform: string = 'unknown'): Promise<void> {
    try {
      await redisService.setPushToken(whisperId, pushToken);
      this.pushTokens.set(whisperId, pushToken);
      this.platforms.set(whisperId, platform);
      console.log(`[PushTokenStore] Stored push token for ${whisperId}`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to store token:', error);
    }
  }

  // Get push token for a user
  async get(whisperId: string): Promise<string | null> {
    // Check memory cache first
    const cached = this.pushTokens.get(whisperId);
    if (cached) return cached;

    // Fallback to Redis
    try {
      const token = await redisService.getPushToken(whisperId);
      if (token) {
        this.pushTokens.set(whisperId, token);
      }
      return token;
    } catch (error) {
      console.error('[PushTokenStore] Failed to get token:', error);
      return null;
    }
  }

  // Get all push tokens
  async getAll(): Promise<Map<string, string>> {
    return this.pushTokens;
  }

  // Remove a push token
  async remove(whisperId: string): Promise<void> {
    try {
      await redisService.removePushToken(whisperId);
      this.pushTokens.delete(whisperId);
      this.voipTokens.delete(whisperId);
      console.log(`[PushTokenStore] Removed tokens for ${whisperId}`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to remove token:', error);
    }
  }

  // Check if a user has a push token
  async exists(whisperId: string): Promise<boolean> {
    if (this.pushTokens.has(whisperId)) return true;
    const token = await this.get(whisperId);
    return token !== null;
  }

  // Store or update a VoIP token (iOS only)
  async storeVoIPToken(whisperId: string, voipToken: string): Promise<void> {
    try {
      await redisService.setVoIPToken(whisperId, voipToken);
      this.voipTokens.set(whisperId, voipToken);
      console.log(`[PushTokenStore] Stored VoIP token for ${whisperId}`);
    } catch (error) {
      console.error('[PushTokenStore] Failed to store VoIP token:', error);
    }
  }

  // Get VoIP token for a user
  async getVoIPToken(whisperId: string): Promise<string | null> {
    // Check memory cache first
    const cached = this.voipTokens.get(whisperId);
    if (cached) return cached;

    // Fallback to Redis
    try {
      const token = await redisService.getVoIPToken(whisperId);
      if (token) {
        this.voipTokens.set(whisperId, token);
      }
      return token;
    } catch (error) {
      console.error('[PushTokenStore] Failed to get VoIP token:', error);
      return null;
    }
  }

  // Get all VoIP tokens
  async getAllVoIPTokens(): Promise<Map<string, string>> {
    return this.voipTokens;
  }

  // Get count of stored tokens
  async getCount(): Promise<number> {
    return this.pushTokens.size;
  }
}

// Singleton instance
export const pushTokenStore = new PushTokenStore();
export default pushTokenStore;
