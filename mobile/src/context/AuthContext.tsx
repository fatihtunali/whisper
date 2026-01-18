import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
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
        try {
          // CRITICAL: Set platform BEFORE connecting so registration includes correct platform
          messagingService.setPlatform(Platform.OS as 'ios' | 'android' | 'unknown');
          console.log('[AuthContext] Platform set to:', Platform.OS);

          // IMPORTANT: Connect to WebSocket IMMEDIATELY so user is online right away
          // Don't wait for push notifications to initialize
          console.log('[AuthContext] Connecting to messaging service...');
          messagingService.connect(user);
        } catch (connectError) {
          console.error('[AuthContext] Failed to connect to messaging service:', connectError);
        }

        // Initialize push notifications in parallel (don't block connection)
        // setPushToken and setVoIPToken will auto-re-register if connected
        // Wrapped in try-catch to prevent iOS crashes from native module issues
        try {
          console.log('[AuthContext] Initializing push notifications...');
          notificationService.initialize().then((pushToken) => {
            if (pushToken) {
              messagingService.setPushToken(pushToken);
              // Note: setPushToken now auto-re-registers if connected
            }
          }).catch((err) => {
            console.warn('[AuthContext] Push notification init failed:', err);
          });
        } catch (notificationError) {
          console.error('[AuthContext] Push notification initialization crashed:', notificationError);
        }

        // Set up notification listeners - wrapped in try-catch for safety
        try {
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
                try {
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
                } catch (navError) {
                  console.error('[AuthContext] Navigation to call screen failed:', navError);
                }
              }, 100);
            } else if (data?.type === 'new_message' && data?.fromWhisperId) {
              // Navigate to chat with the sender
              console.log('[AuthContext] Navigating to chat from notification:', data);
              try {
                navigate('Chat', { contactId: data.fromWhisperId });
              } catch (navError) {
                console.error('[AuthContext] Navigation to chat failed:', navError);
              }
            }
          }
        );
        } catch (listenerError) {
          console.error('[AuthContext] Failed to set up notification listeners:', listenerError);
        }

        // Set up global incoming call handler - wrapped in try-catch for safety
        try {
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
        } catch (callHandlerError) {
          console.error('[AuthContext] Failed to set up call handler:', callHandlerError);
        }

        // Set up CallKeep event handlers for native call UI - wrapped in try-catch for safety
        try {
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
          // Verify this is the current call before ending
          const currentSession = callService.getCurrentSession();
          if (currentSession && currentSession.callId === callId) {
            callService.endCall();
          } else {
            console.log('[AuthContext] Ignoring CallKeep end for different/stale call:', callId);
          }
        };

        // Handle cold-start incoming calls (app was killed, VoIP push woke it up)
        // This happens when native code already showed the CallKit UI before JS was ready
        callKeepService.onColdStartIncomingCall = async (callId, payload) => {
          console.log('[AuthContext] Cold start incoming call:', { callId, payload });

          // Extract call info from payload (sent by native VoIP push handler)
          const fromWhisperId = payload?.fromWhisperId || payload?.handle || 'Unknown';
          const isVideo = payload?.isVideo === true || payload?.hasVideo === true;

          // Navigate to call screen - user may have already answered via CallKit
          // Use longer delay for cold-start to let navigation be ready
          setTimeout(() => {
            try {
              if (isVideo) {
                navigate('VideoCall', {
                  contactId: fromWhisperId,
                  isIncoming: true,
                  callId,
                  isColdStart: true, // Signal that this is a cold start
                });
              } else {
                navigate('Call', {
                  contactId: fromWhisperId,
                  isIncoming: true,
                  callId,
                  isColdStart: true, // Signal that this is a cold start
                });
              }
            } catch (navError) {
              console.error('[AuthContext] Cold-start navigation failed:', navError);
            }
          }, 500); // Longer delay for cold-start
        };

        // iOS: Audio session activation/deactivation is handled by CallService
        // DO NOT set callbacks here - CallService.setupCallKitAudioCallbacks() handles this
        // Setting them here would overwrite the CallService's audio session management!
        // See CallService.ts for the actual implementation

        // CRITICAL: Delay markHandlersReady until WebSocket is likely connected
        // This prevents race condition where cold-start events are processed
        // before the messaging service is fully connected
        // Wait 2 seconds to let WebSocket connect and JS runtime stabilize
        setTimeout(() => {
          try {
            console.log('[AuthContext] Processing cold-start events after delay');
            callKeepService.markHandlersReady();
          } catch (e) {
            console.error('[AuthContext] Error in markHandlersReady:', e);
          }
        }, 2000);
        } catch (callKeepError) {
          console.error('[AuthContext] Failed to set up CallKeep handlers:', callKeepError);
        }

        // Set up NotificationService incoming call handler (for VoIP push) - wrapped in try-catch for safety
        try {
          notificationService.onIncomingCall = (callId, fromWhisperId, isVideo, callerName) => {
          console.log('[AuthContext] VoIP incoming call:', { callId, fromWhisperId, isVideo, callerName });
          // Navigate to call screen
          setTimeout(() => {
            try {
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
            } catch (navError) {
              console.error('[AuthContext] VoIP call navigation failed:', navError);
            }
          }, 100);
        };
        } catch (voipError) {
          console.error('[AuthContext] Failed to set up VoIP handler:', voipError);
        }
      };

      initializeAndConnect();

      return () => {
        notificationService.removeListeners();
        notificationService.onIncomingCall = null;
        callService.setIncomingCallHandler(null);
        callKeepService.onAnswerCall = null;
        callKeepService.onEndCall = null;
        callKeepService.onColdStartIncomingCall = null;
        // Note: Audio session callbacks are managed by CallService, not here
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
