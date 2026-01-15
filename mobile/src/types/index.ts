// User types
export interface User {
  whisperId: string;      // WSP-XXXX-XXXX-XXXX
  username?: string;
  publicKey: string;      // Base64 encoded
  createdAt: number;      // Unix timestamp
}

export interface LocalUser extends User {
  privateKey: string;           // X25519 Base64 encoded, stored securely (encryption)
  signingPublicKey: string;     // Ed25519 Base64 encoded (authentication)
  signingPrivateKey: string;    // Ed25519 Base64 encoded, stored securely (authentication)
  seedPhrase: string[];         // 12 words
}

// Message types
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageReplyTo {
  messageId: string;
  content: string;
  senderId: string;
}

export interface FileAttachment {
  name: string;
  size: number;
  mimeType: string;
  uri: string;            // Local URI for display/download
}

export interface ImageAttachment {
  uri: string;            // Local URI for display
  width: number;
  height: number;
  base64?: string;        // Base64 encoded image data (for sending)
}

export interface VoiceMessage {
  uri: string;            // Local URI for playback
  duration: number;       // Duration in milliseconds
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;       // Whisper ID of sender
  content: string;        // Plaintext (after decryption)
  timestamp: number;      // Unix timestamp
  status: MessageStatus;
  replyTo?: MessageReplyTo;  // Reference to replied message
  file?: FileAttachment;  // Optional file attachment
  image?: ImageAttachment; // Optional image attachment
  voice?: VoiceMessage;   // Optional voice message
  reactions?: { [oderId: string]: string }; // oderId -> emoji (userId who reacted -> their emoji)
  expiresAt?: number;     // Unix timestamp when message should auto-delete (for disappearing messages)
  groupId?: string;       // For group messages: GRP-XXXX-XXXX-XXXX
  senderName?: string;    // Cached sender name for group messages display
  isForwarded?: boolean;  // Whether the message was forwarded
}

export interface EncryptedMessage {
  id: string;
  toWhisperId: string;
  fromWhisperId: string;
  encryptedContent: string;  // Base64 encoded
  nonce: string;             // Base64 encoded
  timestamp: number;
  encryptedFile?: string;    // Base64 encoded encrypted file data
  fileMetadata?: {           // Unencrypted file metadata
    name: string;
    size: number;
    mimeType: string;
  };
  encryptedVoice?: string;   // Base64 encoded encrypted voice data
  voiceDuration?: number;    // Voice message duration in milliseconds
  encryptedImage?: string;   // Base64 encoded encrypted image data
  imageNonce?: string;       // Separate nonce for image encryption
  imageMetadata?: {          // Unencrypted image metadata
    width: number;
    height: number;
  };
}

// Contact types
export interface Contact {
  whisperId: string;
  publicKey: string;      // Base64 encoded
  username?: string;
  nickname?: string;
  addedAt: number;        // Unix timestamp
  isBlocked?: boolean;
  isMessageRequest?: boolean; // True if this is a pending message request (not yet accepted)
}

// Group types
export interface Group {
  id: string;             // GRP-XXXX-XXXX-XXXX format
  name: string;
  members: string[];      // Array of whisperIds
  createdBy: string;      // WhisperId of creator
  createdAt: number;      // Unix timestamp
  avatar?: string;        // Optional avatar URL or base64
}

// Group conversation type
export interface GroupConversation {
  id: string;             // Same as group id
  groupId: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: number;      // Unix timestamp
}

// Conversation types
export interface Conversation {
  id: string;             // Same as contact's whisperId for 1:1
  contactId: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: number;      // Unix timestamp
  disappearAfter?: number; // Milliseconds after which messages auto-delete (0 or undefined = off)
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
  Call: { contactId: string; isIncoming: boolean; callId?: string };
  VideoCall: { contactId: string; isIncoming: boolean; callId?: string };
  AddContact: undefined;
  QRScanner: undefined;
  MyQR: undefined;
  Profile: undefined;
  Terms: undefined;
  Privacy: undefined;
  ChildSafety: undefined;
  About: undefined;
  // Group screens
  CreateGroup: undefined;
  GroupChat: { groupId: string };
  GroupInfo: { groupId: string };
  AddGroupMember: { groupId: string };
  // Message forwarding
  ForwardMessage: { content: string; originalSenderId?: string };
  // App lock screens
  SetupPin: { isChangingPin?: boolean };
};

// Call types
export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'no_answer';

export interface CallSession {
  callId: string;
  contactId: string;
  isIncoming: boolean;
  isVideo: boolean;
  state: CallState;
  startTime?: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOn: boolean;
  isFrontCamera: boolean;
  remoteSdp?: string; // Store remote SDP offer for incoming calls
}

// App state
export interface AppState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: LocalUser | null;
}
