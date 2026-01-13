import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale, scaleFontSize } from '../utils/responsive';
import { getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ContactsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadContacts();
    }, [])
  );

  const loadContacts = async () => {
    const contactList = await secureStorage.getContacts();
    // Sort by name
    contactList.sort((a, b) => {
      const nameA = a.nickname || a.username || a.whisperId;
      const nameB = b.nickname || b.username || b.whisperId;
      return nameA.localeCompare(nameB);
    });
    setContacts(contactList);
  };

  const handleContactPress = (contact: Contact) => {
    navigation.navigate('Chat', { contactId: contact.whisperId });
  };

  const handleContactLongPress = (contact: Contact) => {
    Alert.alert(
      contact.nickname || contact.username || contact.whisperId,
      'What would you like to do?',
      [
        {
          text: 'Message',
          onPress: () => navigation.navigate('Chat', { contactId: contact.whisperId }),
        },
        {
          text: 'Delete Contact',
          style: 'destructive',
          onPress: () => confirmDelete(contact),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const confirmDelete = (contact: Contact) => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete ${contact.nickname || contact.username || contact.whisperId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await secureStorage.deleteContact(contact.whisperId);
            loadContacts();
          },
        },
      ]
    );
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const displayName = item.nickname || item.username || item.whisperId;

    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => handleContactPress(item)}
        onLongPress={() => handleContactLongPress(item)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{displayName}</Text>
          <Text style={styles.contactId}>{item.whisperId}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>👥</Text>
      <Text style={styles.emptyTitle}>No contacts yet</Text>
      <Text style={styles.emptySubtitle}>
        Add contacts to start messaging
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => navigation.navigate('AddContact')}
      >
        <Text style={styles.emptyButtonText}>Add Contact</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contacts</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('MyQR')}
          >
            <Text style={styles.headerButtonIcon}>📱</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, styles.headerButtonPrimary]}
            onPress={() => navigation.navigate('AddContact')}
          >
            <Text style={styles.headerButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact List */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.whisperId}
        renderItem={renderContact}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={contacts.length === 0 ? styles.emptyContainer : undefined}
      />
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
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    width: moderateScale(36),
    height: moderateScale(36),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  headerButtonPrimary: {
    backgroundColor: colors.primary,
  },
  headerButtonIcon: {
    fontSize: fontSize.md,
  },
  headerButtonText: {
    fontSize: fontSize.xl,
    color: colors.text,
    fontWeight: '600',
  },
  contactItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: moderateScale(50),
    height: moderateScale(50),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  contactInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  contactId: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: scaleFontSize(64),
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
});
