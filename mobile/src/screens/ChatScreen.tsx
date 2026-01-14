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
  ViewToken,
  Alert,
  Linking,
  Pressable,
  Modal,
  Image,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { documentDirectory } from 'expo-file-system/legacy';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Message, Contact, MessageReplyTo, FileAttachment, Conversation } from '../types';
import { secureStorage, PrivacySettings } from '../storage/SecureStorage';
import { useAuth } from '../context/AuthContext';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
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
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [reactionMessage, setReactionMessage] = useState<Message | null>(null);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  // Full-screen image viewer state
  const [viewingImage, setViewingImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  // Voice recording state - use local state as fallback since hook state may not update properly
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<InstanceType<typeof AudioModule.AudioPlayer> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);

  // Max image size for sending (compress larger images)
  const MAX_IMAGE_SIZE = 1024; // Max width or height in pixels

  // Available reaction emojis
  const REACTION_EMOJIS = ['\uD83D\uDC4D', '\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDE21'];

  // Maximum file size: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  // Allowed document types
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/json',
    'application/zip',
  ];

  // Get file icon based on mime type
  const getFileIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '\uD83D\uDCC4';
    if (mimeType.includes('word') || mimeType.includes('document')) return '\uD83D\uDCC3';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType.includes('csv')) return '\uD83D\uDCCA';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '\uD83D\uDCBD';
    if (mimeType.includes('text') || mimeType.includes('json')) return '\uD83D\uDCC4';
    if (mimeType.includes('zip')) return '\uD83D\uDDC4';
    return '\uD83D\uDCC1';
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    loadData();
  }, [contactId]);

  // Set up message handlers
  useEffect(() => {
    // Handle incoming messages
    const handleIncomingMessage = (message: Message, msgContact: Contact) => {
      if (!isMountedRef.current) return;
      if (msgContact.whisperId === contactId) {
        setMessages(prev => [message, ...prev]);
      }
    };

    // Handle status updates for our sent messages
    const handleStatusUpdate = async (messageId: string, status: Message['status']) => {
      if (!isMountedRef.current) return;
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, status } : m))
      );
      await secureStorage.updateMessageStatus(contactId, messageId, status);
    };

    // Handle incoming reactions
    const handleReaction = (messageId: string, oderId: string, emoji: string | null) => {
      if (!isMountedRef.current) return;
      setMessages(prev =>
        prev.map(m => {
          if (m.id === messageId) {
            const newReactions = { ...m.reactions };
            if (emoji === null) {
              delete newReactions[oderId];
            } else {
              newReactions[oderId] = emoji;
            }
            return { ...m, reactions: newReactions };
          }
          return m;
        })
      );
    };

    // Handle incoming typing status
    const handleTypingStatus = (fromWhisperId: string, isTyping: boolean) => {
      if (!isMountedRef.current) return;
      if (fromWhisperId === contactId) {
        setIsContactTyping(isTyping);
      }
    };

    messagingService.addMessageHandler(handleIncomingMessage);
    messagingService.addStatusHandler(handleStatusUpdate);
    messagingService.addReactionHandler(handleReaction);
    messagingService.addTypingHandler(handleTypingStatus);

    return () => {
      messagingService.removeMessageHandler(handleIncomingMessage);
      messagingService.removeStatusHandler(handleStatusUpdate);
      messagingService.removeReactionHandler(handleReaction);
      messagingService.removeTypingHandler(handleTypingStatus);
    };
  }, [contactId]);

  const loadData = async () => {
    const contactData = await secureStorage.getContact(contactId);
    if (!isMountedRef.current) return;
    setContact(contactData);

    // Ensure conversation exists and load it
    const conv = await secureStorage.getOrCreateConversation(contactId);
    if (!isMountedRef.current) return;
    setConversation(conv);

    const msgs = await secureStorage.getMessages(contactId);
    if (!isMountedRef.current) return;
    setMessages(msgs.reverse());
  };

  // Use refs to keep track of current values for the viewability callback
  const messagesRef = useRef<Message[]>([]);
  const userRef = useRef(user);
  const contactIdRef = useRef(contactId);
  const privacySettingsRef = useRef<PrivacySettings>({ readReceipts: true, typingIndicator: true, showOnlineStatus: true });

  // Load privacy settings on mount
  useEffect(() => {
    const loadPrivacySettings = async () => {
      const settings = await secureStorage.getPrivacySettings();
      privacySettingsRef.current = settings;
    };
    loadPrivacySettings();
  }, []);

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

      // Mark each visible message as read locally
      const currentPrivacySettings = privacySettingsRef.current;
      for (const msg of unreadFromOthers) {
        await secureStorage.updateMessageStatus(currentContactId, msg.id, 'read');
        // Only send read receipt if enabled in privacy settings
        // Still send 'delivered' receipts regardless of setting
        if (currentPrivacySettings.readReceipts) {
          messagingService.sendDeliveryReceipt(msg.senderId, msg.id, 'read');
        }
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

  // Handle text input change with typing indicator
  const handleTextChange = (text: string) => {
    setInputText(text);

    // Send typing status if enabled
    const now = Date.now();
    if (text.length > 0 && now - lastTypingSentRef.current > 2000) {
      // Check if typing indicator is enabled in privacy settings
      if (privacySettingsRef.current.typingIndicator) {
        messagingService.sendTypingStatus(contactId, true);
        lastTypingSentRef.current = now;
      }
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to send "stopped typing" after 3 seconds of no input
    if (text.length > 0 && privacySettingsRef.current.typingIndicator) {
      typingTimeoutRef.current = setTimeout(() => {
        messagingService.sendTypingStatus(contactId, false);
      }, 3000);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !contact) return;

    // Stop typing indicator when sending
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (privacySettingsRef.current.typingIndicator) {
      messagingService.sendTypingStatus(contactId, false);
    }

    const content = inputText.trim();
    setInputText('');

    // Prepare replyTo data if replying to a message
    const replyToData: MessageReplyTo | undefined = replyingTo
      ? {
          messageId: replyingTo.id,
          content: replyingTo.content,
          senderId: replyingTo.senderId,
        }
      : undefined;

    // Clear reply state
    setReplyingTo(null);

    try {
      // Send via messaging service (handles encryption and WebSocket)
      const sentMessage = await messagingService.sendMessage(contact, content, replyToData);

      // Set expiration time if disappearing messages are enabled
      if (conversation?.disappearAfter && conversation.disappearAfter > 0) {
        sentMessage.expiresAt = Date.now() + conversation.disappearAfter;
      }

      // Add to local state
      setMessages(prev => [sentMessage, ...prev]);

      // Update message in storage with expiresAt if set
      if (sentMessage.expiresAt) {
        const msgs = await secureStorage.getMessages(contactId);
        const updatedMsgs = msgs.map(m => m.id === sentMessage.id ? sentMessage : m);
        await secureStorage.saveMessages(contactId, updatedMsgs);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Could show an error toast here
    }
  };

  // Handle file attachment
  const handleAttachFile = async () => {
    if (!user || !contact || isSendingFile) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];

      // Check file size
      if (file.size && file.size > MAX_FILE_SIZE) {
        Alert.alert(
          'File Too Large',
          `Maximum file size is ${formatFileSize(MAX_FILE_SIZE)}. Your file is ${formatFileSize(file.size)}.`
        );
        return;
      }

      setIsSendingFile(true);

      // Read file as base64
      const fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'base64',
      });

      // Create file attachment
      const fileAttachment: FileAttachment = {
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType || 'application/octet-stream',
        uri: file.uri,
      };

      // Send file message
      const sentMessage = await messagingService.sendFileMessage(
        contact,
        fileAttachment,
        fileBase64
      );

      // Add to local state
      setMessages(prev => [sentMessage, ...prev]);

    } catch (error) {
      console.error('Failed to send file:', error);
      Alert.alert('Error', 'Failed to send file. Please try again.');
    } finally {
      setIsSendingFile(false);
    }
  };

  // Handle opening/sharing a file
  const handleOpenFile = async (file: FileAttachment) => {
    try {
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(file.uri);

      if (!fileInfo.exists) {
        Alert.alert('File Not Found', 'The file is no longer available.');
        return;
      }

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: file.mimeType,
          dialogTitle: `Open ${file.name}`,
        });
      } else {
        // Fallback: try to open with Linking
        const canOpen = await Linking.canOpenURL(file.uri);
        if (canOpen) {
          await Linking.openURL(file.uri);
        } else {
          Alert.alert('Cannot Open', 'Unable to open this file type.');
        }
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      Alert.alert('Error', 'Failed to open the file.');
    }
  };

  const pickAndSendImage = async () => {
    if (!user || !contact || isSendingImage) return;

    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to send images.'
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
        exif: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64 || !asset.uri) {
        Alert.alert('Error', 'Failed to load image data.');
        return;
      }

      setIsSendingImage(true);

      // Get image dimensions
      const width = asset.width || 300;
      const height = asset.height || 300;

      // Save image locally for display
      const imagesDir = `${documentDirectory}images/`;
      const dirInfo = await FileSystem.getInfoAsync(imagesDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });
      }

      const imageFileName = `${Date.now()}.jpg`;
      const localUri = `${imagesDir}${imageFileName}`;
      await FileSystem.copyAsync({ from: asset.uri, to: localUri });

      // Send via messaging service
      const sentMessage = await messagingService.sendImageMessage(
        contact,
        asset.base64,
        width,
        height,
        localUri
      );

      // Add to local state
      setMessages(prev => [sentMessage, ...prev]);
      setIsSendingImage(false);
    } catch (error) {
      console.error('Failed to send image:', error);
      setIsSendingImage(false);
      Alert.alert('Error', 'Failed to send image. Please try again.');
    }
  };

  // Voice recording functions
  const startRecording = async () => {
    console.log('[ChatScreen] Starting recording...');
    try {
      // Request permissions
      console.log('[ChatScreen] Requesting recording permission...');
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      console.log('[ChatScreen] Permission granted:', granted);
      if (!granted) {
        Alert.alert('Permission Required', 'Please grant microphone permission to record voice messages.');
        return;
      }

      // Set audio mode for recording
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Start recording using the hook's recorder
      await audioRecorder.record();
      setIsRecordingLocal(true);
      setRecordingDuration(0);
      console.log('[ChatScreen] Recording started, isRecording:', isRecordingLocal);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    console.log('[ChatScreen] stopRecording called, isRecording:', isRecordingLocal, 'local:', isRecordingLocal);

    // Hide recording UI immediately
    setIsRecordingLocal(false);

    try {
      // Stop timer first
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      // Capture duration before resetting
      const duration = recordingDuration * 1000; // Convert to milliseconds
      setRecordingDuration(0);

      // Stop recording - don't check isRecording, just try to stop
      try {
        await audioRecorder.stop();
      } catch (stopError) {
        console.log('[ChatScreen] Stop error (may be expected):', stopError);
      }

      const uri = audioRecorder.uri;
      console.log('[ChatScreen] Recording URI:', uri, 'Duration:', duration);

      // Reset audio mode
      try {
        await AudioModule.setAudioModeAsync({
          allowsRecording: false,
        });
      } catch (modeError) {
        console.log('[ChatScreen] Audio mode error:', modeError);
      }

      if (uri && contact && duration > 0) {
        await sendVoiceMessage(uri, duration);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setRecordingDuration(0);
    }
  };

  const cancelRecording = async () => {
    console.log('[ChatScreen] cancelRecording called, isRecording:', isRecordingLocal, 'local:', isRecordingLocal);

    // Hide recording UI immediately
    setIsRecordingLocal(false);

    try {
      // Stop timer first
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      setRecordingDuration(0);

      // Stop recording - don't check isRecording, just try to stop
      try {
        await audioRecorder.stop();
      } catch (stopError) {
        console.log('[ChatScreen] Cancel stop error (may be expected):', stopError);
      }

      // Reset audio mode
      try {
        await AudioModule.setAudioModeAsync({
          allowsRecording: false,
        });
      } catch (modeError) {
        console.log('[ChatScreen] Audio mode error:', modeError);
      }

      console.log('Recording cancelled');
    } catch (error) {
      console.error('Failed to cancel recording:', error);
      setRecordingDuration(0);
    }
  };

  const sendVoiceMessage = async (uri: string, duration: number) => {
    if (!user || !contact) return;

    try {
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Send via messaging service
      const sentMessage = await messagingService.sendVoiceMessage(
        contact,
        base64,
        duration,
        uri
      );

      // Add to local state
      setMessages(prev => [sentMessage, ...prev]);

      console.log('Voice message sent');
    } catch (error) {
      console.error('Failed to send voice message:', error);
      Alert.alert('Error', 'Failed to send voice message. Please try again.');
    }
  };

  const playVoice = async (messageId: string, voiceUri: string) => {
    try {
      // Stop any currently playing sound
      if (audioPlayerRef.current) {
        audioPlayerRef.current.release();
        audioPlayerRef.current = null;
      }

      // If same voice is playing, just stop it
      if (playingVoiceId === messageId) {
        setPlayingVoiceId(null);
        return;
      }

      // Set audio mode for playback
      await AudioModule.setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      // Create and play the sound
      const player = new AudioModule.AudioPlayer(voiceUri, 500, false);

      // Set up listener for when playback finishes
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setPlayingVoiceId(null);
          player.release();
          if (audioPlayerRef.current === player) {
            audioPlayerRef.current = null;
          }
        }
      });

      audioPlayerRef.current = player;
      player.play();
      setPlayingVoiceId(messageId);
    } catch (error) {
      console.error('Failed to play voice:', error);
      setPlayingVoiceId(null);
    }
  };

  const formatVoiceDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatVoiceDurationMs = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    return formatVoiceDuration(seconds);
  };

  // Cleanup voice and typing on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      try {
        // Stop audio player if playing
        if (audioPlayerRef.current) {
          audioPlayerRef.current.release();
          audioPlayerRef.current = null;
        }
        // Clear recording timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        // Clear typing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        // Send stop typing when leaving chat
        if (privacySettingsRef.current.typingIndicator) {
          messagingService.sendTypingStatus(contactId, false);
        }
      } catch (error) {
        console.log('[ChatScreen] Cleanup error:', error);
      }
    };
  }, [contactId]);

  const handleLongPressMessage = (message: Message) => {
    // Show emoji picker for reactions on long press
    setReactionMessage(message);
    setReactionPickerVisible(true);
  };

  const handleDoubleTapMessage = (message: Message) => {
    // Show emoji picker for reactions on double tap
    setReactionMessage(message);
    setReactionPickerVisible(true);
  };

  const handleSelectReaction = async (emoji: string) => {
    if (!reactionMessage || !user) return;

    // Check if user already has this reaction - if so, remove it
    const currentReaction = reactionMessage.reactions?.[user.whisperId];
    const newEmoji = currentReaction === emoji ? null : emoji;

    // Send reaction via messaging service
    await messagingService.sendReaction(contactId, reactionMessage.id, newEmoji);

    // Update local state immediately
    setMessages(prev =>
      prev.map(m => {
        if (m.id === reactionMessage.id) {
          const newReactions = { ...m.reactions };
          if (newEmoji === null) {
            delete newReactions[user.whisperId];
          } else {
            newReactions[user.whisperId] = newEmoji;
          }
          return { ...m, reactions: newReactions };
        }
        return m;
      })
    );

    setReactionPickerVisible(false);
    setReactionMessage(null);
  };

  const handleRemoveOwnReaction = async (message: Message) => {
    if (!user) return;

    // Send null to remove reaction
    await messagingService.sendReaction(contactId, message.id, null);

    // Update local state immediately
    setMessages(prev =>
      prev.map(m => {
        if (m.id === message.id) {
          const newReactions = { ...m.reactions };
          delete newReactions[user.whisperId];
          return { ...m, reactions: newReactions };
        }
        return m;
      })
    );
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
            // Remove from local state
            setMessages(prev => prev.filter(m => m.id !== message.id));
            // Remove from storage
            await secureStorage.deleteMessage(contactId, message.id);
          },
        },
      ]
    );
  }, [contactId]);

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

  const showMessageOptionsMenu = (message: Message) => {
    // Only allow forwarding text messages (not voice, image, or file)
    const canForward = message.content && !message.voice && !message.image && !message.file;

    Alert.alert(
      'Message Options',
      undefined,
      [
        {
          text: 'Reply',
          onPress: () => {
            setReplyingTo(message);
            inputRef.current?.focus();
          },
        },
        {
          text: 'React',
          onPress: () => handleDoubleTapMessage(message),
        },
        ...(canForward ? [{
          text: 'Forward',
          onPress: () => {
            navigation.navigate('ForwardMessage', {
              content: message.content,
              originalSenderId: message.senderId,
            });
          },
        }] : []),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const getReplyPreviewText = (content: string, maxLength: number = 50): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const getReplyingSenderName = (senderId: string): string => {
    if (senderId === user?.whisperId) {
      return 'yourself';
    }
    return contact?.nickname || contact?.username || 'them';
  };

  const displayName = contact?.nickname || contact?.username || contactId;
  const isBlocked = contact?.isBlocked || false;
  const isMessageRequest = contact?.isMessageRequest || false;

  // Accept a message request (add to contacts)
  const handleAcceptRequest = async () => {
    if (!contact) return;
    await secureStorage.updateContact(contactId, { isMessageRequest: false });
    setContact(prev => prev ? { ...prev, isMessageRequest: false } : null);
    Alert.alert('Accepted', 'You can now chat with this person.');
  };

  // Block and delete a message request
  const handleBlockRequest = async () => {
    if (!contact) return;
    Alert.alert(
      'Block User',
      'Block this user? You won\'t receive messages from them anymore.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            await secureStorage.updateContact(contactId, { isBlocked: true, isMessageRequest: false });
            setContact(prev => prev ? { ...prev, isBlocked: true, isMessageRequest: false } : null);
            navigation.goBack();
          },
        },
      ]
    );
  };

  // Filter messages based on search query
  const filteredMessages = searchQuery
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  const handleBlockUser = () => {
    const action = isBlocked ? 'Unblock' : 'Block';
    Alert.alert(
      `${action} User`,
      `Are you sure you want to ${action.toLowerCase()} ${displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            await secureStorage.updateContact(contactId, { isBlocked: !isBlocked });
            setContact(prev => prev ? { ...prev, isBlocked: !isBlocked } : null);
            Alert.alert('Done', `User has been ${isBlocked ? 'unblocked' : 'blocked'}.`);
          },
        },
      ]
    );
  };

  const handleReportUser = () => {
    Alert.alert(
      'Report User',
      'Select a reason for reporting this user:',
      [
        {
          text: 'Inappropriate Content',
          onPress: () => submitReport('inappropriate_content'),
        },
        {
          text: 'Harassment',
          onPress: () => submitReport('harassment'),
        },
        {
          text: 'Spam',
          onPress: () => submitReport('spam'),
        },
        {
          text: 'Child Safety Concern',
          style: 'destructive',
          onPress: () => submitReport('child_safety'),
        },
        {
          text: 'Other',
          onPress: () => submitReport('other'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const submitReport = (reason: 'inappropriate_content' | 'harassment' | 'spam' | 'child_safety' | 'other') => {
    const success = messagingService.reportUser(contactId, reason);
    if (success) {
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. Our safety team will review it promptly.',
        [{ text: 'OK' }]
      );
    } else {
      // Fallback to email if not connected
      Alert.alert(
        'Connection Required',
        'Unable to submit report. Please try again when connected, or send an email to safety@sarjmobile.com',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Email',
            onPress: () => {
              const subject = encodeURIComponent(`Report: ${contactId}`);
              const body = encodeURIComponent(
                `I would like to report the following user:\n\nWhisper ID: ${contactId}\nReason: ${reason}\n\n---\nSent from Whisper App`
              );
              Linking.openURL(`mailto:safety@sarjmobile.com?subject=${subject}&body=${body}`);
            },
          },
        ]
      );
    }
  };

  const handleDeleteChat = () => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this conversation? All messages will be permanently removed from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await secureStorage.deleteConversation(contactId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleEditNickname = () => {
    setNicknameInput(contact?.nickname || '');
    setNicknameModalVisible(true);
  };

  const saveNickname = async () => {
    const newNickname = nicknameInput.trim();
    await secureStorage.updateContact(contactId, { nickname: newNickname || undefined });
    setContact(prev => prev ? { ...prev, nickname: newNickname || undefined } : null);
    setNicknameModalVisible(false);
    setNicknameInput('');
  };

  // Disappearing messages options
  const DISAPPEAR_OPTIONS = [
    { label: 'Off', value: 0 },
    { label: '24 hours', value: 86400000 },
    { label: '7 days', value: 604800000 },
    { label: '30 days', value: 2592000000 },
  ];

  const getDisappearLabel = (ms: number | undefined): string => {
    if (!ms || ms === 0) return 'Off';
    const option = DISAPPEAR_OPTIONS.find(o => o.value === ms);
    return option ? option.label : 'Off';
  };

  const handleDisappearingMessages = () => {
    Alert.alert(
      'Disappearing Messages',
      'Messages will auto-delete after the selected time period.',
      [
        ...DISAPPEAR_OPTIONS.map(option => ({
          text: option.label + (conversation?.disappearAfter === option.value ? ' (current)' : ''),
          onPress: async () => {
            await secureStorage.updateConversation(contactId, { disappearAfter: option.value });
            setConversation(prev => prev ? { ...prev, disappearAfter: option.value } : null);
            if (option.value > 0) {
              Alert.alert('Enabled', `Messages will disappear after ${option.label}.`);
            } else {
              Alert.alert('Disabled', 'Disappearing messages have been turned off.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const showOptionsMenu = () => {
    Alert.alert(
      'Options',
      undefined,
      [
        {
          text: 'Edit Nickname',
          onPress: handleEditNickname,
        },
        {
          text: `Disappearing Messages (${getDisappearLabel(conversation?.disappearAfter)})`,
          onPress: handleDisappearingMessages,
        },
        {
          text: isBlocked ? 'Unblock User' : 'Block User',
          onPress: handleBlockUser,
          style: isBlocked ? 'default' : 'destructive',
        },
        {
          text: 'Report User',
          onPress: handleReportUser,
          style: 'destructive',
        },
        {
          text: 'Delete Chat',
          onPress: handleDeleteChat,
          style: 'destructive',
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === user?.whisperId;
    const hasReply = !!item.replyTo;
    const hasImage = !!item.image;
    const replySenderName = hasReply
      ? item.replyTo!.senderId === user?.whisperId
        ? 'You'
        : contact?.nickname || contact?.username || 'Them'
      : '';

    // Calculate image display dimensions
    const screenWidth = Dimensions.get('window').width;
    const maxImageWidth = screenWidth * 0.65;
    const maxImageHeight = 300;
    let imageWidth = maxImageWidth;
    let imageHeight = maxImageHeight;

    if (hasImage && item.image) {
      const aspectRatio = item.image.width / item.image.height;
      if (aspectRatio > 1) {
        imageWidth = Math.min(maxImageWidth, item.image.width);
        imageHeight = imageWidth / aspectRatio;
      } else {
        imageHeight = Math.min(maxImageHeight, item.image.height);
        imageWidth = imageHeight * aspectRatio;
      }
    }

    return (
      <Swipeable
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        rightThreshold={40}
        overshootRight={false}
      >
        <Pressable
          onLongPress={() => handleLongPressMessage(item)}
          delayLongPress={500}
          style={[styles.messageContainer, isMine && styles.messageContainerMine]}
        >
          <View style={[
            styles.messageBubble,
            isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
            hasImage && styles.imageBubble
          ]}>
            {/* Forwarded Label */}
            {item.isForwarded && (
              <Text style={[styles.forwardedLabel, isMine && styles.forwardedLabelMine]}>
                Forwarded
              </Text>
            )}
            {/* Reply Quote */}
            {hasReply && (
              <View style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs]}>
                <Text style={[styles.replyQuoteSender, isMine && styles.replyQuoteSenderMine]}>
                  {replySenderName}
                </Text>
                <Text
                  style={[styles.replyQuoteText, isMine && styles.replyQuoteTextMine]}
                  numberOfLines={2}
                >
                  {item.replyTo!.content}
                </Text>
              </View>
            )}
            {/* Image Message */}
            {hasImage && item.image && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setViewingImage({
                  uri: item.image!.uri,
                  width: item.image!.width,
                  height: item.image!.height,
                })}
              >
                <Image
                  source={{ uri: item.image.uri }}
                  style={[styles.messageImage, { width: imageWidth, height: imageHeight }]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
            {/* Voice Message */}
            {item.voice ? (
              <TouchableOpacity
                style={styles.voiceMessageContainer}
                onPress={() => playVoice(item.id, item.voice!.uri)}
              >
                <View style={[styles.voicePlayButton, isMine && styles.voicePlayButtonMine]}>
                  <Text style={styles.voicePlayButtonText}>
                    {playingVoiceId === item.id ? '||' : '\u25B6'}
                  </Text>
                </View>
                <View style={styles.voiceWaveform}>
                  <View style={[styles.voiceWaveformBar, { height: 8 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 14 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 10 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 18 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 12 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 16 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 8 }]} />
                  <View style={[styles.voiceWaveformBar, { height: 14 }]} />
                </View>
                <Text style={[styles.voiceDuration, isMine && styles.voiceDurationMine]}>
                  {formatVoiceDurationMs(item.voice.duration)}
                </Text>
              </TouchableOpacity>
            ) : item.file ? (
              <TouchableOpacity
                style={[styles.fileCard, isMine ? styles.fileCardMine : styles.fileCardTheirs]}
                onPress={() => handleOpenFile(item.file!)}
              >
                <Text style={styles.fileIcon}>{getFileIcon(item.file.mimeType)}</Text>
                <View style={styles.fileInfo}>
                  <Text
                    style={[styles.fileName, isMine && styles.fileNameMine]}
                    numberOfLines={1}
                  >
                    {item.file.name}
                  </Text>
                  <Text style={[styles.fileSize, isMine && styles.fileSizeMine]}>
                    {formatFileSize(item.file.size)}
                  </Text>
                </View>
                <Text style={[styles.fileOpenIcon, isMine && styles.fileOpenIconMine]}>
                  {'\u2197'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                {item.content}
              </Text>
            )}
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

          {/* Reactions display */}
          {item.reactions && Object.keys(item.reactions).length > 0 && (
            <View style={[styles.reactionsContainer, isMine && styles.reactionsContainerMine]}>
              {Object.entries(item.reactions).map(([oderId, emoji]) => (
                <TouchableOpacity
                  key={oderId}
                  style={[
                    styles.reactionBubble,
                    oderId === user?.whisperId && styles.reactionBubbleMine,
                  ]}
                  onPress={() => {
                    if (oderId === user?.whisperId) {
                      handleRemoveOwnReaction(item);
                    }
                  }}
                  activeOpacity={oderId === user?.whisperId ? 0.6 : 1}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Pressable>
      </Swipeable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={isSearching ? closeSearch : () => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>{isSearching ? '×' : '←'}</Text>
        </TouchableOpacity>
        {isSearching ? (
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
          </View>
        ) : (
          <View style={styles.headerInfo}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{getInitials(displayName)}</Text>
            </View>
            <View style={styles.headerTextContainer}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {displayName}
                </Text>
                {conversation?.disappearAfter && conversation.disappearAfter > 0 && (
                  <Text style={styles.disappearingIcon}>&#9201;</Text>
                )}
              </View>
              <Text style={[styles.headerStatus, !isConnected && styles.headerStatusOffline, isContactTyping && styles.headerStatusTyping]}>
                {isBlocked ? 'Blocked' : isContactTyping ? 'typing...' : isConnected ? 'Encrypted' : 'Offline'}
              </Text>
            </View>
          </View>
        )}
        {!isSearching && (
          <>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => navigation.navigate('Call', { contactId, isIncoming: false })}
              disabled={isBlocked}
            >
              <Text style={[styles.callButtonText, isBlocked && styles.callButtonDisabled]}>{'\uD83D\uDCDE'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => navigation.navigate('VideoCall', { contactId, isIncoming: false })}
              disabled={isBlocked}
            >
              <Text style={[styles.callButtonText, isBlocked && styles.callButtonDisabled]}>{'\uD83D\uDCF9'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.searchButton} onPress={() => setIsSearching(true)}>
              <Text style={styles.searchButtonText}>&#128269;</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={styles.menuButton} onPress={showOptionsMenu}>
          <Text style={styles.menuButtonText}>&#8942;</Text>
        </TouchableOpacity>
      </View>

      {/* Message Request Banner */}
      {isMessageRequest && (
        <View style={styles.messageRequestBanner}>
          <Text style={styles.messageRequestBannerText}>
            This is a message request. Accept to add to contacts.
          </Text>
          <View style={styles.messageRequestButtons}>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptRequest}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.blockButton} onPress={handleBlockRequest}>
              <Text style={styles.blockButtonText}>Block</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 30}
      >
        {/* Search Results Indicator */}
        {isSearching && searchQuery.length > 0 && (
          <View style={styles.searchResultsIndicator}>
            <Text style={styles.searchResultsText}>
              {filteredMessages.length === 0
                ? 'No results found'
                : `${filteredMessages.length} result${filteredMessages.length !== 1 ? 's' : ''} found`}
            </Text>
          </View>
        )}

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={filteredMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messagesList}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                {isSearching && searchQuery.length > 0
                  ? 'No messages match your search.'
                  : 'Messages are end-to-end encrypted.\nStart the conversation!'}
              </Text>
            </View>
          }
        />

        {/* Input */}
        {isBlocked ? (
          <View style={styles.blockedNotice}>
            <Text style={styles.blockedNoticeText}>
              You have blocked this user. Unblock to send messages.
            </Text>
          </View>
        ) : (
          <View>
            {/* Reply Preview Bar */}
            {replyingTo && (
              <View style={styles.replyPreviewBar}>
                <View style={styles.replyPreviewContent}>
                  <Text style={styles.replyPreviewLabel}>
                    Replying to {getReplyingSenderName(replyingTo.senderId)}
                  </Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>
                    {getReplyPreviewText(replyingTo.content)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.replyPreviewCancel}
                  onPress={cancelReply}
                >
                  <Text style={styles.replyPreviewCancelText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {isRecordingLocal ? (
              <View style={styles.recordingContainer}>
                <TouchableOpacity style={styles.cancelRecordingButton} onPress={cancelRecording}>
                  <Text style={styles.cancelRecordingText}>Cancel</Text>
                </TouchableOpacity>
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingDuration}>{formatVoiceDuration(recordingDuration)}</Text>
                </View>
                <TouchableOpacity style={styles.sendRecordingButton} onPress={stopRecording}>
                  <Text style={styles.sendRecordingText}>Send</Text>
                </TouchableOpacity>
              </View>
            ) : (
            <View style={styles.inputContainer}>
              {/* Voice recording button */}
              <TouchableOpacity style={styles.micButton} onPress={startRecording}>
                <Text style={styles.micButtonText}>🎤</Text>
              </TouchableOpacity>
              {/* File attachment button */}
              <TouchableOpacity
                style={styles.attachButton}
                onPress={handleAttachFile}
                disabled={isSendingFile}
              >
                {isSendingFile ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.attachButtonText}>{'\uD83D\uDCCE'}</Text>
                )}
              </TouchableOpacity>
              {/* Image picker button */}
              <TouchableOpacity
                style={styles.attachButton}
                onPress={pickAndSendImage}
                disabled={isSendingImage}
              >
                {isSendingImage ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.attachButtonText}>&#128247;</Text>
                )}
              </TouchableOpacity>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={inputText}
                onChangeText={handleTextChange}
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
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Nickname Edit Modal */}
      <Modal
        visible={nicknameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Nickname</Text>
            <Text style={styles.modalSubtitle}>
              Set a custom name for this contact
            </Text>
            <TextInput
              style={styles.modalInput}
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Enter nickname"
              placeholderTextColor={colors.textMuted}
              autoFocus
              maxLength={50}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  setNicknameModalVisible(false);
                  setNicknameInput('');
                }}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonSave}
                onPress={saveNickname}
              >
                <Text style={styles.modalButtonSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reaction Picker Modal */}
      <Modal
        visible={reactionPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReactionPickerVisible(false);
          setReactionMessage(null);
        }}
      >
        <Pressable
          style={styles.reactionPickerOverlay}
          onPress={() => {
            setReactionPickerVisible(false);
            setReactionMessage(null);
          }}
        >
          <View style={styles.reactionPickerContainer}>
            <View style={styles.reactionPickerRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.reactionPickerItem,
                    reactionMessage?.reactions?.[user?.whisperId || ''] === emoji &&
                      styles.reactionPickerItemSelected,
                  ]}
                  onPress={() => handleSelectReaction(emoji)}
                >
                  <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Full-Screen Image Viewer Modal */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.imageViewerContainer}>
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={() => setViewingImage(null)}
          >
            <Text style={styles.imageViewerCloseText}>✕</Text>
          </TouchableOpacity>
          {viewingImage && (
            <Image
              source={{ uri: viewingImage.uri }}
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.imageViewerShareButton}
            onPress={async () => {
              if (viewingImage) {
                try {
                  const isAvailable = await Sharing.isAvailableAsync();
                  if (isAvailable) {
                    await Sharing.shareAsync(viewingImage.uri);
                  }
                } catch (e) {
                  console.error('Failed to share image:', e);
                }
              }
            }}
          >
            <Text style={styles.imageViewerShareText}>Share</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
    width: moderateScale(40),
    height: moderateScale(40),
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
    width: moderateScale(40),
    height: moderateScale(40),
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
  headerStatusTyping: {
    color: colors.primary,
    fontStyle: 'italic',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  disappearingIcon: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  callButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButtonText: {
    fontSize: fontSize.lg,
  },
  callButtonDisabled: {
    opacity: 0.3,
  },
  menuButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    fontSize: fontSize.xxl,
    color: colors.textSecondary,
  },
  searchButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    fontSize: fontSize.lg,
  },
  searchInputContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  searchResultsIndicator: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchResultsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
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
  imageBubble: {
    padding: spacing.xs,
    overflow: 'hidden',
  },
  messageImage: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: moderateScale(22),
  },
  messageTextMine: {
    color: colors.text,
  },
  forwardedLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  forwardedLabelMine: {
    color: 'rgba(255,255,255,0.6)',
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
  attachButton: {
    width: moderateScale(44),
    height: moderateScale(44),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  attachButtonText: {
    fontSize: fontSize.xl,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: moderateScale(100),
    marginRight: spacing.sm,
  },
  sendButton: {
    width: moderateScale(44),
    height: moderateScale(44),
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
  blockedNotice: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  blockedNoticeText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButtonCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
  },
  modalButtonCancelText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  modalButtonSave: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  modalButtonSaveText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  // Reaction styles
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    marginLeft: spacing.md,
  },
  reactionsContainerMine: {
    justifyContent: 'flex-end',
    marginLeft: 0,
    marginRight: spacing.md,
  },
  reactionBubble: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionBubbleMine: {
    backgroundColor: colors.primary + '30',
    borderColor: colors.primary,
  },
  reactionEmoji: {
    fontSize: fontSize.md,
  },
  // Reaction picker modal styles
  reactionPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionPickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  reactionPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reactionPickerItem: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  reactionPickerItemSelected: {
    backgroundColor: colors.primary + '30',
  },
  reactionPickerEmoji: {
    fontSize: moderateScale(28),
  },
  // File card styles
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  fileCardMine: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  fileCardTheirs: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  fileIcon: {
    fontSize: moderateScale(28),
    marginRight: spacing.sm,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  fileNameMine: {
    color: colors.text,
  },
  fileSize: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  fileSizeMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  fileOpenIcon: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  fileOpenIconMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  // Reply Quote styles (shown above message bubble)
  replyQuote: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 4,
    borderRadius: 4,
  },
  replyQuoteMine: {
    borderLeftColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  replyQuoteTheirs: {
    borderLeftColor: '#10b981',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  replyQuoteSender: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 2,
  },
  replyQuoteSenderMine: {
    color: 'rgba(255,255,255,0.8)',
  },
  replyQuoteText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  replyQuoteTextMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  // Reply Preview Bar styles (shown above input)
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d2d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#404040',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
    marginBottom: 2,
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#d1d5db',
  },
  replyPreviewCancel: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyPreviewCancelText: {
    fontSize: 24,
    color: '#9ca3af',
  },
  // Voice recording styles
  micButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonText: {
    fontSize: fontSize.xl,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.error + '20',
  },
  cancelRecordingButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelRecordingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
    marginRight: spacing.sm,
  },
  recordingDuration: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  sendRecordingButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  sendRecordingText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  // Voice message playback styles
  voiceMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    minWidth: 150,
  },
  voicePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  voicePlayButtonMine: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  voicePlayButtonText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  voiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  voiceWaveformBar: {
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 2,
    marginHorizontal: 1,
  },
  voiceDuration: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  voiceDurationMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  messageRequestBanner: {
    backgroundColor: colors.warning || '#F59E0B',
    padding: spacing.md,
    alignItems: 'center',
  },
  messageRequestBannerText: {
    color: '#000',
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  messageRequestButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  acceptButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  blockButton: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  blockButtonText: {
    color: '#000',
    fontSize: fontSize.sm,
    fontWeight: '600',
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
  // Image viewer modal styles
  imageViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: spacing.xl + 20,
    right: spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerCloseText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '600',
  },
  imageViewerImage: {
    width: '100%',
    height: '80%',
  },
  imageViewerShareButton: {
    position: 'absolute',
    bottom: spacing.xl + 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  imageViewerShareText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
