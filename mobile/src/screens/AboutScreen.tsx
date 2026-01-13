import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';

export default function AboutScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const handleEmailPress = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleWebsitePress = () => {
    Linking.openURL('https://sarjmobile.com');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Whisper</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* App Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>🤫</Text>
          </View>
          <Text style={styles.appName}>Whisper</Text>
          <Text style={styles.tagline}>Private. Secure. Anonymous.</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionContent}>
            <Text style={styles.bodyText}>
              Whisper is a privacy-first encrypted messaging app designed for those who value their digital privacy. No phone number or email required - just create an account and start messaging with your anonymous Whisper ID.
            </Text>
          </View>
        </View>

        {/* Features Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.sectionContent}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🔐</Text>
              <Text style={styles.featureText}>End-to-end encryption</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🚫</Text>
              <Text style={styles.featureText}>No data collection</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>👤</Text>
              <Text style={styles.featureText}>Anonymous accounts</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>💨</Text>
              <Text style={styles.featureText}>Self-destructing messages (coming soon)</Text>
            </View>
          </View>
        </View>

        {/* How It Works Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.sectionContent}>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Download the app</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>Create an account</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>Share your Whisper ID</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>4</Text>
              <Text style={styles.stepText}>Start chatting</Text>
            </View>
          </View>
        </View>

        {/* Contact Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity
              style={styles.contactItem}
              onPress={() => handleEmailPress('support@sarjmobile.com')}
            >
              <Text style={styles.contactLabel}>General</Text>
              <Text style={styles.contactLink}>support@sarjmobile.com</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactItem}
              onPress={() => handleEmailPress('privacy@sarjmobile.com')}
            >
              <Text style={styles.contactLabel}>Privacy</Text>
              <Text style={styles.contactLink}>privacy@sarjmobile.com</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactItem}
              onPress={() => handleEmailPress('legal@sarjmobile.com')}
            >
              <Text style={styles.contactLabel}>Legal</Text>
              <Text style={styles.contactLink}>legal@sarjmobile.com</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Website Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Website</Text>
          <TouchableOpacity
            style={styles.websiteButton}
            onPress={handleWebsitePress}
          >
            <Text style={styles.websiteText}>sarjmobile.com</Text>
            <Text style={styles.websiteIcon}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.copyright}>© 2026 Whisper. All rights reserved.</Text>
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
  backButton: {
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
    paddingBottom: spacing.xxl,
  },
  logoSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  logoContainer: {
    width: moderateScale(100),
    height: moderateScale(100),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    fontSize: moderateScale(50),
  },
  appName: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  version: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  section: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  bodyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  featureIcon: {
    fontSize: fontSize.lg,
    marginRight: spacing.md,
  },
  featureText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    flex: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  stepNumber: {
    width: moderateScale(28),
    height: moderateScale(28),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    textAlign: 'center',
    lineHeight: moderateScale(28),
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  stepText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    flex: 1,
  },
  contactItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  contactLink: {
    fontSize: fontSize.md,
    color: colors.primary,
  },
  websiteButton: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  websiteText: {
    fontSize: fontSize.md,
    color: colors.primary,
  },
  websiteIcon: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  copyright: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
