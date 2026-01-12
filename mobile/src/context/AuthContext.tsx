import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LocalUser } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { cryptoService } from '../crypto/CryptoService';

interface AuthContextType {
  user: LocalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  createAccount: (username?: string) => Promise<{ user: LocalUser; seedPhrase: string[] }>;
  recoverAccount: (seedPhrase: string[]) => Promise<LocalUser>;
  logout: () => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
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

    // Derive keys from seed (for deterministic recovery)
    const keys = cryptoService.deriveKeysFromSeed(seedPhrase);

    // Generate Whisper ID from public key (deterministic)
    const recovered = await cryptoService.recoverFromSeed(seedPhrase);

    const newUser: LocalUser = {
      whisperId: recovered.whisperId,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
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

    // Recover keys and Whisper ID
    const recovered = await cryptoService.recoverFromSeed(seedPhrase);

    const recoveredUser: LocalUser = {
      whisperId: recovered.whisperId,
      publicKey: recovered.publicKey,
      privateKey: recovered.privateKey,
      seedPhrase,
      createdAt: Date.now(),
    };

    await secureStorage.saveUser(recoveredUser);
    setUser(recoveredUser);

    return recoveredUser;
  };

  const logout = async () => {
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
