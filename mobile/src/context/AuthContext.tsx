import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LocalUser } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { cryptoService } from '../crypto/CryptoService';
import { messagingService } from '../services/MessagingService';
import { notificationService } from '../services/NotificationService';

interface AuthContextType {
  user: LocalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isConnected: boolean;
  createAccount: (username?: string) => Promise<{ user: LocalUser; seedPhrase: string[] }>;
  recoverAccount: (seedPhrase: string[]) => Promise<LocalUser>;
  logout: () => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    loadUser();

    // Set up connection status handler
    messagingService.setOnConnectionChange((connected) => {
      setIsConnected(connected);
      console.log('[AuthContext] Connection status:', connected);
    });

    return () => {
      messagingService.setOnConnectionChange(null);
    };
  }, []);

  // Initialize notifications and connect to messaging service when user is loaded
  useEffect(() => {
    if (user) {
      const initializeAndConnect = async () => {
        // Initialize push notifications
        console.log('[AuthContext] Initializing push notifications...');
        const pushToken = await notificationService.initialize();
        messagingService.setPushToken(pushToken);

        // Set up notification listeners
        notificationService.setupListeners(
          // On notification received while app is open
          (notification) => {
            console.log('[AuthContext] Notification received in foreground');
          },
          // On notification tapped
          (response) => {
            console.log('[AuthContext] Notification tapped');
            // Could navigate to specific chat here based on response.notification.request.content.data
          }
        );

        // Connect to messaging service
        console.log('[AuthContext] Connecting to messaging service...');
        messagingService.connect(user);
      };

      initializeAndConnect();

      return () => {
        notificationService.removeListeners();
      };
    }
  }, [user]);

  const loadUser = async () => {
    try {
      // Clean up expired disappearing messages on app start
      await secureStorage.cleanupExpiredMessages();

      const storedUser = await secureStorage.getUser();
      setUser(storedUser);
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createAccount = async (username?: string): Promise<{ user: LocalUser; seedPhrase: string[] }> => {
    // Generate seed phrase first
    const seedPhrase = await cryptoService.generateSeedPhrase();

    // Derive all keys from seed (for deterministic recovery)
    // This includes both encryption keys (X25519) and signing keys (Ed25519)
    const recovered = await cryptoService.recoverFromSeed(seedPhrase);

    const newUser: LocalUser = {
      whisperId: recovered.whisperId,
      publicKey: recovered.publicKey,
      privateKey: recovered.privateKey,
      signingPublicKey: recovered.signingPublicKey,
      signingPrivateKey: recovered.signingPrivateKey,
      seedPhrase,
      username,
      createdAt: Date.now(),
    };

    await secureStorage.saveUser(newUser);
    setUser(newUser);

    return { user: newUser, seedPhrase };
  };

  const recoverAccount = async (seedPhrase: string[]): Promise<LocalUser> => {
    // Validate seed phrase
    if (!cryptoService.validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }

    // Recover all keys (encryption + signing) and Whisper ID
    const recovered = await cryptoService.recoverFromSeed(seedPhrase);

    const recoveredUser: LocalUser = {
      whisperId: recovered.whisperId,
      publicKey: recovered.publicKey,
      privateKey: recovered.privateKey,
      signingPublicKey: recovered.signingPublicKey,
      signingPrivateKey: recovered.signingPrivateKey,
      seedPhrase,
      createdAt: Date.now(),
    };

    await secureStorage.saveUser(recoveredUser);
    setUser(recoveredUser);

    return recoveredUser;
  };

  const logout = async () => {
    messagingService.disconnect();
    await secureStorage.clearAll();
    setUser(null);
  };

  const updateUsername = async (username: string) => {
    if (!user) return;

    const updatedUser = { ...user, username };
    await secureStorage.saveUser(updatedUser);
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isConnected,
        createAccount,
        recoverAccount,
        logout,
        updateUsername,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
