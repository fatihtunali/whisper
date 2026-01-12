import { WebSocket } from 'ws';
import { ConnectedClient } from '../types';

class ConnectionManager {
  private clients: Map<string, ConnectedClient> = new Map();

  // Register a new client connection
  register(whisperId: string, publicKey: string, socket: WebSocket): void {
    // If client already connected, close old connection
    const existing = this.clients.get(whisperId);
    if (existing && existing.socket !== socket) {
      console.log(`[ConnectionManager] Closing old connection for ${whisperId}`);
      existing.socket.close(1000, 'New connection established');
    }

    const client: ConnectedClient = {
      whisperId,
      publicKey,
      socket,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    this.clients.set(whisperId, client);
    console.log(`[ConnectionManager] Registered: ${whisperId} (${this.clients.size} total)`);
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
