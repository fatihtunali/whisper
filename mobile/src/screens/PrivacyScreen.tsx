import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

export default function PrivacyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Last Updated */}
        <Text style={styles.lastUpdated}>Last updated: January 12, 2026</Text>

        {/* Introduction */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Introduction</Text>
          <Text style={styles.sectionText}>
            Whisper is built with privacy as our core principle. We believe your conversations
            should remain private, and we've designed our app to ensure we know as little about
            you as possible. This policy explains what information is (and isn't) collected and
            how your data is protected.
          </Text>
        </View>

        {/* Information We Do NOT Collect */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information We Do NOT Collect</Text>
          <Text style={styles.sectionText}>
            Whisper is designed to minimize data collection. We do NOT collect:{'\n\n'}
            {'\u2022'} Phone numbers{'\n'}
            {'\u2022'} Email addresses{'\n'}
            {'\u2022'} Names or personal identifiers{'\n'}
            {'\u2022'} Message content{'\n'}
            {'\u2022'} Contact lists{'\n'}
            {'\u2022'} Location data{'\n'}
            {'\u2022'} IP addresses{'\n'}
            {'\u2022'} Message metadata (who talks to whom){'\n'}
            {'\u2022'} Analytics or usage tracking data
          </Text>
        </View>

        {/* Information Stored Locally */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information Stored Locally</Text>
          <Text style={styles.sectionText}>
            The following information is stored only on your device and never transmitted to
            our servers:{'\n\n'}
            {'\u2022'} Your Whisper ID (anonymous identifier){'\n'}
            {'\u2022'} Your cryptographic keys{'\n'}
            {'\u2022'} Your 12-word recovery phrase{'\n'}
            {'\u2022'} Your messages (encrypted){'\n'}
            {'\u2022'} Your contacts list
          </Text>
        </View>

        {/* End-to-End Encryption */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>End-to-End Encryption</Text>
          <Text style={styles.sectionText}>
            All messages in Whisper are end-to-end encrypted. This means only you and the
            intended recipient can read your messages. Not even we can access the content of
            your conversations.{'\n\n'}
            Even if compelled by legal authorities, we cannot provide message content because
            we simply do not have the technical ability to decrypt your messages.
          </Text>
        </View>

        {/* Data Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Security</Text>
          <Text style={styles.sectionText}>
            Whisper uses industry-leading cryptographic standards:{'\n\n'}
            {'\u2022'} X25519 for key exchange{'\n'}
            {'\u2022'} XSalsa20-Poly1305 for message encryption{'\n'}
            {'\u2022'} Cryptographically secure random number generation (CSPRNG){'\n\n'}
            Your private keys never leave your device and are stored in secure encrypted storage.
          </Text>
        </View>

        {/* Message Relay */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Message Relay</Text>
          <Text style={styles.sectionText}>
            When you send a message and the recipient is offline, the encrypted message is
            temporarily stored on our relay servers for up to 72 hours. These messages are
            fully encrypted and cannot be read by us. Once delivered or after 72 hours,
            messages are permanently deleted from our servers.
          </Text>
        </View>

        {/* Account Recovery */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Recovery</Text>
          <Text style={styles.sectionText}>
            Your account can only be recovered using your 12-word recovery phrase. This phrase
            is generated on your device and never transmitted to our servers.{'\n\n'}
            Important: If you lose your recovery phrase, we cannot help you recover your
            account. Please store it securely.
          </Text>
        </View>

        {/* Children's Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Children's Privacy</Text>
          <Text style={styles.sectionText}>
            Whisper is not intended for use by children under 13 years of age. We do not
            knowingly collect any information from children. If you believe a child has used
            Whisper, please contact us.
          </Text>
        </View>

        {/* Changes to Policy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Changes to This Policy</Text>
          <Text style={styles.sectionText}>
            We may update this Privacy Policy from time to time. We will notify you of any
            changes by posting the new policy in the app and updating the "Last updated" date
            at the top of this page.
          </Text>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.sectionText}>
            If you have any questions about this Privacy Policy, please contact us at:{'\n\n'}
            privacy@sarjmobile.com
          </Text>
        </View>

        {/* Footer spacing */}
        <View style={styles.footer} />
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
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  backButtonText: {
    fontSize: fontSize.xl,
    color: colors.text,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    padding: spacing.lg,
  },
  lastUpdated: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  footer: {
    height: spacing.xxl,
  },
});
