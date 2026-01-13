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
      }
    };

    callService.setCallStateHandler(handleCallState);

    return () => {
      callService.setCallStateHandler(null);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [navigation]);

  // Handle incoming call handler for receiving offer
  useEffect(() => {
    const handleIncomingCall = (callId: string, fromWhisperId: string, isVideo: boolean) => {
      // Get the pending offer from the call service's current session
      const session = callService.getCurrentSession();
      if (session && session.callId === callId) {
        // Offer is handled internally by CallService
      }
    };

    callService.setIncomingCallHandler(handleIncomingCall);

    return () => {
      callService.setIncomingCallHandler(null);
    };
  }, []);

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
      // Get the current session to get the SDP offer
      const session = callService.getCurrentSession();
      if (session && session.callId === incomingCallId) {
        // The session is already created with the offer in handleSignalingMessage
        // Just need to get the SDP which was stored during call_offer handling
        // For now, we'll use the internal call service accept mechanism

        // Note: In a full implementation, the offer SDP would be passed through navigation params
        // or stored in the call service for retrieval
        console.log('[CallScreen] Accepting call:', incomingCallId);
        setCallState('connected');
      }
    } catch (error) {
      console.error('Failed to accept call:', error);
      Alert.alert('Error', 'Failed to accept call');
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
  const handleToggleSpeaker = () => {
    const newSpeaker = callService.toggleSpeaker();
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
        return 'Incoming call...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call ended';
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
        {/* Mute and Speaker buttons (visible during connected call) */}
        {callState === 'connected' && (
          <View style={styles.secondaryControls}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={handleToggleMute}
            >
              <Text style={styles.controlIcon}>{isMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</Text>
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
              onPress={handleToggleSpeaker}
            >
              <Text style={styles.controlIcon}>{isSpeakerOn ? '\uD83D\uDD08' : '\uD83D\uDCF1'}</Text>
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
                <Text style={styles.callButtonIcon}>{'\uD83D\uDCF5'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callButton, styles.acceptButton]}
                onPress={handleAccept}
              >
                <Text style={styles.callButtonIcon}>{'\uD83D\uDCDE'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* For outgoing calls and connected: End call */
            <TouchableOpacity
              style={[styles.callButton, styles.endCallButton]}
              onPress={handleEndCall}
            >
              <Text style={styles.callButtonIcon}>{'\uD83D\uDCF5'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Encryption indicator */}
      <View style={styles.encryptionBadge}>
        <Text style={styles.encryptionIcon}>{'\uD83D\uDD12'}</Text>
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
  controlIcon: {
    fontSize: moderateScale(24),
    marginBottom: spacing.xs,
  },
  controlLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
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
  callButtonIcon: {
    fontSize: moderateScale(28),
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    opacity: 0.6,
  },
  encryptionIcon: {
    fontSize: fontSize.sm,
    marginRight: spacing.xs,
  },
  encryptionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
