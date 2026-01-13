import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Message, Group, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { useAuth } from '../context/AuthContext';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { formatTime, getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type GroupChatRouteProp = RouteProp<RootStackParamList, 'GroupChat'>;

export default function GroupChatScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<GroupChatRouteProp>();
  const insets = useSafeAreaInsets();
  const { user, isConnected } = useAuth();
  const { groupId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [inputText, setInputText] = useState('');
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const flatListRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [groupId])
  );

  // Set up message handlers
  useEffect(() => {
    const handleGroupMessage = (message: Message, msgGroup: Group) => {
      if (msgGroup.id === groupId) {
        setMessages(prev => [message, ...prev]);
      }
    };

    const handleGroupUpdate = (updatedGroupId: string, updates: Partial<Group>) => {
      if (updatedGroupId === groupId) {
        setGroup(prev => prev ? { ...prev, ...updates } : null);

        // If we were removed from the group
        if (updates.members && !updates.members.includes(user?.whisperId || '')) {
          Alert.alert(
            'Removed from Group',
            'You have been removed from this group.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      }
    };

    messagingService.addGroupMessageHandler(handleGroupMessage);
    messagingService.addGroupUpdateHandler(handleGroupUpdate);

    return () => {
      messagingService.removeGroupMessageHandler(handleGroupMessage);
      messagingService.removeGroupUpdateHandler(handleGroupUpdate);
    };
  }, [groupId, user?.whisperId, navigation]);

  const loadData = async () => {
    // Load group
    const loadedGroup = await secureStorage.getGroup(groupId);
    if (!loadedGroup) {
      Alert.alert('Error', 'Group not found');
      navigation.goBack();
      return;
    }
    setGroup(loadedGroup);

    // Load messages
    const loadedMessages = await secureStorage.getGroupMessages(groupId);
    setMessages(loadedMessages.reverse());

    // Load member names
    const names = new Map<string, string>();
    const contacts = await secureStorage.getContacts();
    for (const member of loadedGroup.members) {
      const contact = contacts.find(c => c.whisperId === member);
      if (contact) {
        names.set(member, contact.nickname || contact.username || member);
      } else if (member === user?.whisperId) {
        names.set(member, 'You');
      } else {
        names.set(member, member);
      }
    }
    setMemberNames(names);

    // Reset unread count
    await secureStorage.updateGroupConversation(groupId, { unreadCount: 0 });
  };

  const handleSend = async () => {
    if (!inputText.trim() || !group || !user) return;

    const text = inputText.trim();
    setInputText('');

    try {
      const message = await messagingService.sendGroupMessage(group, text);
      setMessages(prev => [message, ...prev]);
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const getMemberName = (whisperId: string): string => {
    return memberNames.get(whisperId) || whisperId;
  };

  // Delete a single message
  const handleDeleteMessage = useCallback(async (message: Message) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setMessages(prev => prev.filter(m => m.id !== message.id));
            await secureStorage.deleteGroupMessage(groupId, message.id);
          },
        },
      ]
    );
  }, [groupId]);

  // Render the swipeable delete action
  const renderRightActions = useCallback((
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    message: Message
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.swipeDeleteButton}
        onPress={() => handleDeleteMessage(message)}
      >
        <Animated.Text style={[styles.swipeDeleteText, { transform: [{ scale }] }]}>
          Delete
        </Animated.Text>
      </TouchableOpacity>
    );
  }, [handleDeleteMessage]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.senderId === user?.whisperId;
    const senderName = item.senderName || getMemberName(item.senderId);

    return (
      <Swipeable
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        rightThreshold={40}
        overshootRight={false}
      >
        <View style={[styles.messageWrapper, isOwn && styles.messageWrapperOwn]}>
          {!isOwn && (
            <View style={styles.senderAvatarContainer}>
              <View style={styles.senderAvatar}>
                <Text style={styles.senderAvatarText}>{getInitials(senderName)}</Text>
              </View>
            </View>
          )}
          <View style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}>
            {!isOwn && (
              <Text style={styles.senderName}>{senderName}</Text>
            )}
            <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>
              {item.content}
            </Text>
            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
                {formatTime(item.timestamp)}
              </Text>
              {isOwn && (
                <Text style={styles.messageStatus}>
                  {item.status === 'sending' && '..'}
                  {item.status === 'sent' && 'OK'}
                  {item.status === 'delivered' && 'OK OK'}
                  {item.status === 'failed' && '!'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </Swipeable>
    );
  };

  if (!group) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => navigation.navigate('GroupInfo', { groupId })}
        >
          <View style={styles.groupAvatar}>
            <Text style={styles.groupAvatarText}>{getInitials(group.name)}</Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group.name}
            </Text>
            <Text style={styles.headerSubtitle}>
              {group.members.length} members
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {!isConnected && (
            <View style={styles.offlineIndicator}>
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!inputText.trim()}
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendButtonText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
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
    padding: spacing.sm,
    marginRight: spacing.xs,
  },
  backText: {
    fontSize: fontSize.xl,
    color: colors.primary,
    fontWeight: '600',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupAvatar: {
    width: moderateScale(40),
    height: moderateScale(40),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  groupAvatarText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  headerRight: {
    marginLeft: spacing.sm,
  },
  offlineIndicator: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  offlineText: {
    fontSize: fontSize.xs,
    color: colors.text,
  },
  messageList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  messageWrapperOwn: {
    alignSelf: 'flex-end',
  },
  senderAvatarContainer: {
    marginRight: spacing.xs,
    alignSelf: 'flex-end',
  },
  senderAvatar: {
    width: moderateScale(28),
    height: moderateScale(28),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  messageBubble: {
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    maxWidth: '100%',
  },
  ownMessage: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
  },
  otherMessage: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: spacing.xs,
  },
  senderName: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: fontSize.md * 1.4,
  },
  ownMessageText: {
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
  ownMessageTime: {
    color: colors.textSecondary,
  },
  messageStatus: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  textInput: {
    flex: 1,
    minHeight: moderateScale(40),
    maxHeight: moderateScale(100),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  sendButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '700',
  },
  // Swipe to delete styles
  swipeDeleteButton: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: moderateScale(80),
    marginVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  swipeDeleteText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
