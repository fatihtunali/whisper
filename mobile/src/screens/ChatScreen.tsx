import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ViewToken,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Message, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { useAuth } from '../context/AuthContext';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { formatTime, getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

export default function ChatScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ChatRouteProp>();
  const insets = useSafeAreaInsets();
  const { user, isConnected } = useAuth();
  const { contactId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadData();
  }, [contactId]);

  // Set up message handlers
  useEffect(() => {
    // Handle incoming messages
    const handleIncomingMessage = (message: Message, msgContact: Contact) => {
      if (msgContact.whisperId === contactId) {
        setMessages(prev => [message, ...prev]);
      }
    };

    // Handle status updates for our sent messages
    const handleStatusUpdate = async (messageId: string, status: Message['status']) => {
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, status } : m))
      );
      await secureStorage.updateMessageStatus(contactId, messageId, status);
    };

    messagingService.setOnMessageReceived(handleIncomingMessage);
    messagingService.setOnStatusUpdate(handleStatusUpdate);

    return () => {
      messagingService.setOnMessageReceived(null);
      messagingService.setOnStatusUpdate(null);
    };
  }, [contactId]);

  const loadData = async () => {
    const contactData = await secureStorage.getContact(contactId);
    setContact(contactData);

    // Ensure conversation exists
    await secureStorage.getOrCreateConversation(contactId);

    const msgs = await secureStorage.getMessages(contactId);
    setMessages(msgs.reverse());
  };

  // Use refs to keep track of current values for the viewability callback
  const messagesRef = useRef<Message[]>([]);
  const userRef = useRef(user);
  const contactIdRef = useRef(contactId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    contactIdRef.current = contactId;
  }, [contactId]);

  // Stable viewability config - must not change
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Stable callback ref for onViewableItemsChanged
  const onViewableItemsChanged = useRef(
    async ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const currentUser = userRef.current;
      const currentMessages = messagesRef.current;
      const currentContactId = contactIdRef.current;

      if (!currentUser) return;

      const visibleIds = viewableItems
        .filter(item => item.isViewable && item.item)
        .map(item => (item.item as Message).id);

      if (visibleIds.length === 0) return;

      const unreadFromOthers = currentMessages.filter(
        m => visibleIds.includes(m.id) &&
             m.senderId !== currentUser.whisperId &&
             m.status !== 'read'
      );

      if (unreadFromOthers.length === 0) return;

      // Mark each visible message as read
      for (const msg of unreadFromOthers) {
        await secureStorage.updateMessageStatus(currentContactId, msg.id, 'read');
        // Send read receipt to the sender via server
        messagingService.sendDeliveryReceipt(msg.senderId, msg.id, 'read');
      }

      // Update unread count
      await secureStorage.updateConversation(currentContactId, { unreadCount: 0 });

      // Update local state
      setMessages(prev => prev.map(m =>
        unreadFromOthers.find(u => u.id === m.id) ? { ...m, status: 'read' } : m
      ));

      console.log('Messages marked as read (visible):', unreadFromOthers.map(m => m.id));
    }
  ).current;

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !contact) return;

    const content = inputText.trim();
    setInputText('');

    try {
      // Send via messaging service (handles encryption and WebSocket)
      const sentMessage = await messagingService.sendMessage(contact, content);

      // Add to local state
      setMessages(prev => [sentMessage, ...prev]);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Could show an error toast here
    }
  };

  const displayName = contact?.nickname || contact?.username || contactId;

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === user?.whisperId;

    return (
      <View style={[styles.messageContainer, isMine && styles.messageContainerMine]}>
        <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs]}>
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
              {formatTime(item.timestamp)}
            </Text>
            {isMine && (
              <Text style={[
                styles.messageStatus,
                item.status === 'read' && styles.messageStatusRead
              ]}>
                {item.status === 'sending' && '○'}
                {item.status === 'sent' && '✓'}
                {item.status === 'delivered' && '✓✓'}
                {item.status === 'read' && '✓✓'}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{getInitials(displayName)}</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.headerStatus, !isConnected && styles.headerStatusOffline]}>
              {isConnected ? 'Encrypted' : 'Offline'}
            </Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messagesList}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                Messages are end-to-end encrypted.{'\n'}
                Start the conversation!
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendButtonText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: fontSize.xxl,
    color: colors.primary,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerAvatarText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  headerName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  headerStatus: {
    fontSize: fontSize.xs,
    color: colors.success,
  },
  headerStatusOffline: {
    color: colors.textMuted,
  },
  headerSpacer: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageContainer: {
    marginVertical: spacing.xs,
    flexDirection: 'row',
  },
  messageContainerMine: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  messageBubbleMine: {
    backgroundColor: colors.messageSent,
    borderBottomRightRadius: spacing.xs,
  },
  messageBubbleTheirs: {
    backgroundColor: colors.messageReceived,
    borderBottomLeftRadius: spacing.xs,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  messageTextMine: {
    color: colors.text,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  messageTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  messageTimeMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  messageStatus: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    marginLeft: spacing.xs,
  },
  messageStatusRead: {
    color: '#60a5fa', // Blue color for read status
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: fontSize.xl,
    color: colors.text,
    fontWeight: '600',
  },
});
