/**
 * PublicKeyStore - Redis-based persistent storage for user public keys
 *
 * Stores encryption and signing public keys in Redis
 * Keys persist indefinitely (no TTL) - only removed on account deletion
 */

import { redisService } from './RedisService';

interface StoredKey {
  publicKey: string;
  signingPublicKey: string;
  lastSeen: number;
}

class PublicKeyStore {
  // In-memory cache for fast lookups
  private keys: Map<string, StoredKey> = new Map();

  // Store or update a user's public keys (both memory and Redis)
  async store(whisperId: string, publicKey: string, signingPublicKey: string): Promise<void> {
    // Store in memory cache
    this.keys.set(whisperId, {
      publicKey,
      signingPublicKey,
      lastSeen: Date.now(),
    });

    // Store in Redis for persistence
    try {
      await redisService.setPublicKey(whisperId, publicKey);
      await redisService.setSigningKey(whisperId, signingPublicKey);
      console.log(`[PublicKeyStore] Stored keys for ${whisperId} (${this.keys.size} total users)`);
    } catch (error) {
      console.error(`[PublicKeyStore] Failed to store keys in Redis:`, error);
    }
  }

  // Get a user's public key by Whisper ID
  async getPublicKey(whisperId: string): Promise<string | null> {
    // Check memory cache first
    const stored = this.keys.get(whisperId);
    if (stored?.publicKey) {
      return stored.publicKey;
    }

    // Fallback to Redis
    try {
      const publicKey = await redisService.getPublicKey(whisperId);
      if (publicKey) {
        // Cache it in memory
        const signingKey = await redisService.getSigningKey(whisperId);
        this.keys.set(whisperId, {
          publicKey,
          signingPublicKey: signingKey || '',
          lastSeen: Date.now(),
        });
      }
      return publicKey;
    } catch (error) {
      console.error(`[PublicKeyStore] Failed to get public key from Redis:`, error);
      return null;
    }
  }

  // Get a user's signing public key by Whisper ID
  async getSigningPublicKey(whisperId: string): Promise<string | null> {
    // Check memory cache first
    const stored = this.keys.get(whisperId);
    if (stored?.signingPublicKey) {
      return stored.signingPublicKey;
    }

    // Fallback to Redis
    try {
      const signingKey = await redisService.getSigningKey(whisperId);
      if (signingKey) {
        // Cache it in memory
        const publicKey = await redisService.getPublicKey(whisperId);
        this.keys.set(whisperId, {
          publicKey: publicKey || '',
          signingPublicKey: signingKey,
          lastSeen: Date.now(),
        });
      }
      return signingKey;
    } catch (error) {
      console.error(`[PublicKeyStore] Failed to get signing key from Redis:`, error);
      return null;
    }
  }

  // Check if a user exists in the system
  async exists(whisperId: string): Promise<boolean> {
    // Check memory cache first
    if (this.keys.has(whisperId)) {
      return true;
    }

    // Check Redis
    try {
      return await redisService.userExists(whisperId);
    } catch (error) {
      console.error(`[PublicKeyStore] Failed to check existence in Redis:`, error);
      return false;
    }
  }

  // Remove a user (for account deletion)
  async remove(whisperId: string): Promise<void> {
    this.keys.delete(whisperId);
    // Note: Redis keys are permanent, would need explicit delete methods if needed
    console.log(`[PublicKeyStore] Removed keys for ${whisperId}`);
  }

  // Get total stored users count (from memory cache)
  getCount(): number {
    return this.keys.size;
  }
}

// Singleton instance
export const publicKeyStore = new PublicKeyStore();
export default publicKeyStore;
