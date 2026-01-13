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

export default function ChildSafetyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const handleEmailPress = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
  };

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
        <Text style={styles.headerTitle}>Child Safety</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Last Updated */}
        <Text style={styles.lastUpdated}>Last updated: January 12, 2026</Text>

        {/* Our Commitment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Commitment</Text>
          <Text style={styles.bodyText}>
            Whisper has zero tolerance for child sexual abuse and exploitation (CSAE).
            We are committed to protecting children and young people who use our platform.
            We work proactively to prevent, detect, and remove any content or behavior
            that exploits or endangers minors.
          </Text>
        </View>

        {/* Age Restriction */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Age Restriction</Text>
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>13+ Only</Text>
            <Text style={styles.warningText}>
              Whisper is only available to users aged 13 and older. Users under 13 are
              prohibited from creating an account or using our services. We reserve the
              right to terminate accounts of users who misrepresent their age.
            </Text>
          </View>
        </View>

        {/* Prohibited Content */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prohibited Content</Text>
          <Text style={styles.bodyText}>
            The following content and behaviors are strictly prohibited and will result
            in immediate action:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Child sexual abuse material (CSAM) of any kind
            </Text>
            <Text style={styles.bulletItem}>
              • Grooming or attempts to build inappropriate relationships with minors
            </Text>
            <Text style={styles.bulletItem}>
              • Sexualized content involving or depicting minors
            </Text>
            <Text style={styles.bulletItem}>
              • Child trafficking or exploitation
            </Text>
            <Text style={styles.bulletItem}>
              • Any content that sexualizes, endangers, or harms children
            </Text>
            <Text style={styles.bulletItem}>
              • Solicitation of minors for inappropriate purposes
            </Text>
          </View>
        </View>

        {/* Detection and Prevention */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detection and Prevention</Text>
          <Text style={styles.bodyText}>
            We employ multiple measures to detect and prevent child exploitation:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • In-app reporting system for users to flag concerning content or behavior
            </Text>
            <Text style={styles.bulletItem}>
              • User blocking capabilities to prevent unwanted contact
            </Text>
            <Text style={styles.bulletItem}>
              • Prompt review of all reported content within 24 hours
            </Text>
            <Text style={styles.bulletItem}>
              • Immediate account termination for policy violations
            </Text>
            <Text style={styles.bulletItem}>
              • Cooperation with law enforcement agencies worldwide
            </Text>
          </View>
        </View>

        {/* How to Report */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to Report</Text>
          <Text style={styles.bodyText}>
            If you encounter any content or behavior that violates our child safety
            policies, please report it immediately:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Use the in-app report feature to flag content or users
            </Text>
            <Text style={styles.bulletItem}>
              • Email us directly at:{' '}
              <Text
                style={styles.linkText}
                onPress={() => handleEmailPress('childsafety@sarjmobile.com')}
              >
                childsafety@sarjmobile.com
              </Text>
            </Text>
          </View>
          <Text style={[styles.bodyText, styles.marginTop]}>
            You can also report to external organizations:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              •{' '}
              <Text
                style={styles.linkText}
                onPress={() => handleLinkPress('https://www.missingkids.org/gethelpnow/cybertipline')}
              >
                NCMEC CyberTipline
              </Text>
              {' '}(National Center for Missing & Exploited Children)
            </Text>
            <Text style={styles.bulletItem}>
              •{' '}
              <Text
                style={styles.linkText}
                onPress={() => handleLinkPress('https://www.iwf.org.uk/')}
              >
                Internet Watch Foundation (IWF)
              </Text>
            </Text>
          </View>
        </View>

        {/* Response Procedures */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Response Procedures</Text>
          <Text style={styles.bodyText}>
            When we receive a report of potential child exploitation, we follow these
            procedures:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • All reports are reviewed within 24 hours by our safety team
            </Text>
            <Text style={styles.bulletItem}>
              • Immediate suspension of accounts involved in violations
            </Text>
            <Text style={styles.bulletItem}>
              • Reports to NCMEC for confirmed CSAM or exploitation
            </Text>
            <Text style={styles.bulletItem}>
              • Permanent ban of violating accounts with no appeal
            </Text>
            <Text style={styles.bulletItem}>
              • Cooperation with law enforcement investigations
            </Text>
          </View>
        </View>

        {/* Safety Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Tips</Text>
          <Text style={styles.bodyText}>
            We encourage all users, especially young users, to follow these safety
            guidelines:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Never share personal information such as your real name, address,
              phone number, or school with strangers
            </Text>
            <Text style={styles.bulletItem}>
              • Block and report anyone who makes you uncomfortable or sends
              inappropriate messages
            </Text>
            <Text style={styles.bulletItem}>
              • Trust your instincts - if something feels wrong, it probably is
            </Text>
            <Text style={styles.bulletItem}>
              • Talk to a trusted adult if you encounter anything concerning
            </Text>
            <Text style={styles.bulletItem}>
              • Never agree to meet someone in person that you only know online
            </Text>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <Text style={styles.bodyText}>
            For any questions or concerns about child safety on Whisper, please contact
            our dedicated Child Safety team:
          </Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={() => handleEmailPress('childsafety@sarjmobile.com')}
          >
            <Text style={styles.contactButtonText}>childsafety@sarjmobile.com</Text>
          </TouchableOpacity>
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
  bodyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  marginTop: {
    marginTop: spacing.md,
  },
  warningBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  warningTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.error,
    marginBottom: spacing.sm,
  },
  warningText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  bulletList: {
    marginTop: spacing.sm,
  },
  bulletItem: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
  },
  linkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  contactButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  contactButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  footer: {
    height: spacing.xxl,
  },
});
