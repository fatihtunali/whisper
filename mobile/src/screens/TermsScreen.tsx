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

export default function TermsScreen() {
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
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: January 12, 2026</Text>

        {/* Section 1 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.sectionBody}>
            By downloading, installing, or using the Whisper application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App. These Terms constitute a legally binding agreement between you and Sarj Mobile ("Company", "we", "us", or "our").
          </Text>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Description of Service</Text>
          <Text style={styles.sectionBody}>
            Whisper is a private, end-to-end encrypted messaging application designed for secure communication. The App allows users to send and receive encrypted messages, manage contacts, and maintain their privacy. We do not store your messages on our servers, and we cannot read or access the content of your communications.
          </Text>
        </View>

        {/* Section 3 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Account Registration</Text>
          <Text style={styles.sectionBody}>
            When you create an account, you will be assigned a unique Whisper ID and provided with a recovery phrase (seed phrase). You are solely responsible for maintaining the confidentiality of your recovery phrase. We cannot recover your account if you lose your recovery phrase. You must be at least 13 years of age to use this App.
          </Text>
        </View>

        {/* Section 4 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. User Responsibilities</Text>
          <Text style={styles.sectionBody}>
            You are responsible for all activities that occur under your account. You agree to use the App only for lawful purposes and in accordance with these Terms. You are responsible for ensuring that your use of the App complies with all applicable laws and regulations in your jurisdiction.
          </Text>
        </View>

        {/* Section 5 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Prohibited Activities</Text>
          <Text style={styles.sectionBody}>
            You may not use the App to: (a) violate any applicable laws or regulations; (b) transmit any material that is unlawful, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable; (c) impersonate any person or entity; (d) interfere with or disrupt the App or servers; (e) attempt to gain unauthorized access to any systems or networks; (f) engage in any activity that could harm minors; or (g) transmit any viruses, malware, or other malicious code.
          </Text>
        </View>

        {/* Section 6 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Privacy</Text>
          <Text style={styles.sectionBody}>
            Your privacy is important to us. We collect minimal data necessary to provide the service. We do not collect, store, or have access to your messages, contacts, or personal communications. For more information, please review our Privacy Policy. By using the App, you consent to our collection and use of information as described in the Privacy Policy.
          </Text>
        </View>

        {/* Section 7 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Encryption and Security</Text>
          <Text style={styles.sectionBody}>
            All messages sent through Whisper are protected by end-to-end encryption using industry-standard cryptographic protocols. This means only you and your intended recipients can read your messages. We cannot decrypt your messages, and we do not hold encryption keys. While we implement strong security measures, no system is completely secure, and we cannot guarantee absolute security.
          </Text>
        </View>

        {/* Section 8 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
          <Text style={styles.sectionBody}>
            The App and its original content, features, and functionality are owned by Sarj Mobile and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the App without our express written permission.
          </Text>
        </View>

        {/* Section 9 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Disclaimer of Warranties</Text>
          <Text style={styles.sectionBody}>
            THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
          </Text>
        </View>

        {/* Section 10 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
          <Text style={styles.sectionBody}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SARJ MOBILE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE APP.
          </Text>
        </View>

        {/* Section 11 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Termination</Text>
          <Text style={styles.sectionBody}>
            We may terminate or suspend your access to the App immediately, without prior notice or liability, for any reason whatsoever, including if you breach these Terms. Upon termination, your right to use the App will immediately cease. All provisions of these Terms which by their nature should survive termination shall survive.
          </Text>
        </View>

        {/* Section 12 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>12. Contact</Text>
          <Text style={styles.sectionBody}>
            If you have any questions about these Terms of Service, please contact us at legal@sarjmobile.com. We will make reasonable efforts to respond to your inquiries in a timely manner.
          </Text>
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
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
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
    textAlign: 'center',
  },
  headerSpacer: {
    width: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
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
  sectionBody: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});
