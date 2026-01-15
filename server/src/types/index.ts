import { WebSocket } from 'ws';

// Privacy preferences for a client
export interface PrivacyPrefs {
  sendReadReceipts: boolean;
  sendTypingIndicator: boolean;
  hideOnlineStatus: boolean;
}

// Connected client
export interface ConnectedClient {
  whisperId: string;
  publicKey: string;           // X25519 encryption key
  signingPublicKey: string;    // Ed25519 signing key for authentication
  socket: WebSocket;
  connectedAt: number;
  lastPing: number;
  pushToken?: string;
  prefs?: PrivacyPrefs;
}

// Pending message for offline users
export interface PendingMessage {
  id: string;
  fromWhisperId: string;
  toWhisperId: string;
  encryptedContent: string;
  nonce: string;
  timestamp: number;
  expiresAt: number;
  senderPublicKey?: string; // For message requests from unknown senders
  // Media attachments - passed through encrypted
  encryptedVoice?: string;
  voiceDuration?: number;
  encryptedImage?: string;
  imageMetadata?: { width: number; height: number };
  encryptedFile?: string;
  fileMetadata?: { name: string; size: number; mimeType: string };
  isForwarded?: boolean;
  replyTo?: { messageId: string; content: string; senderId: string };
}

// Client -> Server message types
export type ClientMessageType =
  | 'register'
  | 'register_proof'
  | 'send_message'
  | 'delivery_receipt'
  | 'fetch_pending'
  | 'ping'
  | 'report_user'
  | 'reaction'
  | 'typing'
  | 'block_user'
  | 'unblock_user'
  | 'delete_account'
  | 'call_initiate'
  | 'call_answer'
  | 'call_ice_candidate'
  | 'call_end'
  | 'create_group'
  | 'send_group_message'
  | 'update_group'
  | 'leave_group'
  | 'lookup_public_key'
  | 'get_turn_credentials';

// Server -> Client message types
export type ServerMessageType =
  | 'register_challenge'
  | 'register_ack'
  | 'message_received'
  | 'message_delivered'
  | 'pending_messages'
  | 'delivery_status'
  | 'pong'
  | 'error'
  | 'report_ack'
  | 'reaction_received'
  | 'typing_status'
  | 'block_ack'
  | 'unblock_ack'
  | 'account_deleted'
  | 'incoming_call'
  | 'call_answered'
  | 'call_ice_candidate'
  | 'call_ended'
  | 'call_ringing'
  | 'group_created'
  | 'group_message_received'
  | 'group_updated'
  | 'member_left_group'
  | 'public_key_response'
  | 'turn_credentials';

// Client -> Server messages
export interface RegisterMessage {
  type: 'register';
  payload: {
    whisperId: string;
    publicKey: string;           // X25519 encryption key
    signingPublicKey: string;    // Ed25519 signing key for authentication
    pushToken?: string;
    prefs?: PrivacyPrefs;
  };
}

export interface RegisterProofMessage {
  type: 'register_proof';
  payload: {
    signature: string;           // Base64-encoded Ed25519 signature of the challenge
  };
}

export interface SendMessageMessage {
  type: 'send_message';
  payload: {
    messageId: string;
    toWhisperId: string;
    encryptedContent: string;
    nonce: string;
    // Media attachments - passed through encrypted
    encryptedVoice?: string;
    voiceDuration?: number;
    encryptedImage?: string;
    imageMetadata?: { width: number; height: number };
    encryptedFile?: string;
    fileMetadata?: { name: string; size: number; mimeType: string };
    isForwarded?: boolean;
    replyTo?: { messageId: string; content: string; senderId: string };
  };
}

export interface DeliveryReceiptMessage {
  type: 'delivery_receipt';
  payload: {
    messageId: string;
    toWhisperId: string; // Original sender to notify
    status: 'delivered' | 'read';
  };
}

export interface FetchPendingMessage {
  type: 'fetch_pending';
  payload: {
    cursor?: string;             // Message ID to start after (for pagination)
  };
}

export interface PingMessage {
  type: 'ping';
  payload: Record<string, never>;
}

export interface ReportUserMessage {
  type: 'report_user';
  payload: {
    reportedWhisperId: string;
    reason: 'inappropriate_content' | 'harassment' | 'spam' | 'child_safety' | 'other';
    description?: string;
  };
}

export interface ReactionMessage {
  type: 'reaction';
  payload: {
    messageId: string;
    toWhisperId: string;
    emoji: string | null; // null to remove reaction
  };
}

export interface TypingMessage {
  type: 'typing';
  payload: {
    toWhisperId: string;
    isTyping: boolean;
  };
}

// Block messages (Client -> Server)
export interface BlockUserMessage {
  type: 'block_user';
  payload: {
    whisperId: string;           // WhisperId of user to block
  };
}

export interface UnblockUserMessage {
  type: 'unblock_user';
  payload: {
    whisperId: string;           // WhisperId of user to unblock
  };
}

// Account deletion message (Client -> Server)
export interface DeleteAccountMessage {
  type: 'delete_account';
  payload: {
    confirmation: string;        // Must be "DELETE_MY_ACCOUNT"
    timestamp: number;           // Unix timestamp (must be within 5 minutes)
    signature: string;           // Ed25519 signature of "DELETE_MY_ACCOUNT:{timestamp}"
  };
}

// Call signaling messages (Client -> Server)
export interface CallInitiateMessage {
  type: 'call_initiate';
  payload: {
    toWhisperId: string;
    callId: string;
    offer: string; // SDP offer
    isVideo?: boolean; // Video or voice call
  };
}

export interface CallAnswerMessage {
  type: 'call_answer';
  payload: {
    toWhisperId: string;
    callId: string;
    answer: string; // SDP answer
  };
}

export interface CallIceCandidateMessage {
  type: 'call_ice_candidate';
  payload: {
    toWhisperId: string;
    callId: string;
    candidate: string; // ICE candidate JSON
  };
}

export interface CallEndMessage {
  type: 'call_end';
  payload: {
    toWhisperId: string;
    callId: string;
  };
}

// Group messages (Client -> Server)
export interface CreateGroupMessage {
  type: 'create_group';
  payload: {
    groupId: string;         // GRP-XXXX-XXXX-XXXX format
    name: string;
    members: string[];       // Array of whisperIds (excluding creator)
  };
}

export interface SendGroupMessageMessage {
  type: 'send_group_message';
  payload: {
    groupId: string;
    messageId: string;
    encryptedContent: string;
    nonce: string;
    senderName?: string;     // Cached sender name for display
  };
}

export interface UpdateGroupMessage {
  type: 'update_group';
  payload: {
    groupId: string;
    name?: string;           // New group name (optional)
    addMembers?: string[];   // Members to add
    removeMembers?: string[]; // Members to remove
  };
}

export interface LeaveGroupMessage {
  type: 'leave_group';
  payload: {
    groupId: string;
  };
}

// Lookup public key message (Client -> Server)
// Used for message requests: find a user's public key by Whisper ID
export interface LookupPublicKeyMessage {
  type: 'lookup_public_key';
  payload: {
    whisperId: string;           // Whisper ID to look up
  };
}

// Get TURN credentials message (Client -> Server)
// Used for WebRTC calls to get time-limited TURN server credentials
export interface GetTurnCredentialsMessage {
  type: 'get_turn_credentials';
  payload: Record<string, never>;
}

export type ClientMessage =
  | RegisterMessage
  | RegisterProofMessage
  | SendMessageMessage
  | DeliveryReceiptMessage
  | FetchPendingMessage
  | PingMessage
  | ReportUserMessage
  | ReactionMessage
  | TypingMessage
  | BlockUserMessage
  | UnblockUserMessage
  | DeleteAccountMessage
  | CallInitiateMessage
  | CallAnswerMessage
  | CallIceCandidateMessage
  | CallEndMessage
  | CreateGroupMessage
  | SendGroupMessageMessage
  | UpdateGroupMessage
  | LeaveGroupMessage
  | LookupPublicKeyMessage
  | GetTurnCredentialsMessage;

// Server -> Client messages
export interface RegisterChallengeMessage {
  type: 'register_challenge';
  payload: {
    challenge: string;           // Base64-encoded 32-byte random challenge
  };
}

export interface RegisterAckMessage {
  type: 'register_ack';
  payload: {
    success: boolean;
    error?: string;
  };
}

export interface MessageReceivedMessage {
  type: 'message_received';
  payload: {
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
    senderPublicKey?: string; // For message requests from unknown senders
    // Media attachments - passed through encrypted
    encryptedVoice?: string;
    voiceDuration?: number;
    encryptedImage?: string;
    imageMetadata?: { width: number; height: number };
    encryptedFile?: string;
    fileMetadata?: { name: string; size: number; mimeType: string };
    isForwarded?: boolean;
    replyTo?: { messageId: string; content: string; senderId: string };
  };
}

export interface MessageDeliveredMessage {
  type: 'message_delivered';
  payload: {
    messageId: string;
    status: 'sent' | 'delivered' | 'pending';
    toWhisperId: string; // Recipient ID so client knows which conversation
  };
}

export interface PendingMessagesMessage {
  type: 'pending_messages';
  payload: {
    messages: Array<{
      messageId: string;
      fromWhisperId: string;
      encryptedContent: string;
      nonce: string;
      timestamp: number;
      senderPublicKey?: string; // For message requests from unknown senders
      // Media attachments - passed through encrypted
      encryptedVoice?: string;
      voiceDuration?: number;
      encryptedImage?: string;
      imageMetadata?: { width: number; height: number };
      encryptedFile?: string;
      fileMetadata?: { name: string; size: number; mimeType: string };
      isForwarded?: boolean;
      replyTo?: { messageId: string; content: string; senderId: string };
    }>;
    cursor: string | null;       // Current cursor (null if first page)
    nextCursor: string | null;   // Cursor to use for next page (null if no more)
    hasMore: boolean;            // Whether there are more messages to fetch
  };
}

export interface DeliveryStatusMessage {
  type: 'delivery_status';
  payload: {
    messageId: string;
    status: 'delivered' | 'read';
    fromWhisperId: string; // Who sent the receipt (conversation to update)
  };
}

export interface PongMessage {
  type: 'pong';
  payload: Record<string, never>;
}

export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}

export interface ReportAckMessage {
  type: 'report_ack';
  payload: {
    reportId: string;
    success: boolean;
  };
}

export interface ReactionReceivedMessage {
  type: 'reaction_received';
  payload: {
    messageId: string;
    fromWhisperId: string;
    emoji: string | null; // null means reaction removed
  };
}

export interface TypingStatusMessage {
  type: 'typing_status';
  payload: {
    fromWhisperId: string;
    isTyping: boolean;
  };
}

// Block acknowledgement messages (Server -> Client)
export interface BlockAckMessage {
  type: 'block_ack';
  payload: {
    whisperId: string;           // WhisperId that was blocked
    success: boolean;
  };
}

export interface UnblockAckMessage {
  type: 'unblock_ack';
  payload: {
    whisperId: string;           // WhisperId that was unblocked
    success: boolean;
  };
}

// Account deletion confirmation (Server -> Client)
export interface AccountDeletedMessage {
  type: 'account_deleted';
  payload: {
    success: boolean;
  };
}

// Call signaling messages (Server -> Client)
export interface IncomingCallMessage {
  type: 'incoming_call';
  payload: {
    fromWhisperId: string;
    callId: string;
    offer: string; // SDP offer
    isVideo: boolean; // Video or voice call
  };
}

export interface CallAnsweredMessage {
  type: 'call_answered';
  payload: {
    fromWhisperId: string;
    callId: string;
    answer: string; // SDP answer
  };
}

export interface CallIceCandidateReceivedMessage {
  type: 'call_ice_candidate';
  payload: {
    fromWhisperId: string;
    callId: string;
    candidate: string; // ICE candidate JSON
  };
}

export interface CallEndedMessage {
  type: 'call_ended';
  payload: {
    fromWhisperId: string;
    callId: string;
  };
}

export interface CallRingingMessage {
  type: 'call_ringing';
  payload: {
    callId: string;
    toWhisperId: string;
  };
}

// Group messages (Server -> Client)
export interface GroupCreatedMessage {
  type: 'group_created';
  payload: {
    groupId: string;
    name: string;
    createdBy: string;
    members: string[];
    createdAt: number;
  };
}

export interface GroupMessageReceivedMessage {
  type: 'group_message_received';
  payload: {
    groupId: string;
    messageId: string;
    fromWhisperId: string;
    encryptedContent: string;
    nonce: string;
    timestamp: number;
    senderName?: string;
  };
}

export interface GroupUpdatedMessage {
  type: 'group_updated';
  payload: {
    groupId: string;
    updatedBy: string;
    name?: string;
    addedMembers?: string[];
    removedMembers?: string[];
  };
}

export interface MemberLeftGroupMessage {
  type: 'member_left_group';
  payload: {
    groupId: string;
    memberId: string;
  };
}

// Public key response message (Server -> Client)
// Response to lookup_public_key request
export interface PublicKeyResponseMessage {
  type: 'public_key_response';
  payload: {
    whisperId: string;           // Whisper ID that was looked up
    publicKey: string | null;    // Public key if found, null if user doesn't exist
    exists: boolean;             // Whether the user exists in the system
  };
}

// TURN credentials response message (Server -> Client)
// Response to get_turn_credentials request
export interface TurnCredentialsMessage {
  type: 'turn_credentials';
  payload: {
    username: string;            // Time-limited username (timestamp:userId)
    credential: string;          // HMAC-SHA1 credential
    ttl: number;                 // Time to live in seconds
    urls: string[];              // STUN/TURN server URLs
  };
}

export type ServerMessage =
  | RegisterChallengeMessage
  | RegisterAckMessage
  | MessageReceivedMessage
  | MessageDeliveredMessage
  | PendingMessagesMessage
  | DeliveryStatusMessage
  | PongMessage
  | ErrorMessage
  | ReportAckMessage
  | ReactionReceivedMessage
  | TypingStatusMessage
  | BlockAckMessage
  | UnblockAckMessage
  | AccountDeletedMessage
  | IncomingCallMessage
  | CallAnsweredMessage
  | CallIceCandidateReceivedMessage
  | CallEndedMessage
  | CallRingingMessage
  | GroupCreatedMessage
  | GroupMessageReceivedMessage
  | GroupUpdatedMessage
  | MemberLeftGroupMessage
  | PublicKeyResponseMessage
  | TurnCredentialsMessage;
