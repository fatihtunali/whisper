import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { secureStorage, AppLockSettings } from '../storage/SecureStorage';
import { spacing, fontSize, borderRadius, ThemeColors } from '../utils/theme';
import { moderateScale } from '../utils/responsive';

interface AppLockScreenProps {
  onUnlock: () => void;
}

export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [lockSettings, setLockSettings] = useState<AppLockSettings | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    loadSettings();
    checkBiometrics();
  }, []);

  const loadSettings = async () => {
    const settings = await secureStorage.getAppLockSettings();
    setLockSettings(settings);
  };

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricsAvailable(hasHardware && isEnrolled);
  };

  const handleBiometricAuth = useCallback(async () => {
    if (!lockSettings?.useBiometrics || !biometricsAvailable) return;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Whisper',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: true,
      });

      if (result.success) {
        onUnlock();
      }
    } catch (err) {
      console.log('Biometric auth error:', err);
    }
  }, [lockSettings, biometricsAvailable, onUnlock]);

  // Auto-trigger biometrics on mount if enabled
  useEffect(() => {
    if (lockSettings?.useBiometrics && biometricsAvailable) {
      // Small delay to ensure screen is visible
      const timer = setTimeout(() => {
        handleBiometricAuth();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [lockSettings, biometricsAvailable, handleBiometricAuth]);

  const verifyPin = async (enteredPin: string) => {
    if (!lockSettings?.pinHash) return false;

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      enteredPin
    );

    return hash === lockSettings.pinHash;
  };

  const handlePinEntry = async (digit: string) => {
    if (pin.length >= 6) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    // Auto-verify when PIN reaches expected length (4-6 digits)
    if (newPin.length >= 4) {
      const isValid = await verifyPin(newPin);
      if (isValid) {
        setAttempts(0);
        onUnlock();
      } else if (newPin.length === 6) {
        // Only show error after max length reached
        Vibration.vibrate(100);
        setPin('');
        setAttempts(prev => prev + 1);
        setError(attempts >= 2 ? 'Too many attempts. Please try again.' : 'Incorrect PIN');
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError('');
    }
  };

  const renderPinDots = () => {
    const dots = [];
    for (let i = 0; i < 6; i++) {
      dots.push(
        <View
          key={i}
          style={[
            styles.pinDot,
            i < pin.length && styles.pinDotFilled,
            error && styles.pinDotError,
          ]}
        />
      );
    }
    return dots;
  };

  const renderKeypad = () => {
    const rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      [
        lockSettings?.useBiometrics && biometricsAvailable ? 'bio' : '',
        '0',
        'del',
      ],
    ];

    return rows.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.keypadRow}>
        {row.map((key, keyIndex) => {
          if (key === '') {
            return <View key={keyIndex} style={styles.keypadButton} />;
          }
          if (key === 'bio') {
            return (
              <TouchableOpacity
                key={keyIndex}
                style={styles.keypadButton}
                onPress={handleBiometricAuth}
              >
                <Text style={styles.keypadBioIcon}>
                  {Platform.OS === 'ios' ? '(faceID)' : '(fingerprint)'}
                </Text>
              </TouchableOpacity>
            );
          }
          if (key === 'del') {
            return (
              <TouchableOpacity
                key={keyIndex}
                style={styles.keypadButton}
                onPress={handleDelete}
                onLongPress={() => setPin('')}
              >
                <Text style={styles.keypadDeleteIcon}>X</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={keyIndex}
              style={styles.keypadButton}
              onPress={() => handlePinEntry(key)}
            >
              <Text style={styles.keypadText}>{key}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    ));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.lockIcon}>W</Text>
          <Text style={styles.title}>Whisper is Locked</Text>
          <Text style={styles.subtitle}>Enter your PIN to unlock</Text>
        </View>

        {/* PIN Display */}
        <View style={styles.pinContainer}>
          <View style={styles.pinDots}>{renderPinDots()}</View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>{renderKeypad()}</View>

        {/* Biometric Button (alternative) */}
        {lockSettings?.useBiometrics && biometricsAvailable && (
          <TouchableOpacity style={styles.biometricHint} onPress={handleBiometricAuth}>
            <Text style={styles.biometricHintText}>
              Tap to use {Platform.OS === 'ios' ? 'Face ID' : 'Fingerprint'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    header: {
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    lockIcon: {
      fontSize: moderateScale(48),
      fontWeight: '700',
      color: colors.primary,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.xxl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: fontSize.md,
      color: colors.textMuted,
    },
    pinContainer: {
      alignItems: 'center',
    },
    pinDots: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    pinDot: {
      width: moderateScale(16),
      height: moderateScale(16),
      borderRadius: moderateScale(8),
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    pinDotFilled: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pinDotError: {
      borderColor: colors.error,
    },
    errorText: {
      color: colors.error,
      fontSize: fontSize.sm,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    keypad: {
      alignItems: 'center',
    },
    keypadRow: {
      flexDirection: 'row',
      marginBottom: spacing.md,
    },
    keypadButton: {
      width: moderateScale(75),
      height: moderateScale(75),
      borderRadius: moderateScale(37.5),
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: spacing.md,
    },
    keypadText: {
      fontSize: moderateScale(28),
      fontWeight: '500',
      color: colors.text,
    },
    keypadDeleteIcon: {
      fontSize: moderateScale(20),
      color: colors.textMuted,
      fontWeight: '600',
    },
    keypadBioIcon: {
      fontSize: moderateScale(12),
      color: colors.primary,
    },
    biometricHint: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    biometricHintText: {
      fontSize: fontSize.sm,
      color: colors.primary,
    },
  });
