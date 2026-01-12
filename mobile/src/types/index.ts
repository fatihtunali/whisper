// User types
export interface User {
  whisperId: string;      // WSP-XXXX-XXXX-XXXX
  username?: string;
  publicKey: string;      // Base64 encoded
  createdAt: number;      // Unix timestamp
}

export interface LocalUser extends User {
  privateKey: string;     // Base64 encoded, stored securely
  seedPhrase: string[];   // 12 words
}

// Message types
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;       // Whisper ID of sender
  content: string;        // Plaintext (after decryption)
  timestamp: number;      // Unix timestamp
  status: MessageStatus;
}

export interface EncryptedMessage {
  id: string;
  toWhisperId: string;
  fromWhisperId: string;
  encryptedContent: string;  // Base64 encoded
  nonce: string;             // Base64 encoded
  timestamp: number;
}

// Contact types
export interface Contact {
  whisperId: string;
  publicKey: string;      // Base64 encoded
  username?: string;
  nickname?: string;
  addedAt: number;        // Unix timestamp
  isBlocked?: boolean;
}

// Conversation types
export interface Conversation {
  id: string;             // Same as contact's whisperId for 1:1
  contactId: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: number;      // Unix timestamp
}

// WebSocket message types
export type WSMessageType =
  | 'register'
  | 'register_ack'
  | 'send_message'
  | 'message_received'
  | 'message_delivered'
  | 'delivery_receipt'
  | 'fetch_pending'
  | 'pending_messages'
  | 'ping'
  | 'pong'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
}

// Navigation types
export type AuthStackParamList = {
  Welcome: undefined;
  CreateAccount: undefined;
  SeedPhrase: { seedPhrase: string[]; isBackup: boolean };
  RecoverAccount: undefined;
};

export type MainTabParamList = {
  ChatsTab: undefined;
  ContactsTab: undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Chat: { contactId: string };
  AddContact: undefined;
  QRScanner: undefined;
  MyQR: undefined;
  Profile: undefined;
};

// App state
export interface AppState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: LocalUser | null;
}
