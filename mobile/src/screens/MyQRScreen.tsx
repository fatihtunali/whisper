import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { createQRData } from '../utils/helpers';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MyQRScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  if (!user) return null;

  const qrData = createQRData(user.whisperId, user.publicKey);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Add me on Whisper!\n\nWhisper ID: ${user.whisperId}\n\nPublic Key: ${user.publicKey}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleCopyId = () => {
    // In a real app, use Clipboard API
    Alert.alert('Copied', 'Whisper ID copied to clipboard');
  };

  const handleCopyKey = () => {
    // In a real app, use Clipboard API
    Alert.alert('Copied', 'Public key copied to clipboard');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My QR Code</Text>
        <TouchableOpacity onPress={handleShare}>
          <Text style={styles.shareButton}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* QR Code */}
        <View style={styles.qrContainer}>
          <View style={styles.qrWrapper}>
            <QRCode
              value={qrData}
              size={moderateScale(220)}
              backgroundColor="white"
              color={colors.background}
            />
          </View>
          <Text style={styles.qrHint}>
            Others can scan this to add you as a contact
          </Text>
        </View>

        {/* Whisper ID */}
        <TouchableOpacity style={styles.infoBox} onPress={handleCopyId}>
          <Text style={styles.infoLabel}>Whisper ID</Text>
          <View style={styles.infoValueRow}>
            <Text style={styles.infoValue}>{user.whisperId}</Text>
            <Text style={styles.copyIcon}>📋</Text>
          </View>
        </TouchableOpacity>

        {/* Public Key */}
        <TouchableOpacity style={styles.infoBox} onPress={handleCopyKey}>
          <Text style={styles.infoLabel}>Public Key</Text>
          <View style={styles.infoValueRow}>
            <Text style={styles.infoValueSmall} numberOfLines={2}>
              {user.publicKey}
            </Text>
            <Text style={styles.copyIcon}>📋</Text>
          </View>
        </TouchableOpacity>

        {/* Share Button */}
        <TouchableOpacity style={styles.shareButtonLarge} onPress={handleShare}>
          <Text style={styles.shareButtonText}>📤 Share My Contact Info</Text>
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
  closeButton: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  shareButton: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  qrWrapper: {
    backgroundColor: 'white',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  qrHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  infoLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  infoValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoValue: {
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: 'monospace',
    flex: 1,
  },
  infoValueSmall: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: 'monospace',
    flex: 1,
    marginRight: spacing.sm,
  },
  copyIcon: {
    fontSize: fontSize.md,
  },
  shareButtonLarge: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  shareButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
});
