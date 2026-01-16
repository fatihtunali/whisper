import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { cryptoService } from '../crypto/CryptoService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'RecoverAccount'>;
};

export default function RecoverAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { recoverAccount } = useAuth();
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const wordlist = cryptoService.getWordlist();

  const updateWord = (index: number, value: string) => {
    const newWords = [...words];
    newWords[index] = value.toLowerCase().trim();
    setWords(newWords);
    setError('');
  };

  const handleRecover = async () => {
    const filledWords = words.filter(w => w.length > 0);

    if (filledWords.length !== 12) {
      setError('Please enter all 12 words');
      return;
    }

    if (!cryptoService.validateSeedPhrase(words)) {
      setError('Invalid recovery phrase. Please check your words.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await recoverAccount(words);
      // Navigation will automatically switch to MainNavigator
    } catch (err) {
      setError('Failed to recover account. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        const pastedWords = text.toLowerCase().trim().split(/\s+/);
        if (pastedWords.length === 12) {
          setWords(pastedWords);
          setError('');
        } else {
          setError('Clipboard must contain exactly 12 words');
        }
      } else {
        setError('Clipboard is empty');
      }
    } catch (err) {
      console.error('[RecoverAccount] Clipboard error:', err);
      setError('Failed to read clipboard');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Recover Account</Text>
        <Text style={styles.subtitle}>
          Enter your 12-word recovery phrase to restore your account.
        </Text>

        {/* Paste Button */}
        <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
          <Text style={styles.pasteButtonText}>📋 Paste phrase</Text>
        </TouchableOpacity>

        {/* Word Inputs */}
        <View style={styles.wordsContainer}>
          {words.map((word, index) => (
            <View key={index} style={styles.wordInputContainer}>
              <Text style={styles.wordNumber}>{index + 1}</Text>
              <TextInput
                style={styles.wordInput}
                value={word}
                onChangeText={(value) => updateWord(index, value)}
                placeholder="word"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* Recover Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.recoverButton, isLoading && styles.buttonDisabled]}
          onPress={handleRecover}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.recoverButtonText}>Recover Account</Text>
          )}
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    color: colors.primary,
    fontSize: fontSize.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
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
    marginBottom: spacing.lg,
  },
  pasteButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.lg,
  },
  pasteButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  wordInputContainer: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    margin: spacing.xs,
  },
  wordNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginRight: spacing.xs,
    minWidth: 16,
  },
  wordInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recoverButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  recoverButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
