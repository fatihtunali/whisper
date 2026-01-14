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
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Message, Group, Contact, FileAttachment, ImageAttachment, VoiceMessage } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { useAuth } from '../context/AuthContext';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { formatTime, getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type GroupChatRouteProp = RouteProp<RootStackParamList, 'GroupChat'>;

const screenWidth = Dimensions.get('window').width;

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
  const [showAttachments, setShowAttachments] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<InstanceType<typeof AudioModule.AudioPlayer> | null>(null);

  // Max image size for sending
  const MAX_IMAGE_SIZE = 1024;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/json',
    'application/zip',
  ];

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

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.remove();
      }
    };
  }, []);

  const loadData = async () => {
    const loadedGroup = await secureStorage.getGroup(groupId);
    if (!loadedGroup) {
      Alert.alert('Error', 'Group not found');
      navigation.goBack();
      return;
    }
    setGroup(loadedGroup);

    const loadedMessages = await secureStorage.getGroupMessages(groupId);
    setMessages(loadedMessages.reverse());

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

  // Image picker
  const handlePickImage = async () => {
    setShowAttachments(false);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      await sendImage(result.assets[0]);
    }
  };

  // Camera
  const handleTakePhoto = async () => {
    setShowAttachments(false);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      await sendImage(result.assets[0]);
    }
  };

  // Send image
  const sendImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!group || !user || !asset.base64) return;

    setIsSendingImage(true);
    try {
      // For group messages, we'll store the image locally and just send a text placeholder
      // Full group image support would need server-side changes
      const imageUri = asset.uri;
      const width = asset.width;
      const height = asset.height;

      // Create a message with image
      const message: Message = {
        id: `img-${Date.now()}`,
        conversationId: groupId,
        senderId: user.whisperId,
        content: '',
        timestamp: Date.now(),
        status: 'sent',
        groupId,
        senderName: user.username || user.whisperId,
        image: { uri: imageUri, width, height },
      };

      await secureStorage.addGroupMessage(groupId, message);
      setMessages(prev => [message, ...prev]);

      // Note: Full server-side group image support would need additional implementation
      Alert.alert('Note', 'Image saved locally. Group image sharing requires server update.');
    } catch (error) {
      console.error('Failed to send image:', error);
      Alert.alert('Error', 'Failed to send image');
    } finally {
      setIsSendingImage(false);
    }
  };

  // File picker
  const handlePickFile = async () => {
    setShowAttachments(false);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];

        if (file.size && file.size > MAX_FILE_SIZE) {
          Alert.alert('File Too Large', 'Maximum file size is 10MB.');
          return;
        }

        await sendFile(file);
      }
    } catch (error) {
      console.error('Failed to pick file:', error);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  // Send file
  const sendFile = async (file: DocumentPicker.DocumentPickerAsset) => {
    if (!group || !user) return;

    setIsSendingFile(true);
    try {
      const fileAttachment: FileAttachment = {
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType || 'application/octet-stream',
        uri: file.uri,
      };

      const message: Message = {
        id: `file-${Date.now()}`,
        conversationId: groupId,
        senderId: user.whisperId,
        content: '',
        timestamp: Date.now(),
        status: 'sent',
        groupId,
        senderName: user.username || user.whisperId,
        file: fileAttachment,
      };

      await secureStorage.addGroupMessage(groupId, message);
      setMessages(prev => [message, ...prev]);

      Alert.alert('Note', 'File saved locally. Group file sharing requires server update.');
    } catch (error) {
      console.error('Failed to send file:', error);
      Alert.alert('Error', 'Failed to send file');
    } finally {
      setIsSendingFile(false);
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (uri && group && user) {
        const duration = recordingDuration * 1000;

        const message: Message = {
          id: `voice-${Date.now()}`,
          conversationId: groupId,
          senderId: user.whisperId,
          content: '',
          timestamp: Date.now(),
          status: 'sent',
          groupId,
          senderName: user.username || user.whisperId,
          voice: { uri, duration },
        };

        await secureStorage.addGroupMessage(groupId, message);
        setMessages(prev => [message, ...prev]);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }

    setRecordingDuration(0);
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      await audioRecorder.stop();
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }

    setRecordingDuration(0);
  };

  // Play voice message
  const playVoice = async (messageId: string, uri: string) => {
    try {
      if (playingVoiceId === messageId) {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.remove();
          audioPlayerRef.current = null;
        }
        setPlayingVoiceId(null);
        return;
      }

      if (audioPlayerRef.current) {
        audioPlayerRef.current.remove();
      }

      const player = new AudioModule.AudioPlayer(uri, 500, false);
      audioPlayerRef.current = player;
      setPlayingVoiceId(messageId);

      // Set up listener for playback completion
      player.addListener('playbackStatusUpdate', (status) => {
        if (!status.playing && status.currentTime >= status.duration - 100) {
          setPlayingVoiceId(null);
        }
      });

      player.play();

      // Reset when done
      setTimeout(() => {
        setPlayingVoiceId(null);
      }, 30000);
    } catch (error) {
      console.error('Failed to play voice:', error);
      setPlayingVoiceId(null);
    }
  };

  // Open file
  const handleOpenFile = async (file: FileAttachment) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(file.uri);

      if (!fileInfo.exists) {
        Alert.alert('File Not Found', 'The file is no longer available.');
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: file.mimeType,
          dialogTitle: `Open ${file.name}`,
        });
      } else {
        Alert.alert('Cannot Open', 'Unable to open this file type.');
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      Alert.alert('Error', 'Failed to open the file.');
    }
  };

  // Format voice duration
  const formatVoiceDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatVoiceDurationMs = (ms: number): string => {
    return formatVoiceDuration(Math.floor(ms / 1000));
  };

  // Get file icon
  const getFileIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('text')) return '📃';
    if (mimeType.includes('zip')) return '📦';
    return '📎';
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Delete message
  const handleDeleteMessage = useCallback(async (message: Message) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
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

  // Render swipe action
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
    const hasImage = !!item.image;
    const hasVoice = !!item.voice;
    const hasFile = !!item.file;

    // Calculate image dimensions
    const maxImageWidth = screenWidth * 0.55;
    const maxImageHeight = 250;
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
            {hasVoice && item.voice && (
              <TouchableOpacity
                style={styles.voiceMessageContainer}
                onPress={() => playVoice(item.id, item.voice!.uri)}
              >
                <View style={[styles.voicePlayButton, isOwn && styles.voicePlayButtonOwn]}>
                  <Text style={styles.voicePlayButtonText}>
                    {playingVoiceId === item.id ? '⏸' : '▶'}
                  </Text>
                </View>
                <View style={styles.voiceWaveform}>
                  {[8, 14, 10, 18, 12, 16, 8, 14].map((h, i) => (
                    <View key={i} style={[styles.voiceWaveformBar, { height: h }]} />
                  ))}
                </View>
                <Text style={[styles.voiceDuration, isOwn && styles.voiceDurationOwn]}>
                  {formatVoiceDurationMs(item.voice.duration)}
                </Text>
              </TouchableOpacity>
            )}

            {/* File Message */}
            {hasFile && item.file && (
              <TouchableOpacity
                style={[styles.fileCard, isOwn ? styles.fileCardOwn : styles.fileCardOther]}
                onPress={() => handleOpenFile(item.file!)}
              >
                <Text style={styles.fileIcon}>{getFileIcon(item.file.mimeType)}</Text>
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, isOwn && styles.fileNameOwn]} numberOfLines={1}>
                    {item.file.name}
                  </Text>
                  <Text style={[styles.fileSize, isOwn && styles.fileSizeOwn]}>
                    {formatFileSize(item.file.size)}
                  </Text>
                </View>
                <Text style={[styles.fileOpenIcon, isOwn && styles.fileOpenIconOwn]}>↗</Text>
              </TouchableOpacity>
            )}

            {/* Text Content */}
            {item.content && !hasVoice && !hasFile && (
              <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>
                {item.content}
              </Text>
            )}

            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
                {formatTime(item.timestamp)}
              </Text>
              {isOwn && (
                <Text style={styles.messageStatus}>
                  {item.status === 'sending' && '○'}
                  {item.status === 'sent' && '✓'}
                  {item.status === 'delivered' && '✓✓'}
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
          {/* Group Call Button */}
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => Alert.alert('Coming Soon', 'Group calls will be available in a future update.')}
          >
            <Text style={styles.callButtonText}>📞</Text>
          </TouchableOpacity>
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

      {/* Attachment Picker */}
      {showAttachments && (
        <View style={styles.attachmentPicker}>
          <TouchableOpacity style={styles.attachmentOption} onPress={handleTakePhoto}>
            <Text style={styles.attachmentIcon}>📷</Text>
            <Text style={styles.attachmentLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachmentOption} onPress={handlePickImage}>
            <Text style={styles.attachmentIcon}>🖼️</Text>
            <Text style={styles.attachmentLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachmentOption} onPress={handlePickFile}>
            <Text style={styles.attachmentIcon}>📄</Text>
            <Text style={styles.attachmentLabel}>File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recording UI */}
      {audioRecorder.isRecording && (
        <View style={styles.recordingContainer}>
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatVoiceDuration(recordingDuration)}</Text>
          </View>
          <View style={styles.recordingButtons}>
            <TouchableOpacity style={styles.cancelRecordingButton} onPress={cancelRecording}>
              <Text style={styles.cancelRecordingText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopRecordingButton} onPress={stopRecording}>
              <Text style={styles.stopRecordingText}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Input */}
      {!audioRecorder.isRecording && (
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => setShowAttachments(!showAttachments)}
          >
            <Text style={styles.attachButtonText}>+</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={5000}
          />

          {inputText.trim() ? (
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Text style={styles.sendButtonText}>{'>'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={startRecording}
              style={styles.micButton}
            >
              <Text style={styles.micButtonText}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Sending Indicator */}
      {(isSendingImage || isSendingFile) && (
        <View style={styles.sendingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.sendingText}>Sending...</Text>
        </View>
      )}

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
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  callButton: {
    padding: spacing.sm,
    marginRight: spacing.xs,
  },
  callButtonText: {
    fontSize: fontSize.lg,
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
  // Image styles
  messageImage: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  // Voice styles
  voiceMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  voicePlayButton: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  voicePlayButtonOwn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  voicePlayButtonText: {
    fontSize: fontSize.md,
  },
  voiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  voiceWaveformBar: {
    width: 3,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    marginHorizontal: 1,
  },
  voiceDuration: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  voiceDurationOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  // File styles
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  fileCardOwn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  fileCardOther: {
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
  fileNameOwn: {
    color: colors.text,
  },
  fileSize: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  fileSizeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  fileOpenIcon: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  fileOpenIconOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  // Input styles
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  attachButtonText: {
    fontSize: fontSize.xl,
    color: colors.primary,
    fontWeight: '600',
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
  sendButtonText: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '700',
  },
  micButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  micButtonText: {
    fontSize: fontSize.lg,
  },
  // Attachment picker
  attachmentPicker: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  attachmentOption: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  attachmentIcon: {
    fontSize: moderateScale(28),
    marginBottom: spacing.xs,
  },
  attachmentLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  // Recording UI
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  recordingTime: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '600',
  },
  recordingButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelRecordingButton: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cancelRecordingText: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '700',
  },
  stopRecordingButton: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopRecordingText: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '700',
  },
  // Sending overlay
  sendingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  // Swipe delete
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
  // Image viewer modal
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
