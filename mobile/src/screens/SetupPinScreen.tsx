import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Alert,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { secureStorage } from '../storage/SecureStorage';
import { RootStackParamList } from '../types';
import { spacing, fontSize, borderRadius, ThemeColors } from '../utils/theme';
import { moderateScale } from '../utils/responsive';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SetupPinRouteProp = RouteProp<RootStackParamList, 'SetupPin'>;

type SetupStep = 'enter' | 'confirm';

export default function SetupPinScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SetupPinRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const isChangingPin = route.params?.isChangingPin ?? false;

  const [step, setStep] = useState<SetupStep>('enter');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  const hashPin = async (pinToHash: string): Promise<string> => {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pinToHash
    );
  };

  const handlePinEntry = async (digit: string) => {
    if (pin.length >= 6) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    // Wait for minimum 4 digits before allowing next step
    if (newPin.length >= 4 && newPin.length <= 6) {
      // User can proceed by pressing "Next" or continue entering up to 6 digits
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError('');
    }
  };

  const handleNext = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      Vibration.vibrate(100);
      return;
    }

    if (step === 'enter') {
      setFirstPin(pin);
      setPin('');
      setStep('confirm');
    } else {
      // Confirm step
      if (pin !== firstPin) {
        setError('PINs do not match. Please try again.');
        Vibration.vibrate(100);
        setPin('');
        setFirstPin('');
        setStep('enter');
        return;
      }

      // Save the PIN
      try {
        const pinHash = await hashPin(pin);
        const currentSettings = await secureStorage.getAppLockSettings();
        await secureStorage.setAppLockSettings({
          ...currentSettings,
          enabled: true,
          pinHash,
        });

        Alert.alert(
          'PIN Set',
          isChangingPin
            ? 'Your PIN has been changed successfully.'
            : 'App lock has been enabled. You will need to enter your PIN to access Whisper.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } catch (err) {
        setError('Failed to save PIN. Please try again.');
        console.error('Failed to save PIN:', err);
      }
    }
  };

  const handleCancel = () => {
    navigation.goBack();
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
      ['', '0', 'del'],
    ];

    return rows.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.keypadRow}>
        {row.map((key, keyIndex) => {
          if (key === '') {
            return <View key={keyIndex} style={styles.keypadButton} />;
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isChangingPin ? 'Change PIN' : 'Set Up PIN'}
        </Text>
        <View style={styles.cancelButton} />
      </View>

      <View style={styles.content}>
        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.title}>
            {step === 'enter' ? 'Enter a PIN' : 'Confirm your PIN'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'enter'
              ? 'Choose a 4-6 digit PIN to lock your app'
              : 'Enter your PIN again to confirm'}
          </Text>
        </View>

        {/* PIN Display */}
        <View style={styles.pinContainer}>
          <View style={styles.pinDots}>{renderPinDots()}</View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>{renderKeypad()}</View>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, pin.length < 4 && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={pin.length < 4}
        >
          <Text style={[styles.nextButtonText, pin.length < 4 && styles.nextButtonTextDisabled]}>
            {step === 'enter' ? 'Next' : 'Confirm'}
          </Text>
        </TouchableOpacity>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: colors.text,
    },
    cancelButton: {
      width: moderateScale(70),
    },
    cancelText: {
      fontSize: fontSize.md,
      color: colors.primary,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    instructions: {
      alignItems: 'center',
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: fontSize.md,
      color: colors.textMuted,
      textAlign: 'center',
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
      width: moderateScale(70),
      height: moderateScale(70),
      borderRadius: moderateScale(35),
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: spacing.sm,
    },
    keypadText: {
      fontSize: moderateScale(26),
      fontWeight: '500',
      color: colors.text,
    },
    keypadDeleteIcon: {
      fontSize: moderateScale(18),
      color: colors.textMuted,
      fontWeight: '600',
    },
    nextButton: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    nextButtonDisabled: {
      backgroundColor: colors.surface,
    },
    nextButtonText: {
      fontSize: fontSize.md,
      fontWeight: '600',
      color: '#ffffff',
    },
    nextButtonTextDisabled: {
      color: colors.textMuted,
    },
  });
