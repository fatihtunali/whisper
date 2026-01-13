import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ForwardMessageRouteProp = RouteProp<RootStackParamList, 'ForwardMessage'>;

export default function ForwardMessageScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ForwardMessageRouteProp>();
  const insets = useSafeAreaInsets();

  const { content } = route.params;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendingToId, setSendingToId] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = contacts.filter(contact => {
        const displayName = contact.nickname || contact.username || contact.whisperId;
        return displayName.toLowerCase().includes(query) ||
               contact.whisperId.toLowerCase().includes(query);
      });
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  const loadContacts = async () => {
    const contactList = await secureStorage.getContacts();
    // Filter out blocked contacts and sort by name
    const activeContacts = contactList
      .filter(c => !c.isBlocked)
      .sort((a, b) => {
        const nameA = a.nickname || a.username || a.whisperId;
        const nameB = b.nickname || b.username || b.whisperId;
        return nameA.localeCompare(nameB);
      });
    setContacts(activeContacts);
    setFilteredContacts(activeContacts);
  };

  const handleForward = async (contact: Contact) => {
    if (isSending) return;

    setIsSending(true);
    setSendingToId(contact.whisperId);

    try {
      // Forward the message (re-encrypted for the new recipient)
      await messagingService.forwardMessage(contact, content);

      // Navigate to the chat with the recipient
      navigation.replace('Chat', { contactId: contact.whisperId });
    } catch (error) {
      console.error('Failed to forward message:', error);
      Alert.alert('Error', 'Failed to forward message. Please try again.');
      setIsSending(false);
      setSendingToId(null);
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const displayName = item.nickname || item.username || item.whisperId;
    const isCurrentlySending = sendingToId === item.whisperId;

    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => handleForward(item)}
        disabled={isSending}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{displayName}</Text>
          <Text style={styles.contactId}>{item.whisperId}</Text>
        </View>
        {isCurrentlySending && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  const getMessagePreview = (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          disabled={isSending}
        >
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Forward To</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Message Preview */}
      <View style={styles.messagePreview}>
        <Text style={styles.messagePreviewLabel}>Message:</Text>
        <Text style={styles.messagePreviewText} numberOfLines={2}>
          {getMessagePreview(content)}
        </Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search contacts..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.clearButtonText}>X</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Contact List */}
      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.whisperId}
        renderItem={renderContact}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchQuery ? 'No contacts found' : 'No contacts to forward to'}
            </Text>
          </View>
        }
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  closeButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerPlaceholder: {
    width: 60,
  },
  messagePreview: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  messagePreviewLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  messagePreviewText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontStyle: 'italic',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearButtonText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  listContent: {
    flexGrow: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyStateText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
