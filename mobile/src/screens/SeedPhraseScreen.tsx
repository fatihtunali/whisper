import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../types';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SeedPhrase'>;
  route: RouteProp<AuthStackParamList, 'SeedPhrase'>;
};

export default function SeedPhraseScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { seedPhrase, isBackup } = route.params;
  const [confirmed, setConfirmed] = useState(false);

  const handleContinue = () => {
    if (!confirmed) {
      Alert.alert(
        'Important',
        'Please confirm that you have saved your recovery phrase before continuing.',
        [{ text: 'OK' }]
      );
      return;
    }
    // Navigation will automatically switch to MainNavigator
    // because isAuthenticated will be true after account creation
  };

  const handleCopy = () => {
    // In a real app, use Clipboard API
    Alert.alert('Copied', 'Recovery phrase copied to clipboard', [
      { text: 'OK' },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Recovery Phrase</Text>
          <Text style={styles.subtitle}>
            Write down these 12 words in order.{'\n'}
            This is the ONLY way to recover your account.
          </Text>
        </View>

        {/* Warning */}
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            Never share your recovery phrase with anyone.{'\n'}
            Whisper will never ask for it.
          </Text>
        </View>

        {/* Seed Phrase Grid */}
        <View style={styles.phraseContainer}>
          {seedPhrase.map((word, index) => (
            <View key={index} style={styles.wordBox}>
              <Text style={styles.wordNumber}>{index + 1}</Text>
              <Text style={styles.word}>{word}</Text>
            </View>
          ))}
        </View>

        {/* Copy Button */}
        <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
          <Text style={styles.copyButtonText}>📋 Copy to Clipboard</Text>
        </TouchableOpacity>

        {/* Confirmation Checkbox */}
        <TouchableOpacity
          style={styles.confirmContainer}
          onPress={() => setConfirmed(!confirmed)}
        >
          <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
            {confirmed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.confirmText}>
            I have saved my recovery phrase in a safe place
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !confirmed && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!confirmed}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  warningBox: {
    backgroundColor: '#451a03',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#92400e',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: '#fbbf24',
    lineHeight: 20,
  },
  phraseContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
    marginHorizontal: -spacing.xs,
  },
  wordBox: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    margin: spacing.xs,
  },
  wordNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginRight: spacing.sm,
    minWidth: 16,
  },
  word: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  copyButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  copyButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
  },
  confirmContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
