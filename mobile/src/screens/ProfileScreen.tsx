import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale, scaleFontSize } from '../utils/responsive';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, updateUsername } = useAuth();
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);

  const handleSaveUsername = async () => {
    if (newUsername.trim()) {
      await updateUsername(newUsername.trim());
    }
    setIsEditingUsername(false);
  };

  const handleShowSeedPhrase = () => {
    Alert.alert(
      'Show Recovery Phrase',
      'Make sure no one is watching your screen. Your recovery phrase gives full access to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show',
          onPress: () => setShowSeedPhrase(true),
        },
      ]
    );
  };

  const handleCopySeedPhrase = () => {
    // In a real app, use Clipboard API
    Alert.alert('Copied', 'Recovery phrase copied to clipboard');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.username?.[0]?.toUpperCase() || '👤'}
            </Text>
          </View>
        </View>

        {/* Username */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Username</Text>
          {isEditingUsername ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="Enter username"
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={20}
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveUsername}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.fieldValue}
              onPress={() => setIsEditingUsername(true)}
            >
              <Text style={styles.fieldValueText}>
                {user?.username || 'Not set'}
              </Text>
              <Text style={styles.editIcon}>✏️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Whisper ID */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Whisper ID</Text>
          <View style={styles.fieldValue}>
            <Text style={styles.fieldValueMono}>{user?.whisperId}</Text>
          </View>
          <Text style={styles.fieldHint}>
            Share this with others so they can message you
          </Text>
        </View>

        {/* Public Key */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Public Key</Text>
          <View style={styles.fieldValue}>
            <Text style={styles.fieldValueMono} numberOfLines={2}>
              {user?.publicKey}
            </Text>
          </View>
          <Text style={styles.fieldHint}>
            Used for end-to-end encryption
          </Text>
        </View>

        {/* Recovery Phrase */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Recovery Phrase</Text>
          {showSeedPhrase ? (
            <View style={styles.seedPhraseContainer}>
              <View style={styles.seedPhraseGrid}>
                {user?.seedPhrase.map((word, index) => (
                  <View key={index} style={styles.seedWord}>
                    <Text style={styles.seedWordNumber}>{index + 1}</Text>
                    <Text style={styles.seedWordText}>{word}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopySeedPhrase}
              >
                <Text style={styles.copyButtonText}>📋 Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.hideButton}
                onPress={() => setShowSeedPhrase(false)}
              >
                <Text style={styles.hideButtonText}>Hide</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.showSeedButton}
              onPress={handleShowSeedPhrase}
            >
              <Text style={styles.showSeedButtonText}>
                👁️ Show Recovery Phrase
              </Text>
            </TouchableOpacity>
          )}
          <Text style={styles.fieldHint}>
            Never share this with anyone. It's the only way to recover your account.
          </Text>
        </View>

        {/* Account Created */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Account Created</Text>
          <View style={styles.fieldValue}>
            <Text style={styles.fieldValueText}>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : 'Unknown'}
            </Text>
          </View>
        </View>
      </ScrollView>
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
  closeButton: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: moderateScale(30),
  },
  content: {
    padding: spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: moderateScale(100),
    height: moderateScale(100),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: scaleFontSize(40),
    color: colors.text,
  },
  field: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  fieldValue: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldValueText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  fieldValueMono: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: 'monospace',
    flex: 1,
  },
  editIcon: {
    fontSize: fontSize.md,
  },
  fieldHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  editContainer: {
    flexDirection: 'row',
  },
  editInput: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.primary,
    marginRight: spacing.sm,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  seedPhraseContainer: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  seedPhraseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
    marginHorizontal: -spacing.xs,
  },
  seedWord: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    margin: spacing.xs,
  },
  seedWordNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginRight: spacing.xs,
    minWidth: moderateScale(16),
  },
  seedWordText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  copyButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  copyButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
  },
  hideButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  hideButtonText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  showSeedButton: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  showSeedButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
});
