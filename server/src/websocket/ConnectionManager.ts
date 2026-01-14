import { WebSocket } from 'ws';
import { ConnectedClient, PrivacyPrefs } from '../types';
import { publicKeyStore } from '../services/PublicKeyStore';
import { pushTokenStore } from '../services/PushTokenStore';

class ConnectionManager {
  private clients: Map<string, ConnectedClient> = new Map();
  private pushTokens: Map<string, string> = new Map(); // In-memory cache, backed by database
  private voipTokens: Map<string, string> = new Map(); // VoIP tokens for iOS
  private initialized: boolean = false;

  // Initialize - load push tokens from database
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await pushTokenStore.initialize();
      this.pushTokens = await pushTokenStore.getAll();
      this.voipTokens = await pushTokenStore.getAllVoIPTokens();
      this.initialized = true;
      console.log(`[ConnectionManager] Initialized with ${this.pushTokens.size} push tokens, ${this.voipTokens.size} VoIP tokens`);
    } catch (error) {
      console.error('[ConnectionManager] Failed to initialize:', error);
    }
  }

  // Register a new client connection
  register(
    whisperId: string,
    publicKey: string,
    signingPublicKey: string,
    socket: WebSocket,
    pushToken?: string,
    prefs?: PrivacyPrefs,
    voipToken?: string,
    platform?: string
  ): void {
    // If client already connected, close old connection
    const existing = this.clients.get(whisperId);
    if (existing && existing.socket !== socket) {
      console.log(`[ConnectionManager] Closing old connection for ${whisperId}`);
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

    this.clients.set(whisperId, client);

    // Store public keys persistently (survives disconnection for message requests)
    publicKeyStore.store(whisperId, publicKey, signingPublicKey);

    // Store push token separately (persists when user goes offline)
    if (pushToken) {
      this.pushTokens.set(whisperId, pushToken);
      // Persist to database asynchronously
      pushTokenStore.store(whisperId, pushToken, platform || 'unknown').catch(err =>
        console.error(`[ConnectionManager] Failed to persist push token:`, err)
      );
      console.log(`[ConnectionManager] Stored push token for ${whisperId}`);
    }

    // Store VoIP token for iOS (used for incoming call notifications)
    if (voipToken) {
      this.voipTokens.set(whisperId, voipToken);
      // Persist to database asynchronously
      pushTokenStore.storeVoIPToken(whisperId, voipToken).catch(err =>
        console.error(`[ConnectionManager] Failed to persist VoIP token:`, err)
      );
      console.log(`[ConnectionManager] Stored VoIP token for ${whisperId}`);
    }

    const hidden = prefs?.hideOnlineStatus ? ' [hidden]' : '';
    console.log(`[ConnectionManager] Registered: ${whisperId} (${this.clients.size} total)${hidden}`);
  }

  // Remove a client connection
  unregister(whisperId: string): void {
    if (this.clients.delete(whisperId)) {
      console.log(`[ConnectionManager] Unregistered: ${whisperId} (${this.clients.size} total)`);
    }
  }

  // Remove by socket reference (for disconnect events)
  unregisterBySocket(socket: WebSocket): string | null {
    for (const [whisperId, client] of this.clients) {
      if (client.socket === socket) {
        this.clients.delete(whisperId);
        console.log(`[ConnectionManager] Unregistered by socket: ${whisperId} (${this.clients.size} total)`);
        return whisperId;
      }
    }
    return null;
  }

  // Get a client by Whisper ID
  get(whisperId: string): ConnectedClient | undefined {
    return this.clients.get(whisperId);
  }

  // Check if a client is online
  isOnline(whisperId: string): boolean {
    const client = this.clients.get(whisperId);
    if (!client) return false;
    return client.socket.readyState === WebSocket.OPEN;
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

  // Update last ping time
  updatePing(whisperId: string): void {
    const client = this.clients.get(whisperId);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  // Get client by socket
  getBySocket(socket: WebSocket): ConnectedClient | null {
    for (const client of this.clients.values()) {
      if (client.socket === socket) {
        return client;
      }
    }
    return null;
  }

  // Get total connected clients count
  getCount(): number {
    return this.clients.size;
  }

  // Get all connected Whisper IDs
  getAllIds(): string[] {
    return Array.from(this.clients.keys());
  }

  // Get push token for a user (even if offline)
  getPushToken(whisperId: string): string | null {
    return this.pushTokens.get(whisperId) || null;
  }

  // Get VoIP token for a user (iOS only, for incoming calls)
  getVoIPToken(whisperId: string): string | null {
    return this.voipTokens.get(whisperId) || null;
  }

  // Get public key for a user (works even when offline)
  getPublicKey(whisperId: string): string | null {
    // First check if user is online
    const client = this.clients.get(whisperId);
    if (client) {
      return client.publicKey;
    }
    // Fall back to persistent store
    return publicKeyStore.getPublicKey(whisperId);
  }

  // Check if a user exists in the system (has ever connected)
  userExists(whisperId: string): boolean {
    return publicKeyStore.exists(whisperId);
  }

  // Clean up stale connections (no ping for 2 minutes)
  cleanupStale(): number {
    const staleThreshold = Date.now() - 2 * 60 * 1000; // 2 minutes
    let cleaned = 0;

    for (const [whisperId, client] of this.clients) {
      if (client.lastPing < staleThreshold) {
        console.log(`[ConnectionManager] Cleaning stale connection: ${whisperId}`);
        client.socket.close(1000, 'Connection timeout');
        this.clients.delete(whisperId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
export default connectionManager;
