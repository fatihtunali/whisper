// PublicKeyStore: Persistent storage for user public keys
// This allows message requests to work even when sender/recipient are offline

interface StoredKey {
  publicKey: string;
  signingPublicKey: string;
  lastSeen: number;
}

class PublicKeyStore {
  private keys: Map<string, StoredKey> = new Map();

  // Store or update a user's public keys
  store(whisperId: string, publicKey: string, signingPublicKey: string): void {
    this.keys.set(whisperId, {
      publicKey,
      signingPublicKey,
      lastSeen: Date.now(),
    });
    console.log(`[PublicKeyStore] Stored keys for ${whisperId} (${this.keys.size} total users)`);
  }

  // Get a user's public key by Whisper ID
  getPublicKey(whisperId: string): string | null {
    const stored = this.keys.get(whisperId);
    return stored?.publicKey || null;
  }

  // Get a user's signing public key by Whisper ID
  getSigningPublicKey(whisperId: string): string | null {
    const stored = this.keys.get(whisperId);
    return stored?.signingPublicKey || null;
  }

  // Check if a user exists in the system
  exists(whisperId: string): boolean {
    return this.keys.has(whisperId);
  }

  // Remove a user (for account deletion)
  remove(whisperId: string): void {
    if (this.keys.delete(whisperId)) {
      console.log(`[PublicKeyStore] Removed keys for ${whisperId}`);
    }
  }

  // Get total stored users count
  getCount(): number {
    return this.keys.size;
  }
}

// Singleton instance
export const publicKeyStore = new PublicKeyStore();
export default publicKeyStore;
