import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Contact, Message } from '../types';
import { generateId } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { secureStorage } from '../storage/SecureStorage';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out? Make sure you have your recovery phrase saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete all your data from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'You will lose all messages and contacts. You can recover your identity with your seed phrase, but your messages will be gone forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: logout,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleAddTestContacts = async () => {
    const testContacts: Contact[] = [
      {
        whisperId: 'WSP-A1B2-C3D4-E5F6',
        publicKey: 'dGVzdC1hbGljZS1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVk',
        username: 'Alice',
        nickname: 'Alice (Test)',
        addedAt: Date.now(),
      },
      {
        whisperId: 'WSP-X7Y8-Z9W0-V1U2',
        publicKey: 'dGVzdC1ib2ItcHVibGljLWtleS1iYXNlNjQtZW5jb2RlZA==',
        username: 'Bob',
        nickname: 'Bob (Test)',
        addedAt: Date.now(),
      },
      {
        whisperId: 'WSP-M3N4-P5Q6-R7S8',
        publicKey: 'dGVzdC1jaGFybGllLXB1YmxpYy1rZXktYmFzZTY0LWVuYw==',
        username: 'Charlie',
        nickname: 'Charlie (Test)',
        addedAt: Date.now(),
      },
      {
        whisperId: 'WSP-T1U2-V3W4-X5Y6',
        publicKey: 'dGVzdC1kaWFuYS1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVk',
        username: 'Diana',
        nickname: 'Diana (Test)',
        addedAt: Date.now(),
      },
    ];

    try {
      for (const contact of testContacts) {
        const existing = await secureStorage.getContact(contact.whisperId);
        if (!existing) {
          await secureStorage.addContact(contact);
        }
      }
      Alert.alert('Success', 'Test contacts added! Go to Contacts to see them.');
    } catch (error) {
      Alert.alert('Error', 'Failed to add test contacts');
      console.error(error);
    }
  };

  const handleSimulateMessages = async () => {
    const testMessages = [
      {
        contactId: 'WSP-A1B2-C3D4-E5F6',
        senderName: 'Alice',
        content: 'Hey! How are you? This is a test message from Alice.',
      },
      {
        contactId: 'WSP-X7Y8-Z9W0-V1U2',
        senderName: 'Bob',
        content: 'Hi there! Bob here. Just testing the messaging feature!',
      },
      {
        contactId: 'WSP-M3N4-P5Q6-R7S8',
        senderName: 'Charlie',
        content: 'Hello! Charlie checking in. How is everyone?',
      },
      {
        contactId: 'WSP-T1U2-V3W4-X5Y6',
        senderName: 'Diana',
        content: 'Hey! Diana here. Nice to meet you on Whisper!',
      },
    ];

    try {
      for (const msg of testMessages) {
        const contact = await secureStorage.getContact(msg.contactId);
        if (!contact) {
          continue; // Skip if contact doesn't exist
        }

        const message: Message = {
          id: generateId(),
          conversationId: msg.contactId,
          senderId: msg.contactId,
          content: msg.content,
          timestamp: Date.now(),
          status: 'delivered',
        };

        await secureStorage.addMessage(msg.contactId, message);
        await secureStorage.updateConversation(msg.contactId, {
          lastMessage: message,
          updatedAt: Date.now(),
          unreadCount: 1,
        });
      }
      Alert.alert('Success', 'Test messages received! Check your Chats.');
    } catch (error) {
      Alert.alert('Error', 'Failed to simulate messages');
      console.error(error);
    }
  };

  const handleSimulateReadReceipts = async () => {
    if (!user) return;

    const testContactIds = [
      'WSP-A1B2-C3D4-E5F6',
      'WSP-X7Y8-Z9W0-V1U2',
      'WSP-M3N4-P5Q6-R7S8',
      'WSP-T1U2-V3W4-X5Y6',
    ];

    try {
      let totalMarked = 0;

      for (const contactId of testContactIds) {
        const messages = await secureStorage.getMessages(contactId);

        // Find messages sent by current user that aren't already read
        const myUnreadMessages = messages.filter(
          m => m.senderId === user.whisperId && m.status !== 'read'
        );

        // Mark each as read (simulating recipient read them)
        for (const msg of myUnreadMessages) {
          await secureStorage.updateMessageStatus(contactId, msg.id, 'read');
          totalMarked++;
        }
      }

      if (totalMarked > 0) {
        Alert.alert('Success', `${totalMarked} message(s) marked as read by recipients! Open a chat to see blue checkmarks.`);
      } else {
        Alert.alert('Info', 'No unread sent messages found. Send some messages first!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to simulate read receipts');
      console.error(error);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <TouchableOpacity
          style={styles.profileSection}
          onPress={() => navigation.navigate('Profile')}
        >
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {user?.username?.[0]?.toUpperCase() || '👤'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.username || 'Anonymous User'}
            </Text>
            <Text style={styles.profileId}>{user?.whisperId}</Text>
          </View>
          <Text style={styles.chevron}>→</Text>
        </TouchableOpacity>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('MyQR')}
          >
            <Text style={styles.menuIcon}>📱</Text>
            <Text style={styles.menuText}>My QR Code</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.menuIcon}>🔑</Text>
            <Text style={styles.menuText}>Recovery Phrase</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Security</Text>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔒</Text>
            <Text style={styles.menuText}>End-to-End Encryption</Text>
            <Text style={styles.menuStatus}>On</Text>
          </View>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>📊</Text>
            <Text style={styles.menuText}>Analytics</Text>
            <Text style={styles.menuStatus}>Off</Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>ℹ️</Text>
            <Text style={styles.menuText}>Version</Text>
            <Text style={styles.menuValue}>1.0.0</Text>
          </View>
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>📜</Text>
            <Text style={styles.menuText}>Privacy Policy</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>📋</Text>
            <Text style={styles.menuText}>Terms of Service</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Developer Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.devTitle]}>Developer</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleAddTestContacts}>
            <Text style={styles.menuIcon}>🧪</Text>
            <Text style={styles.menuText}>Add Test Contacts</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleSimulateMessages}>
            <Text style={styles.menuIcon}>📨</Text>
            <Text style={styles.menuText}>Simulate Incoming Messages</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleSimulateReadReceipts}>
            <Text style={styles.menuIcon}>👁️</Text>
            <Text style={styles.menuText}>Simulate Read Receipts</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.menuText, styles.dangerText]}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAccount}>
            <Text style={styles.menuIcon}>🗑️</Text>
            <Text style={[styles.menuText, styles.dangerText]}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Whisper</Text>
          <Text style={styles.footerSubtext}>Private. Secure. Anonymous.</Text>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  profileAvatarText: {
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  profileId: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  chevron: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  section: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    textTransform: 'uppercase',
  },
  dangerTitle: {
    color: colors.error,
  },
  devTitle: {
    color: colors.primary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  menuIcon: {
    fontSize: fontSize.lg,
    marginRight: spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  dangerText: {
    color: colors.error,
  },
  menuStatus: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '500',
  },
  menuValue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textMuted,
  },
  footerSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
