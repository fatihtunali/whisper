import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Conversation, Contact, Message, Group, GroupConversation } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale, scaleFontSize } from '../utils/responsive';
import { formatTime, getInitials, truncate } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Combined chat item for both 1:1 and group conversations
interface ChatListItem {
  id: string;
  type: 'direct' | 'group';
  displayName: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: number;
  contactId?: string;  // For direct chats
  groupId?: string;    // For group chats
  isMessageRequest?: boolean; // True if this is from an unknown sender
}

export default function ChatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [chatItems, setChatItems] = useState<ChatListItem[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [groups, setGroups] = useState<Record<string, Group>>({});

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Listen for incoming messages to refresh the list in real-time
  useEffect(() => {
    const handleIncomingMessage = (message: Message, contact: Contact) => {
      console.log('[ChatsScreen] New message received, refreshing...');
      loadData();
    };

    const handleGroupMessage = (message: Message, group: Group) => {
      console.log('[ChatsScreen] New group message received, refreshing...');
      loadData();
    };

    const handleGroupUpdate = (groupId: string, updates: Partial<Group>) => {
      console.log('[ChatsScreen] Group updated, refreshing...');
      loadData();
    };

    messagingService.addMessageHandler(handleIncomingMessage);
    messagingService.addGroupMessageHandler(handleGroupMessage);
    messagingService.addGroupUpdateHandler(handleGroupUpdate);

    return () => {
      messagingService.removeMessageHandler(handleIncomingMessage);
      messagingService.removeGroupMessageHandler(handleGroupMessage);
      messagingService.removeGroupUpdateHandler(handleGroupUpdate);
    };
  }, []);

  const loadData = async () => {
    // Load direct conversations
    const convos = await secureStorage.getConversations();
    const contactList = await secureStorage.getContacts();

    const contactMap: Record<string, Contact> = {};
    contactList.forEach(c => {
      contactMap[c.whisperId] = c;
    });
    setContacts(contactMap);

    // Load group conversations
    const groupConvos = await secureStorage.getGroupConversations();
    const groupList = await secureStorage.getGroups();

    const groupMap: Record<string, Group> = {};
    groupList.forEach(g => {
      groupMap[g.id] = g;
    });
    setGroups(groupMap);

    // Combine into unified chat list
    const items: ChatListItem[] = [];

    // Add direct conversations
    for (const conv of convos) {
      const contact = contactMap[conv.contactId];
      items.push({
        id: conv.id,
        type: 'direct',
        displayName: contact?.nickname || contact?.username || conv.contactId,
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount,
        updatedAt: conv.updatedAt,
        contactId: conv.contactId,
        isMessageRequest: contact?.isMessageRequest,
      });
    }

    // Add group conversations
    for (const groupConv of groupConvos) {
      const group = groupMap[groupConv.groupId];
      if (group) {
        items.push({
          id: groupConv.id,
          type: 'group',
          displayName: group.name,
          lastMessage: groupConv.lastMessage,
          unreadCount: groupConv.unreadCount,
          updatedAt: groupConv.updatedAt,
          groupId: groupConv.groupId,
        });
      }
    }

    // Sort by updatedAt descending
    items.sort((a, b) => b.updatedAt - a.updatedAt);

    setChatItems(items);
  };

  const handleDeleteChat = (item: ChatListItem) => {
    const title = item.type === 'group' ? 'Delete Group Chat' : 'Delete Chat';
    const message = item.type === 'group'
      ? `Delete conversation in ${item.displayName}? All messages will be permanently removed.`
      : `Delete conversation with ${item.displayName}? All messages will be permanently removed.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (item.type === 'group' && item.groupId) {
            await secureStorage.deleteGroupConversation(item.groupId);
          } else if (item.contactId) {
            await secureStorage.deleteConversation(item.contactId);
          }
          loadData();
        },
      },
    ]);
  };

  const handleChatPress = (item: ChatListItem) => {
    if (item.type === 'group' && item.groupId) {
      navigation.navigate('GroupChat', { groupId: item.groupId });
    } else if (item.contactId) {
      navigation.navigate('Chat', { contactId: item.contactId });
    }
  };

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    // Get last message content, handling group messages with sender name
    let messagePreview = 'No messages yet';
    if (item.lastMessage) {
      if (item.type === 'group' && item.lastMessage.senderName) {
        messagePreview = `${item.lastMessage.senderName}: ${item.lastMessage.content}`;
      } else {
        messagePreview = item.lastMessage.content;
      }
    }

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => handleChatPress(item)}
        onLongPress={() => handleDeleteChat(item)}
        delayLongPress={500}
      >
        <View style={[styles.avatar, item.type === 'group' && styles.groupAvatar]}>
          <Text style={styles.avatarText}>{getInitials(item.displayName)}</Text>
        </View>
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <View style={styles.nameRow}>
              {item.type === 'group' && (
                <Text style={styles.groupIcon}>GR </Text>
              )}
              <Text style={styles.conversationName} numberOfLines={1}>
                {item.displayName}
              </Text>
              {item.isMessageRequest && (
                <View style={styles.messageRequestBadge}>
                  <Text style={styles.messageRequestText}>Request</Text>
                </View>
              )}
            </View>
            {item.lastMessage && (
              <Text style={styles.conversationTime}>
                {formatTime(item.lastMessage.timestamp)}
              </Text>
            )}
          </View>
          <View style={styles.conversationFooter}>
            <Text style={styles.conversationMessage} numberOfLines={1}>
              {messagePreview}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>--</Text>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySubtitle}>
        Add a contact or create a group to start messaging
      </Text>
      <View style={styles.emptyButtons}>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => navigation.navigate('AddContact')}
        >
          <Text style={styles.emptyButtonText}>Add Contact</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.emptyButton, styles.emptyButtonSecondary]}
          onPress={() => navigation.navigate('CreateGroup')}
        >
          <Text style={styles.emptyButtonText}>New Group</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerButton, styles.headerButtonSecondary]}
            onPress={() => navigation.navigate('CreateGroup')}
          >
            <Text style={styles.headerButtonText}>GR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('AddContact')}
          >
            <Text style={styles.headerButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat List */}
      <FlatList
        data={chatItems}
        keyExtractor={(item) => item.id}
        renderItem={renderChatItem}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={chatItems.length === 0 ? styles.emptyContainer : undefined}
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    width: moderateScale(36),
    height: moderateScale(36),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonSecondary: {
    backgroundColor: colors.surface,
  },
  headerButtonText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
  },
  conversationItem: {
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
  groupAvatar: {
    backgroundColor: colors.surface,
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  groupIcon: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  conversationName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  conversationTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationMessage: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    minWidth: moderateScale(20),
    height: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  unreadText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
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
    textAlign: 'center',
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  emptyButtonSecondary: {
    backgroundColor: colors.surface,
  },
  emptyButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  messageRequestBadge: {
    backgroundColor: colors.warning || '#F59E0B',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginLeft: spacing.xs,
  },
  messageRequestText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#000',
  },
});
