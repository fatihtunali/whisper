import { randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import { PrivacyPrefs } from '../types';

// Pending challenge data
interface PendingChallenge {
  socketId: string;
  whisperId: string;
  publicKey: string;
  signingPublicKey: string;
  challenge: string; // Base64 encoded
  expiresAt: number;
  pushToken?: string;
  voipToken?: string;
  platform?: string;
  prefs?: PrivacyPrefs;
}

// Result of verifying a proof
interface VerifyResult {
  success: boolean;
  error?: 'CHALLENGE_EXPIRED' | 'AUTH_FAILED' | 'NO_CHALLENGE';
  data?: {
    whisperId: string;
    publicKey: string;
    signingPublicKey: string;
    pushToken?: string;
    voipToken?: string;
    platform?: string;
    prefs?: PrivacyPrefs;
  };
}

// Base64 encoding/decoding utilities
const encodeBase64 = (arr: Uint8Array): string => {
  return Buffer.from(arr).toString('base64');
};

const decodeBase64 = (str: string): Uint8Array => {
  return new Uint8Array(Buffer.from(str, 'base64'));
};

class AuthService {
  private pendingChallenges: Map<string, PendingChallenge> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Challenge validity period in milliseconds (30 seconds)
  private static readonly CHALLENGE_EXPIRY_MS = 30 * 1000;

  // Challenge size in bytes
  private static readonly CHALLENGE_SIZE = 32;

  constructor() {
    // Start cleanup interval (runs every minute)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000);
  }

  /**
   * Create a new authentication challenge for a client
   * Returns the base64-encoded challenge to send to client
   */
  createChallenge(
    socketId: string,
    data: {
      whisperId: string;
      publicKey: string;
      signingPublicKey: string;
      pushToken?: string;
      voipToken?: string;
      platform?: string;
      prefs?: PrivacyPrefs;
    }
  ): string {
    // Generate random 32-byte challenge
    const challengeBytes = randomBytes(AuthService.CHALLENGE_SIZE);
    const challenge = encodeBase64(challengeBytes);

    // Store pending challenge
    const pendingChallenge: PendingChallenge = {
      socketId,
      whisperId: data.whisperId,
      publicKey: data.publicKey,
      signingPublicKey: data.signingPublicKey,
      challenge,
      expiresAt: Date.now() + AuthService.CHALLENGE_EXPIRY_MS,
      pushToken: data.pushToken,
      voipToken: data.voipToken,
      platform: data.platform,
      prefs: data.prefs,
    };

    this.pendingChallenges.set(socketId, pendingChallenge);
    console.log(`[AuthService] Challenge created for ${data.whisperId}`);

    return challenge;
  }

  /**
   * Verify a client's signature proof
   * Returns success with client data, or error code
   */
  verifyProof(socketId: string, signature: string): VerifyResult {
    // Find pending challenge
    const pending = this.pendingChallenges.get(socketId);
    if (!pending) {
      console.warn(`[AuthService] No pending challenge for socket ${socketId}`);
      return { success: false, error: 'NO_CHALLENGE' };
    }

    // Check expiry
    if (Date.now() > pending.expiresAt) {
      this.pendingChallenges.delete(socketId);
      console.warn(`[AuthService] Challenge expired for ${pending.whisperId}`);
      return { success: false, error: 'CHALLENGE_EXPIRED' };
    }

    // Verify Ed25519 signature
    try {
      const challengeBytes = decodeBase64(pending.challenge);
      const signatureBytes = decodeBase64(signature);
      const publicKeyBytes = decodeBase64(pending.signingPublicKey);

      const isValid = nacl.sign.detached.verify(
        challengeBytes,
        signatureBytes,
        publicKeyBytes
      );

      if (!isValid) {
        console.warn(`[AuthService] Invalid signature for ${pending.whisperId}`);
        this.pendingChallenges.delete(socketId);
        return { success: false, error: 'AUTH_FAILED' };
      }

      // Success - remove pending challenge and return data
      this.pendingChallenges.delete(socketId);
      console.log(`[AuthService] Authentication successful for ${pending.whisperId}`);

      return {
        success: true,
        data: {
          whisperId: pending.whisperId,
          publicKey: pending.publicKey,
          signingPublicKey: pending.signingPublicKey,
          pushToken: pending.pushToken,
          voipToken: pending.voipToken,
          platform: pending.platform,
          prefs: pending.prefs,
        },
      };
    } catch (error) {
      console.error(`[AuthService] Verification error for ${pending.whisperId}:`, error);
      this.pendingChallenges.delete(socketId);
      return { success: false, error: 'AUTH_FAILED' };
    }
  }

  /**
   * Remove pending challenge for a socket (on disconnect)
   */
  removePendingChallenge(socketId: string): void {
    if (this.pendingChallenges.delete(socketId)) {
      console.log(`[AuthService] Removed pending challenge for socket ${socketId}`);
    }
  }

  /**
   * Clean up expired challenges
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [socketId, challenge] of this.pendingChallenges) {
      if (now > challenge.expiresAt) {
        this.pendingChallenges.delete(socketId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[AuthService] Cleaned up ${cleaned} expired challenges`);
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats(): { pendingChallenges: number } {
    return {
      pendingChallenges: this.pendingChallenges.size,
    };
  }

  /**
   * Shutdown cleanup interval
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const authService = new AuthService();
export default authService;
