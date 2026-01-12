import * as SecureStore from 'expo-secure-store';
import { LocalUser, Contact, Conversation, Message } from '../types';

const KEYS = {
  USER: 'whisper_user',
  CONTACTS: 'whisper_contacts',
  CONVERSATIONS: 'whisper_conversations',
  MESSAGES_PREFIX: 'whisper_messages_',
};

class SecureStorage {
  // User methods
  async saveUser(user: LocalUser): Promise<void> {
    await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
  }

  async getUser(): Promise<LocalUser | null> {
    const data = await SecureStore.getItemAsync(KEYS.USER);
    if (!data) return null;
    return JSON.parse(data) as LocalUser;
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
    return JSON.parse(data) as Contact[];
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
    return JSON.parse(data) as Conversation[];
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
    return JSON.parse(data) as Message[];
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

  // Clear all data
  async clearAll(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.USER);
    await SecureStore.deleteItemAsync(KEYS.CONTACTS);
    await SecureStore.deleteItemAsync(KEYS.CONVERSATIONS);
    // Note: Individual message stores need to be cleared based on conversation IDs
    const conversations = await this.getConversations();
    for (const conv of conversations) {
      await SecureStore.deleteItemAsync(KEYS.MESSAGES_PREFIX + conv.id);
    }
  }
}

export const secureStorage = new SecureStorage();
export default secureStorage;
