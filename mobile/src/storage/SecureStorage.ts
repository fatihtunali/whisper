import * as SecureStore from 'expo-secure-store';
import { LocalUser, Contact, Conversation, Message, Group, GroupConversation } from '../types';

// Safe JSON parse helper - returns null on parse failure instead of crashing
function safeJsonParse<T>(data: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    console.error('[SecureStorage] JSON parse error:', error);
    return fallback;
  }
}

const KEYS = {
  USER: 'whisper_user',
  CONTACTS: 'whisper_contacts',
  CONVERSATIONS: 'whisper_conversations',
  MESSAGES_PREFIX: 'whisper_messages_',
  PRIVACY_SETTINGS: 'whisper_privacy_settings',
  APP_LOCK_SETTINGS: 'whisper_app_lock_settings',
  NOTIFICATION_SETTINGS: 'whisper_notification_settings',
  GROUPS: 'whisper_groups',
  GROUP_CONVERSATIONS: 'whisper_group_conversations',
  GROUP_MESSAGES_PREFIX: 'whisper_group_messages_',
};

export interface PrivacySettings {
  readReceipts: boolean;
  typingIndicator: boolean;
  showOnlineStatus: boolean;
}

export interface AppLockSettings {
  enabled: boolean;
  useBiometrics: boolean;
  pinHash?: string; // SHA-256 hash of the PIN
}

export interface NotificationSettings {
  enabled: boolean;
  messageSound: string;
  callRingtone: string;
  vibrate: boolean;
  showPreview: boolean;
}

// Available notification sounds
export const MESSAGE_SOUNDS = [
  { id: 'default', name: 'Default' },
  { id: 'chime', name: 'Chime' },
  { id: 'bell', name: 'Bell' },
  { id: 'pop', name: 'Pop' },
  { id: 'ding', name: 'Ding' },
  { id: 'whistle', name: 'Whistle' },
  { id: 'none', name: 'None (Silent)' },
];

// Available call ringtones
export const CALL_RINGTONES = [
  { id: 'default', name: 'Default' },
  { id: 'classic', name: 'Classic Ring' },
  { id: 'gentle', name: 'Gentle' },
  { id: 'urgent', name: 'Urgent' },
  { id: 'melody', name: 'Melody' },
  { id: 'vibrate', name: 'Vibrate Only' },
];

class SecureStorage {
  // User methods
  async saveUser(user: LocalUser): Promise<void> {
    await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
  }

  async getUser(): Promise<LocalUser | null> {
    const data = await SecureStore.getItemAsync(KEYS.USER);
    if (!data) return null;
    return safeJsonParse<LocalUser>(data);
  }

  async deleteUser(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.USER);
  }

  // Contact methods
  async saveContacts(contacts: Contact[]): Promise<void> {
    await SecureStore.setItemAsync(KEYS.CONTACTS, JSON.stringify(contacts));
  }

  async getContacts(): Promise<Contact[]> {
    const data = await SecureStore.getItemAsync(KEYS.CONTACTS);
    if (!data) return [];
    return safeJsonParse<Contact[]>(data, []) || [];
  }

  async addContact(contact: Contact): Promise<void> {
    const contacts = await this.getContacts();
    const exists = contacts.find(c => c.whisperId === contact.whisperId);
    if (!exists) {
      contacts.push(contact);
      await this.saveContacts(contacts);
    }
  }

  async updateContact(whisperId: string, updates: Partial<Contact>): Promise<void> {
    const contacts = await this.getContacts();
    const index = contacts.findIndex(c => c.whisperId === whisperId);
    if (index !== -1) {
      contacts[index] = { ...contacts[index], ...updates };
      await this.saveContacts(contacts);
    }
  }

  async deleteContact(whisperId: string): Promise<void> {
    const contacts = await this.getContacts();
    const filtered = contacts.filter(c => c.whisperId !== whisperId);
    await this.saveContacts(filtered);
  }

  async getContact(whisperId: string): Promise<Contact | null> {
    const contacts = await this.getContacts();
    return contacts.find(c => c.whisperId === whisperId) || null;
  }

  // Conversation methods
  async saveConversations(conversations: Conversation[]): Promise<void> {
    await SecureStore.setItemAsync(KEYS.CONVERSATIONS, JSON.stringify(conversations));
  }

  async getConversations(): Promise<Conversation[]> {
    const data = await SecureStore.getItemAsync(KEYS.CONVERSATIONS);
    if (!data) return [];
    return safeJsonParse<Conversation[]>(data, []) || [];
  }

  async getOrCreateConversation(contactId: string): Promise<Conversation> {
    const conversations = await this.getConversations();
    let conversation = conversations.find(c => c.contactId === contactId);

    if (!conversation) {
      conversation = {
        id: contactId,
        contactId,
        unreadCount: 0,
        updatedAt: Date.now(),
      };
      conversations.push(conversation);
      await this.saveConversations(conversations);
    }

    return conversation;
  }

  async updateConversation(
    contactId: string,
    updates: Partial<Conversation>
  ): Promise<void> {
    const conversations = await this.getConversations();
    const index = conversations.findIndex(c => c.contactId === contactId);

    if (index !== -1) {
      conversations[index] = { ...conversations[index], ...updates };
    } else {
      conversations.push({
        id: contactId,
        contactId,
        unreadCount: 0,
        updatedAt: Date.now(),
        ...updates,
      });
    }

    // Sort by updatedAt descending
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.saveConversations(conversations);
  }

  async deleteConversation(contactId: string): Promise<void> {
    const conversations = await this.getConversations();
    const filtered = conversations.filter(c => c.contactId !== contactId);
    await this.saveConversations(filtered);
    // Also delete messages
    await SecureStore.deleteItemAsync(KEYS.MESSAGES_PREFIX + contactId);
  }

  // Message methods
  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    await SecureStore.setItemAsync(
      KEYS.MESSAGES_PREFIX + conversationId,
      JSON.stringify(messages)
    );
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const data = await SecureStore.getItemAsync(KEYS.MESSAGES_PREFIX + conversationId);
    if (!data) return [];
    return safeJsonParse<Message[]>(data, []) || [];
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    const messages = await this.getMessages(conversationId);
    messages.push(message);
    // Keep only last 1000 messages per conversation
    if (messages.length > 1000) {
      messages.splice(0, messages.length - 1000);
    }
    await this.saveMessages(conversationId, messages);
  }

  async updateMessageStatus(
    conversationId: string,
    messageId: string,
    status: Message['status']
  ): Promise<void> {
    const messages = await this.getMessages(conversationId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      messages[index].status = status;
      await this.saveMessages(conversationId, messages);
    }
  }

  // Mark all incoming messages as read (messages not sent by currentUserId)
  async markMessagesAsRead(
    conversationId: string,
    currentUserId: string
  ): Promise<string[]> {
    const messages = await this.getMessages(conversationId);
    const markedMessageIds: string[] = [];

    let updated = false;
    for (const msg of messages) {
      // Only mark messages from others (not our own) and not already read
      if (msg.senderId !== currentUserId && msg.status !== 'read') {
        msg.status = 'read';
        markedMessageIds.push(msg.id);
        updated = true;
      }
    }

    if (updated) {
      await this.saveMessages(conversationId, messages);
      // Reset unread count
      await this.updateConversation(conversationId, { unreadCount: 0 });
    }

    return markedMessageIds; // Return IDs for sending read receipts to server
  }

  // Update a message reaction
  async updateMessageReaction(
    conversationId: string,
    messageId: string,
    oderId: string, // userId of the person who reacted
    emoji: string | null // null to remove reaction
  ): Promise<void> {
    const messages = await this.getMessages(conversationId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      const message = messages[index];
      // Initialize reactions object if it doesn't exist
      if (!message.reactions) {
        message.reactions = {};
      }

      if (emoji === null) {
        // Remove the reaction
        delete message.reactions[oderId];
      } else {
        // Add or update the reaction
        message.reactions[oderId] = emoji;
      }

      await this.saveMessages(conversationId, messages);
    }
  }

  // Delete a single message from a conversation
  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const messages = await this.getMessages(conversationId);
    const filtered = messages.filter(m => m.id !== messageId);
    await this.saveMessages(conversationId, filtered);

    // Update conversation's lastMessage if needed
    if (filtered.length > 0) {
      // Get the most recent message
      const sortedMessages = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
      await this.updateConversation(conversationId, {
        lastMessage: sortedMessages[0],
        updatedAt: sortedMessages[0].timestamp,
      });
    }
  }

  // Privacy settings methods
  async getPrivacySettings(): Promise<PrivacySettings> {
    const data = await SecureStore.getItemAsync(KEYS.PRIVACY_SETTINGS);
    if (!data) {
      // Default all to true
      return { readReceipts: true, typingIndicator: true, showOnlineStatus: true };
    }
    const settings = safeJsonParse<PrivacySettings>(data);
    if (!settings) {
      return { readReceipts: true, typingIndicator: true, showOnlineStatus: true };
    }
    // Handle migration from older versions without showOnlineStatus
    if (settings.showOnlineStatus === undefined) {
      settings.showOnlineStatus = true;
    }
    return settings;
  }

  async setPrivacySettings(settings: PrivacySettings): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PRIVACY_SETTINGS, JSON.stringify(settings));
  }

  // App lock settings methods
  async getAppLockSettings(): Promise<AppLockSettings> {
    const data = await SecureStore.getItemAsync(KEYS.APP_LOCK_SETTINGS);
    if (!data) {
      return { enabled: false, useBiometrics: false };
    }
    return safeJsonParse<AppLockSettings>(data) || { enabled: false, useBiometrics: false };
  }

  async setAppLockSettings(settings: AppLockSettings): Promise<void> {
    await SecureStore.setItemAsync(KEYS.APP_LOCK_SETTINGS, JSON.stringify(settings));
  }

  // Notification settings methods
  async getNotificationSettings(): Promise<NotificationSettings> {
    const data = await SecureStore.getItemAsync(KEYS.NOTIFICATION_SETTINGS);
    if (!data) {
      // Default settings
      return {
        enabled: true,
        messageSound: 'default',
        callRingtone: 'default',
        vibrate: true,
        showPreview: true,
      };
    }
    return safeJsonParse<NotificationSettings>(data) || {
      enabled: true,
      messageSound: 'default',
      callRingtone: 'default',
      vibrate: true,
      showPreview: true,
    };
  }

  async setNotificationSettings(settings: NotificationSettings): Promise<void> {
    await SecureStore.setItemAsync(KEYS.NOTIFICATION_SETTINGS, JSON.stringify(settings));
  }

  async clearAppLockSettings(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.APP_LOCK_SETTINGS);
  }

  // Clean up expired disappearing messages
  async cleanupExpiredMessages(): Promise<number> {
    const now = Date.now();
    let totalDeleted = 0;

    const conversations = await this.getConversations();

    for (const conv of conversations) {
      const messages = await this.getMessages(conv.id);
      const originalCount = messages.length;

      // Filter out expired messages
      const validMessages = messages.filter(msg => {
        // Keep message if it has no expiry or hasn't expired yet
        return !msg.expiresAt || msg.expiresAt > now;
      });

      const deletedCount = originalCount - validMessages.length;

      if (deletedCount > 0) {
        await this.saveMessages(conv.id, validMessages);
        totalDeleted += deletedCount;

        // Update conversation's lastMessage if it was deleted
        if (conv.lastMessage && conv.lastMessage.expiresAt && conv.lastMessage.expiresAt <= now) {
          const newLastMessage = validMessages.length > 0
            ? validMessages[validMessages.length - 1]
            : undefined;
          await this.updateConversation(conv.id, { lastMessage: newLastMessage });
        }
      }
    }

    if (totalDeleted > 0) {
      console.log(`[SecureStorage] Cleaned up ${totalDeleted} expired messages`);
    }

    return totalDeleted;
  }

  // ============ GROUP METHODS ============

  // Get all groups
  async getGroups(): Promise<Group[]> {
    const data = await SecureStore.getItemAsync(KEYS.GROUPS);
    if (!data) return [];
    return safeJsonParse<Group[]>(data, []) || [];
  }

  // Save all groups
  async saveGroups(groups: Group[]): Promise<void> {
    await SecureStore.setItemAsync(KEYS.GROUPS, JSON.stringify(groups));
  }

  // Get a single group by ID
  async getGroup(groupId: string): Promise<Group | null> {
    const groups = await this.getGroups();
    return groups.find(g => g.id === groupId) || null;
  }

  // Save a new group
  async saveGroup(group: Group): Promise<void> {
    const groups = await this.getGroups();
    const existingIndex = groups.findIndex(g => g.id === group.id);
    if (existingIndex !== -1) {
      groups[existingIndex] = group;
    } else {
      groups.push(group);
    }
    await this.saveGroups(groups);
  }

  // Update group
  async updateGroup(groupId: string, updates: Partial<Group>): Promise<void> {
    const groups = await this.getGroups();
    const index = groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
      groups[index] = { ...groups[index], ...updates };
      await this.saveGroups(groups);
    }
  }

  // Delete group
  async deleteGroup(groupId: string): Promise<void> {
    const groups = await this.getGroups();
    const filtered = groups.filter(g => g.id !== groupId);
    await this.saveGroups(filtered);
    // Also delete group conversation and messages
    await this.deleteGroupConversation(groupId);
  }

  // ============ GROUP CONVERSATION METHODS ============

  // Get all group conversations
  async getGroupConversations(): Promise<GroupConversation[]> {
    const data = await SecureStore.getItemAsync(KEYS.GROUP_CONVERSATIONS);
    if (!data) return [];
    return safeJsonParse<GroupConversation[]>(data, []) || [];
  }

  // Save all group conversations
  async saveGroupConversations(conversations: GroupConversation[]): Promise<void> {
    await SecureStore.setItemAsync(KEYS.GROUP_CONVERSATIONS, JSON.stringify(conversations));
  }

  // Get or create a group conversation
  async getOrCreateGroupConversation(groupId: string): Promise<GroupConversation> {
    const conversations = await this.getGroupConversations();
    let conversation = conversations.find(c => c.groupId === groupId);

    if (!conversation) {
      conversation = {
        id: groupId,
        groupId,
        unreadCount: 0,
        updatedAt: Date.now(),
      };
      conversations.push(conversation);
      await this.saveGroupConversations(conversations);
    }

    return conversation;
  }

  // Update group conversation
  async updateGroupConversation(
    groupId: string,
    updates: Partial<GroupConversation>
  ): Promise<void> {
    const conversations = await this.getGroupConversations();
    const index = conversations.findIndex(c => c.groupId === groupId);

    if (index !== -1) {
      conversations[index] = { ...conversations[index], ...updates };
    } else {
      conversations.push({
        id: groupId,
        groupId,
        unreadCount: 0,
        updatedAt: Date.now(),
        ...updates,
      });
    }

    // Sort by updatedAt descending
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.saveGroupConversations(conversations);
  }

  // Delete group conversation
  async deleteGroupConversation(groupId: string): Promise<void> {
    const conversations = await this.getGroupConversations();
    const filtered = conversations.filter(c => c.groupId !== groupId);
    await this.saveGroupConversations(filtered);
    // Also delete group messages
    await SecureStore.deleteItemAsync(KEYS.GROUP_MESSAGES_PREFIX + groupId);
  }

  // ============ GROUP MESSAGE METHODS ============

  // Get messages for a group
  async getGroupMessages(groupId: string): Promise<Message[]> {
    const data = await SecureStore.getItemAsync(KEYS.GROUP_MESSAGES_PREFIX + groupId);
    if (!data) return [];
    return safeJsonParse<Message[]>(data, []) || [];
  }

  // Save messages for a group
  async saveGroupMessages(groupId: string, messages: Message[]): Promise<void> {
    await SecureStore.setItemAsync(
      KEYS.GROUP_MESSAGES_PREFIX + groupId,
      JSON.stringify(messages)
    );
  }

  // Add a message to a group
  async addGroupMessage(groupId: string, message: Message): Promise<void> {
    const messages = await this.getGroupMessages(groupId);
    messages.push(message);
    // Keep only last 1000 messages per group
    if (messages.length > 1000) {
      messages.splice(0, messages.length - 1000);
    }
    await this.saveGroupMessages(groupId, messages);
  }

  // Update group message status
  async updateGroupMessageStatus(
    groupId: string,
    messageId: string,
    status: Message['status']
  ): Promise<void> {
    const messages = await this.getGroupMessages(groupId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      messages[index].status = status;
      await this.saveGroupMessages(groupId, messages);
    }
  }

  // Delete a single message from a group
  async deleteGroupMessage(groupId: string, messageId: string): Promise<void> {
    const messages = await this.getGroupMessages(groupId);
    const filtered = messages.filter(m => m.id !== messageId);
    await this.saveGroupMessages(groupId, filtered);

    // Update group conversation's lastMessage if needed
    if (filtered.length > 0) {
      const sortedMessages = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
      await this.updateGroupConversation(groupId, {
        lastMessage: sortedMessages[0],
        updatedAt: sortedMessages[0].timestamp,
      });
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    // IMPORTANT: Read conversation and group IDs BEFORE deleting them
    // so we can clean up individual message stores
    const conversations = await this.getConversations();
    const groups = await this.getGroups();

    // Delete main data stores
    await SecureStore.deleteItemAsync(KEYS.USER);
    await SecureStore.deleteItemAsync(KEYS.CONTACTS);
    await SecureStore.deleteItemAsync(KEYS.CONVERSATIONS);
    await SecureStore.deleteItemAsync(KEYS.PRIVACY_SETTINGS);
    await SecureStore.deleteItemAsync(KEYS.APP_LOCK_SETTINGS);
    await SecureStore.deleteItemAsync(KEYS.NOTIFICATION_SETTINGS);
    await SecureStore.deleteItemAsync(KEYS.GROUPS);
    await SecureStore.deleteItemAsync(KEYS.GROUP_CONVERSATIONS);

    // Delete individual message stores
    for (const conv of conversations) {
      await SecureStore.deleteItemAsync(KEYS.MESSAGES_PREFIX + conv.id);
    }

    // Delete group message stores
    for (const group of groups) {
      await SecureStore.deleteItemAsync(KEYS.GROUP_MESSAGES_PREFIX + group.id);
    }
  }
}

export const secureStorage = new SecureStorage();
export default secureStorage;
