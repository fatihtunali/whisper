import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Alert,
  Platform,
  Animated,
  PanResponder,
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
type VideoCallRouteProp = RouteProp<RootStackParamList, 'VideoCall'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Local video preview dimensions
const LOCAL_VIDEO_WIDTH = moderateScale(120);
const LOCAL_VIDEO_HEIGHT = moderateScale(160);

export default function VideoCallScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<VideoCallRouteProp>();
  const insets = useSafeAreaInsets();
  const { contactId, isIncoming, callId } = route.params;

  // State
  const [contact, setContact] = useState<Contact | null>(null);
  const [callState, setCallState] = useState<CallState>(isIncoming ? 'ringing' : 'calling');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [showControls, setShowControls] = useState(true);

  // Refs
  const callDurationInterval = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const hasNavigatedAway = useRef(false);

  // Local video position (draggable)
  const localVideoPosition = useRef(new Animated.ValueXY({
    x: SCREEN_WIDTH - LOCAL_VIDEO_WIDTH - spacing.md,
    y: insets.top + spacing.xl,
  })).current;

  // Pan responder for dragging local video
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        localVideoPosition.setOffset({
          x: (localVideoPosition.x as any)._value,
          y: (localVideoPosition.y as any)._value,
        });
        localVideoPosition.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: localVideoPosition.x, dy: localVideoPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        localVideoPosition.flattenOffset();

        // Snap to edges
        const currentX = (localVideoPosition.x as any)._value;
        const currentY = (localVideoPosition.y as any)._value;

        // Keep within bounds
        const maxX = SCREEN_WIDTH - LOCAL_VIDEO_WIDTH - spacing.sm;
        const maxY = SCREEN_HEIGHT - LOCAL_VIDEO_HEIGHT - spacing.sm - 100; // Account for controls
        const minX = spacing.sm;
        const minY = insets.top + spacing.sm;

        const boundedX = Math.max(minX, Math.min(maxX, currentX));
        const boundedY = Math.max(minY, Math.min(maxY, currentY));

        Animated.spring(localVideoPosition, {
          toValue: { x: boundedX, y: boundedY },
          useNativeDriver: false,
          friction: 5,
        }).start();
      },
    })
  ).current;

  // Load contact data
  useEffect(() => {
    const loadContact = async () => {
      const contactData = await secureStorage.getContact(contactId);
      setContact(contactData);
    };
    loadContact();
  }, [contactId]);

  // Set up call service handlers
  useEffect(() => {
    callService.setCallStateHandler((state) => {
      setCallState(state);
      if (state === 'ended') {
        handleCallEnded();
      }
    });

    callService.setRemoteStreamHandler((stream) => {
      // In a real implementation, this would update the RTCView
      console.log('[VideoCallScreen] Remote stream:', stream ? 'received' : 'cleared');
    });

    return () => {
      callService.setCallStateHandler(null);
      callService.setRemoteStreamHandler(null);
    };
  }, []);

  // Start outgoing call or handle incoming
  useEffect(() => {
    const initCall = async () => {
      if (isIncoming) {
        // For incoming calls, wait for user to accept
        // The call offer data would be passed from the navigation params
      } else {
        // Start outgoing call
        try {
          const loadedContact = await secureStorage.getContact(contactId);
          if (loadedContact) {
            await callService.startCall(loadedContact, true);
          }
        } catch (error) {
          console.error('[VideoCallScreen] Failed to start call:', error);
          Alert.alert('Error', 'Failed to start video call');
          if (!hasNavigatedAway.current) {
            hasNavigatedAway.current = true;
            navigation.goBack();
          }
        }
      }
    };

    initCall();
  }, [contactId, isIncoming]);

  // Call duration timer
  useEffect(() => {
    if (callState === 'connected') {
      callDurationInterval.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callDurationInterval.current) {
        clearInterval(callDurationInterval.current);
        callDurationInterval.current = null;
      }
    }

    return () => {
      if (callDurationInterval.current) {
        clearInterval(callDurationInterval.current);
      }
    };
  }, [callState]);

  // Auto-hide controls
  useEffect(() => {
    if (showControls && callState === 'connected') {
      controlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 5000);
    }

    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [showControls, callState]);

  // Format duration
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Handle call ended
  const handleCallEnded = useCallback(() => {
    if (hasNavigatedAway.current) return;
    setCallState('ended');
    setTimeout(() => {
      if (!hasNavigatedAway.current) {
        hasNavigatedAway.current = true;
        navigation.goBack();
      }
    }, 1000);
  }, [navigation]);

  // Call controls
  const handleToggleMute = useCallback(() => {
    const muted = callService.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleToggleCamera = useCallback(() => {
    const cameraOn = callService.toggleVideo();
    setIsCameraOn(cameraOn);
  }, []);

  const handleSwitchCamera = useCallback(async () => {
    const frontCamera = await callService.switchCamera();
    setIsFrontCamera(frontCamera);
  }, []);

  const handleEndCall = useCallback(() => {
    callService.endCall();
    // Navigation will happen in handleCallEnded when state becomes 'ended'
  }, []);

  const handleAcceptCall = useCallback(async () => {
    try {
      // Get the current session to get the stored SDP offer
      const session = callService.getCurrentSession();
      if (callId && session && session.callId === callId && session.remoteSdp) {
        console.log('[VideoCallScreen] Accepting call:', callId);
        await callService.acceptCall(callId, contactId, true, session.remoteSdp);
      } else {
        console.error('[VideoCallScreen] No remote SDP found for call');
        Alert.alert('Error', 'Call data not available');
        if (!hasNavigatedAway.current) {
          hasNavigatedAway.current = true;
          navigation.goBack();
        }
      }
    } catch (error) {
      console.error('[VideoCallScreen] Failed to accept call:', error);
      Alert.alert('Error', 'Failed to accept call');
      if (!hasNavigatedAway.current) {
        hasNavigatedAway.current = true;
        navigation.goBack();
      }
    }
  }, [callId, contactId, navigation]);

  const handleRejectCall = useCallback(() => {
    if (hasNavigatedAway.current) return;
    hasNavigatedAway.current = true;
    if (callId) {
      callService.rejectCall(callId, contactId);
    }
    navigation.goBack();
  }, [callId, contactId, navigation]);

  const handleScreenTap = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  // Display name
  const displayName = contact?.nickname || contact?.username || contactId;

  // Call status text
  const getCallStatusText = (): string => {
    switch (callState) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Incoming video call';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call ended';
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Remote Video (Full Screen Background) */}
      <TouchableOpacity
        style={styles.remoteVideoContainer}
        activeOpacity={1}
        onPress={handleScreenTap}
      >
        {/* Placeholder for RTCView - shows avatar when no video */}
        <View style={styles.remoteVideoPlaceholder}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{getInitials(displayName)}</Text>
          </View>
          {callState !== 'connected' && (
            <Text style={styles.callingText}>{getCallStatusText()}</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Local Video Preview (Picture-in-Picture) */}
      {isCameraOn && callState === 'connected' && (
        <Animated.View
          style={[
            styles.localVideoContainer,
            {
              transform: [
                { translateX: localVideoPosition.x },
                { translateY: localVideoPosition.y },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Placeholder for local RTCView */}
          <View style={styles.localVideoPlaceholder}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>You</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Top Bar - Contact Info */}
      {showControls && (
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{displayName}</Text>
            <Text style={styles.callStatus}>{getCallStatusText()}</Text>
          </View>
          {/* Encryption indicator */}
          <View style={styles.encryptionBadge}>
            <Text style={styles.encryptionIcon}>&#128274;</Text>
            <Text style={styles.encryptionText}>Encrypted</Text>
          </View>
        </View>
      )}

      {/* Bottom Controls */}
      {showControls && (
        <View style={[styles.controlsContainer, { paddingBottom: insets.bottom + spacing.md }]}>
          {callState === 'ringing' && isIncoming ? (
            // Incoming call controls
            <View style={styles.incomingControls}>
              <TouchableOpacity
                style={[styles.controlButton, styles.rejectButton]}
                onPress={handleRejectCall}
              >
                <Text style={styles.controlIcon}>&#128308;</Text>
                <Text style={styles.controlLabel}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.acceptButton]}
                onPress={handleAcceptCall}
              >
                <Text style={styles.controlIcon}>&#128249;</Text>
                <Text style={styles.controlLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // In-call controls
            <View style={styles.callControls}>
              {/* Mute Button */}
              <TouchableOpacity
                style={[styles.controlButton, isMuted && styles.controlButtonActive]}
                onPress={handleToggleMute}
              >
                <Text style={styles.controlIcon}>
                  {isMuted ? '&#128263;' : '&#127908;'}
                </Text>
                <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>

              {/* Toggle Camera Button */}
              <TouchableOpacity
                style={[styles.controlButton, !isCameraOn && styles.controlButtonActive]}
                onPress={handleToggleCamera}
              >
                <Text style={styles.controlIcon}>
                  {isCameraOn ? '&#128249;' : '&#128683;'}
                </Text>
                <Text style={styles.controlLabel}>{isCameraOn ? 'Camera Off' : 'Camera On'}</Text>
              </TouchableOpacity>

              {/* Switch Camera Button */}
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleSwitchCamera}
                disabled={!isCameraOn}
              >
                <Text style={[styles.controlIcon, !isCameraOn && styles.controlIconDisabled]}>
                  &#128260;
                </Text>
                <Text style={[styles.controlLabel, !isCameraOn && styles.controlLabelDisabled]}>
                  Flip
                </Text>
              </TouchableOpacity>

              {/* End Call Button */}
              <TouchableOpacity
                style={[styles.controlButton, styles.endCallButton]}
                onPress={handleEndCall}
              >
                <Text style={styles.controlIcon}>&#128308;</Text>
                <Text style={styles.controlLabel}>End</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  remoteVideoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLarge: {
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarLargeText: {
    fontSize: fontSize.xxxl,
    fontWeight: '600',
    color: colors.text,
  },
  callingText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  localVideoContainer: {
    position: 'absolute',
    width: LOCAL_VIDEO_WIDTH,
    height: LOCAL_VIDEO_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: colors.primary,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  localVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmall: {
    width: moderateScale(50),
    height: moderateScale(50),
    borderRadius: moderateScale(25),
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  callStatus: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  encryptionIcon: {
    fontSize: fontSize.sm,
    marginRight: spacing.xs,
  },
  encryptionText: {
    fontSize: fontSize.xs,
    color: colors.success,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(70),
    height: moderateScale(70),
    borderRadius: moderateScale(35),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  controlIcon: {
    fontSize: fontSize.xxl,
    marginBottom: spacing.xs,
  },
  controlIconDisabled: {
    opacity: 0.5,
  },
  controlLabel: {
    fontSize: fontSize.xs,
    color: colors.text,
  },
  controlLabelDisabled: {
    opacity: 0.5,
  },
  endCallButton: {
    backgroundColor: colors.error,
  },
  acceptButton: {
    backgroundColor: colors.success,
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
  },
  rejectButton: {
    backgroundColor: colors.error,
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
  },
});
