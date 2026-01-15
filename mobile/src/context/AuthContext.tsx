import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LocalUser } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { cryptoService } from '../crypto/CryptoService';
import { messagingService } from '../services/MessagingService';
import { notificationService } from '../services/NotificationService';
import { callService } from '../services/CallService';
import { callKeepService } from '../services/CallKeepService';
import { navigate } from '../utils/navigationRef';

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
            const data = response.notification.request.content.data as any;

            if (data?.type === 'incoming_call') {
              // Navigate to call screen
              console.log('[AuthContext] Navigating to call screen from notification:', data);
              // Parse isVideo as it might come as string from notification data
              const isVideo = data.isVideo === true || data.isVideo === 'true';

              // Use setTimeout to ensure navigation happens after any current navigation completes
              setTimeout(() => {
                if (isVideo) {
                  navigate('VideoCall', {
                    contactId: data.fromWhisperId,
                    isIncoming: true,
                    callId: data.callId,
                  });
                } else {
                  navigate('Call', {
                    contactId: data.fromWhisperId,
                    isIncoming: true,
                    callId: data.callId,
                  });
                }
              }, 100);
            } else if (data?.type === 'new_message' && data?.fromWhisperId) {
              // Navigate to chat with the sender
              console.log('[AuthContext] Navigating to chat from notification:', data);
              navigate('Chat', { contactId: data.fromWhisperId });
            }
          }
        );

        // Set up global incoming call handler
        callService.setIncomingCallHandler(async (callId, fromWhisperId, isVideo) => {
          console.log('[AuthContext] Incoming call:', { callId, fromWhisperId, isVideo });

          // Get contact name for notification
          const contact = await secureStorage.getContact(fromWhisperId);
          const callerName = contact?.nickname || contact?.username || fromWhisperId;

          // Show notification
          await notificationService.showIncomingCallNotification(
            callerName,
            callId,
            fromWhisperId,
            isVideo
          );

          // Navigate to call screen
          setTimeout(() => {
            if (isVideo) {
              navigate('VideoCall', {
                contactId: fromWhisperId,
                isIncoming: true,
                callId,
              });
            } else {
              navigate('Call', {
                contactId: fromWhisperId,
                isIncoming: true,
                callId,
              });
            }
          }, 100);
        });

        // Set up CallKeep event handlers for native call UI
        callKeepService.onAnswerCall = async (callId) => {
          console.log('[AuthContext] CallKeep answer call:', callId);
          // The call screen will handle accepting the call
          // Just navigate to the appropriate screen
          const session = callService.getCurrentSession();
          if (session && session.callId === callId) {
            const isVideo = session.isVideo;
            const contactId = session.contactId;
            setTimeout(() => {
              if (isVideo) {
                navigate('VideoCall', {
                  contactId: contactId,
                  isIncoming: true,
                  callId,
                });
              } else {
                navigate('Call', {
                  contactId: contactId,
                  isIncoming: true,
                  callId,
                });
              }
            }, 100);
          }
        };

        callKeepService.onEndCall = (callId) => {
          console.log('[AuthContext] CallKeep end call:', callId);
          callService.endCall();
        };

        // Set up NotificationService incoming call handler (for VoIP push)
        notificationService.onIncomingCall = (callId, fromWhisperId, isVideo, callerName) => {
          console.log('[AuthContext] VoIP incoming call:', { callId, fromWhisperId, isVideo, callerName });
          // Navigate to call screen
          setTimeout(() => {
            if (isVideo) {
              navigate('VideoCall', {
                contactId: fromWhisperId,
                isIncoming: true,
                callId,
              });
            } else {
              navigate('Call', {
                contactId: fromWhisperId,
                isIncoming: true,
                callId,
              });
            }
          }, 100);
        };

        // Connect to messaging service
        console.log('[AuthContext] Connecting to messaging service...');
        messagingService.connect(user);
      };

      initializeAndConnect();

      return () => {
        notificationService.removeListeners();
        notificationService.onIncomingCall = null;
        callService.setIncomingCallHandler(null);
        callKeepService.onAnswerCall = null;
        callKeepService.onEndCall = null;
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
