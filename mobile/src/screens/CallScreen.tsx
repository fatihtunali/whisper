import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Contact, CallState } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { callService } from '../services/CallService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CallRouteProp = RouteProp<RootStackParamList, 'Call'>;

export default function CallScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CallRouteProp>();
  const insets = useSafeAreaInsets();
  const { contactId, isIncoming, callId: incomingCallId } = route.params;

  const [contact, setContact] = useState<Contact | null>(null);
  const [callState, setCallState] = useState<CallState>(isIncoming ? 'ringing' : 'calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [pendingOffer, setPendingOffer] = useState<string | null>(null);

  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load contact data
  useEffect(() => {
    const loadContact = async () => {
      const contactData = await secureStorage.getContact(contactId);
      setContact(contactData);
    };
    loadContact();
  }, [contactId]);

  // Set up call state handler
  useEffect(() => {
    const handleCallState = (state: CallState) => {
      setCallState(state);

      if (state === 'connected') {
        // Start duration timer
        durationTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      } else if (state === 'ended') {
        // Clean up and go back
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
        }
        setTimeout(() => {
          navigation.goBack();
        }, 500);
      } else if (state === 'no_answer') {
        // User not available - show message briefly then go back
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
        }
        setTimeout(() => {
          navigation.goBack();
        }, 2000);
      }
    };

    callService.setCallStateHandler(handleCallState);

    return () => {
      // IMPORTANT: End call FIRST before clearing handlers
      // Otherwise the endCall state change won't be handled
      const session = callService.getCurrentSession();
      if (session && session.state !== 'ended') {
        console.log('[CallScreen] Ending call on unmount - session still active');
        callService.endCall();
      }

      // Now safe to clear handlers and timers
      callService.setCallStateHandler(null);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [navigation]);

  // NOTE: Do not override the global incoming call handler set in AuthContext
  // The global handler handles navigation. This screen is already displayed
  // when we reach here, so we don't need a local handler.

  // Initiate outgoing call
  useEffect(() => {
    if (!isIncoming && contact) {
      initiateCall();
    }
  }, [isIncoming, contact]);

  const initiateCall = async () => {
    if (!contact) return;

    try {
      await callService.startCall(contact, false); // Voice call only
    } catch (error) {
      console.error('Failed to initiate call:', error);
      Alert.alert('Call Failed', 'Could not connect the call. Please try again.');
      navigation.goBack();
    }
  };

  // Handle accepting incoming call
  const handleAccept = async () => {
    if (!incomingCallId || !contact) return;

    try {
      // Get the current session to get the stored SDP offer
      let session = callService.getCurrentSession();

      // If SDP not available yet, wait for it (race condition with VoIP push)
      // The VoIP push arrives before the WebSocket message with SDP
      if (session && session.callId === incomingCallId && !session.remoteSdp) {
        console.log('[CallScreen] Waiting for SDP to arrive via WebSocket...');
        setCallState('connecting'); // Show "Connecting..." while waiting

        // Poll for SDP with timeout (max 5 seconds)
        const maxWaitTime = 5000;
        const pollInterval = 200;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          session = callService.getCurrentSession();

          // Check if we got the SDP
          if (session && session.callId === incomingCallId && session.remoteSdp) {
            console.log('[CallScreen] SDP arrived after', Date.now() - startTime, 'ms');
            break;
          }

          // Check if call was cancelled
          if (!session || session.state === 'ended') {
            console.log('[CallScreen] Call cancelled while waiting for SDP');
            return;
          }
        }
      }

      // Now try to accept with the (hopefully) available SDP
      session = callService.getCurrentSession();
      if (session && session.callId === incomingCallId && session.remoteSdp) {
        console.log('[CallScreen] Accepting call:', incomingCallId);
        await callService.acceptCall(incomingCallId, contact.whisperId, false, session.remoteSdp);
      } else {
        console.error('[CallScreen] No remote SDP found for call after waiting');
        Alert.alert('Error', 'Call data not available. Please try again.');
        handleDecline();
      }
    } catch (error: any) {
      console.error('Failed to accept call:', error);
      Alert.alert('Error', error?.message || 'Failed to accept call');
      handleDecline();
    }
  };

  // Handle declining incoming call
  const handleDecline = () => {
    if (incomingCallId && contact) {
      callService.rejectCall(incomingCallId, contact.whisperId);
    }
    navigation.goBack();
  };

  // Handle ending call
  const handleEndCall = () => {
    callService.endCall();
    // Navigation will happen in the call state handler when state becomes 'ended'
  };

  // Handle mute toggle
  const handleToggleMute = () => {
    const newMuted = callService.toggleMute();
    setIsMuted(newMuted);
  };

  // Handle speaker toggle
  const handleToggleSpeaker = async () => {
    const newSpeaker = await callService.toggleSpeaker();
    setIsSpeakerOn(newSpeaker);
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status text based on call state
  const getStatusText = (): string => {
    switch (callState) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        // For outgoing calls, 'ringing' means recipient's phone is ringing
        // For incoming calls, 'ringing' means the call is incoming
        return isIncoming ? 'Incoming call...' : 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call ended';
      case 'no_answer':
        return 'User not available';
      default:
        return '';
    }
  };

  const displayName = contact?.nickname || contact?.username || contactId;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Contact Info */}
      <View style={styles.contactSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
        </View>
        <Text style={styles.contactName}>{displayName}</Text>
        <Text style={styles.callStatus}>{getStatusText()}</Text>
      </View>

      {/* Call Controls */}
      <View style={styles.controlsSection}>
        {/* Mute and Speaker buttons (visible during connecting/connected call) */}
        {(callState === 'connected' || callState === 'connecting') && (
          <View style={styles.secondaryControls}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={handleToggleMute}
            >
              <Ionicons
                name={isMuted ? 'mic-off' : 'mic'}
                size={moderateScale(24)}
                color={colors.text}
              />
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
              onPress={handleToggleSpeaker}
            >
              <Ionicons
                name={isSpeakerOn ? 'volume-high' : 'phone-portrait'}
                size={moderateScale(24)}
                color={colors.text}
              />
              <Text style={styles.controlLabel}>{isSpeakerOn ? 'Speaker' : 'Phone'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Primary controls */}
        <View style={styles.primaryControls}>
          {/* For incoming calls: Accept and Decline */}
          {isIncoming && callState === 'ringing' ? (
            <>
              <TouchableOpacity
                style={[styles.callButton, styles.declineButton]}
                onPress={handleDecline}
              >
                <Ionicons name="call" size={moderateScale(28)} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callButton, styles.acceptButton]}
                onPress={handleAccept}
              >
                <Ionicons name="call" size={moderateScale(28)} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            /* For outgoing calls and connected: End call */
            <TouchableOpacity
              style={[styles.callButton, styles.endCallButton]}
              onPress={handleEndCall}
            >
              <Ionicons name="call" size={moderateScale(28)} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Encryption indicator */}
      <View style={styles.encryptionBadge}>
        <Ionicons name="lock-closed" size={moderateScale(14)} color={colors.textMuted} style={{ marginRight: spacing.xs }} />
        <Text style={styles.encryptionText}>End-to-end encrypted</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  contactSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  avatar: {
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    fontSize: moderateScale(48),
    fontWeight: '600',
    color: colors.text,
  },
  contactName: {
    fontSize: fontSize.xxxl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  callStatus: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  controlsSection: {
    width: '100%',
    paddingBottom: spacing.xxl,
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    gap: spacing.xl,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(70),
    height: moderateScale(70),
    borderRadius: moderateScale(35),
    backgroundColor: colors.surface,
  },
  controlButtonActive: {
    backgroundColor: colors.primary,
  },
  controlLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  primaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  callButton: {
    width: moderateScale(70),
    height: moderateScale(70),
    borderRadius: moderateScale(35),
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: colors.success,
  },
  declineButton: {
    backgroundColor: colors.error,
  },
  endCallButton: {
    backgroundColor: colors.error,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    opacity: 0.6,
  },
  encryptionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
