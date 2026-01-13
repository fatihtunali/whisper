import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale, scaleFontSize } from '../utils/responsive';
import { isValidWhisperId } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AddContactScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [whisperId, setWhisperId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setError('');

    // Validate Whisper ID
    if (!isValidWhisperId(whisperId.toUpperCase())) {
      setError('Invalid Whisper ID format. Should be WSP-XXXX-XXXX-XXXX');
      return;
    }

    // Validate public key
    if (!publicKey.trim()) {
      setError('Public key is required');
      return;
    }

    setIsLoading(true);

    try {
      // Check if contact already exists
      const existing = await secureStorage.getContact(whisperId.toUpperCase());
      if (existing) {
        setError('This contact already exists');
        setIsLoading(false);
        return;
      }

      const contact: Contact = {
        whisperId: whisperId.toUpperCase(),
        publicKey: publicKey.trim(),
        nickname: nickname.trim() || undefined,
        addedAt: Date.now(),
      };

      await secureStorage.addContact(contact);

      Alert.alert('Success', 'Contact added! Start chatting now.', [
        { text: 'OK', onPress: () => navigation.replace('Chat', { contactId: contact.whisperId }) },
      ]);
    } catch (err) {
      setError('Failed to add contact. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Contact</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {/* Scan QR Button */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate('QRScanner')}
        >
          <Text style={styles.scanButtonIcon}>📷</Text>
          <Text style={styles.scanButtonText}>Scan QR Code</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or enter manually</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Manual Entry */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Whisper ID *</Text>
          <TextInput
            style={styles.input}
            value={whisperId}
            onChangeText={setWhisperId}
            placeholder="WSP-XXXX-XXXX-XXXX"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Public Key *</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={publicKey}
            onChangeText={setPublicKey}
            placeholder="Paste the contact's public key"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Nickname (optional)</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="A name to remember them by"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            maxLength={30}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.addButton, isLoading && styles.buttonDisabled]}
          onPress={handleAdd}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.addButtonText}>Add Contact</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelButton: {
    color: colors.primary,
    fontSize: fontSize.md,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: moderateScale(50),
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  scanButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  scanButtonIcon: {
    fontSize: scaleFontSize(24),
    marginRight: spacing.sm,
  },
  scanButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: moderateScale(1),
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.md,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: moderateScale(80),
    textAlignVertical: 'top',
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
