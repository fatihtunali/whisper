import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  secureStorage,
  PrivacySettings,
  AppLockSettings,
  NotificationSettings,
  MESSAGE_SOUNDS,
  CALL_RINGTONES,
} from '../storage/SecureStorage';
import { spacing, fontSize, borderRadius, ThemeColors } from '../utils/theme';
import { moderateScale } from '../utils/responsive';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { isDark, colors, toggleTheme } = useTheme();
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    readReceipts: true,
    typingIndicator: true,
    showOnlineStatus: true,
  });
  const [appLockSettings, setAppLockSettings] = useState<AppLockSettings>({
    enabled: false,
    useBiometrics: false,
  });
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    enabled: true,
    messageSound: 'default',
    callRingtone: 'default',
    vibrate: true,
    showPreview: true,
  });
  const [soundPickerVisible, setSoundPickerVisible] = useState(false);
  const [ringtonePickerVisible, setRingtonePickerVisible] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  // Create dynamic styles based on current theme colors
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    loadPrivacySettings();
    loadNotificationSettings();
    checkBiometrics();
  }, []);

  // Reload app lock settings when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadAppLockSettings();
    }, [])
  );

  const loadAppLockSettings = async () => {
    const settings = await secureStorage.getAppLockSettings();
    setAppLockSettings(settings);
  };

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricsAvailable(hasHardware && isEnrolled);
  };

  const loadPrivacySettings = async () => {
    const settings = await secureStorage.getPrivacySettings();
    setPrivacySettings(settings);
  };

  const loadNotificationSettings = async () => {
    const settings = await secureStorage.getNotificationSettings();
    setNotificationSettings(settings);
  };

  const handleNotificationToggle = async (value: boolean) => {
    const newSettings = { ...notificationSettings, enabled: value };
    setNotificationSettings(newSettings);
    await secureStorage.setNotificationSettings(newSettings);
  };

  const handleVibrateToggle = async (value: boolean) => {
    const newSettings = { ...notificationSettings, vibrate: value };
    setNotificationSettings(newSettings);
    await secureStorage.setNotificationSettings(newSettings);
  };

  const handleShowPreviewToggle = async (value: boolean) => {
    const newSettings = { ...notificationSettings, showPreview: value };
    setNotificationSettings(newSettings);
    await secureStorage.setNotificationSettings(newSettings);
  };

  const handleMessageSoundSelect = async (soundId: string) => {
    const newSettings = { ...notificationSettings, messageSound: soundId };
    setNotificationSettings(newSettings);
    await secureStorage.setNotificationSettings(newSettings);
    setSoundPickerVisible(false);
  };

  const handleCallRingtoneSelect = async (ringtoneId: string) => {
    const newSettings = { ...notificationSettings, callRingtone: ringtoneId };
    setNotificationSettings(newSettings);
    await secureStorage.setNotificationSettings(newSettings);
    setRingtonePickerVisible(false);
  };

  const getMessageSoundName = () => {
    const sound = MESSAGE_SOUNDS.find(s => s.id === notificationSettings.messageSound);
    return sound?.name || 'Default';
  };

  const getCallRingtoneName = () => {
    const ringtone = CALL_RINGTONES.find(r => r.id === notificationSettings.callRingtone);
    return ringtone?.name || 'Default';
  };

  const handleReadReceiptsToggle = async (value: boolean) => {
    const newSettings = { ...privacySettings, readReceipts: value };
    setPrivacySettings(newSettings);
    await secureStorage.setPrivacySettings(newSettings);
  };

  const handleTypingIndicatorToggle = async (value: boolean) => {
    const newSettings = { ...privacySettings, typingIndicator: value };
    setPrivacySettings(newSettings);
    await secureStorage.setPrivacySettings(newSettings);
  };

  const handleOnlineStatusToggle = async (value: boolean) => {
    const newSettings = { ...privacySettings, showOnlineStatus: value };
    setPrivacySettings(newSettings);
    await secureStorage.setPrivacySettings(newSettings);
  };

  const handleAppLockToggle = async (value: boolean) => {
    if (value) {
      // Navigate to SetupPin screen to set up PIN
      navigation.navigate('SetupPin', { isChangingPin: false });
    } else {
      // Disable app lock
      Alert.alert(
        'Disable App Lock',
        'Are you sure you want to disable app lock? Anyone with access to your device will be able to open Whisper.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              await secureStorage.setAppLockSettings({
                enabled: false,
                useBiometrics: false,
                pinHash: undefined,
              });
              setAppLockSettings({ enabled: false, useBiometrics: false });
            },
          },
        ]
      );
    }
  };

  const handleBiometricsToggle = async (value: boolean) => {
    if (!appLockSettings.enabled) return;

    const newSettings = { ...appLockSettings, useBiometrics: value };
    setAppLockSettings(newSettings);
    await secureStorage.setAppLockSettings(newSettings);
  };

  const handleChangePin = () => {
    navigation.navigate('SetupPin', { isChangingPin: true });
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out? Make sure you have your recovery phrase saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete all your data from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'You will lose all messages and contacts. You can recover your identity with your seed phrase, but your messages will be gone forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: logout,
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <TouchableOpacity
          style={styles.profileSection}
          onPress={() => navigation.navigate('Profile')}
        >
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {user?.username?.[0]?.toUpperCase() || '👤'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.username || 'Anonymous User'}
            </Text>
            <Text style={styles.profileId}>{user?.whisperId}</Text>
          </View>
          <Text style={styles.chevron}>→</Text>
        </TouchableOpacity>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('MyQR')}
          >
            <Text style={styles.menuIcon}>📱</Text>
            <Text style={styles.menuText}>My QR Code</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.menuIcon}>🔑</Text>
            <Text style={styles.menuText}>Recovery Phrase</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.menuItemWithToggle}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>🔐</Text>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>App Lock</Text>
                <Text style={styles.menuDescription}>
                  Require PIN to open Whisper
                </Text>
              </View>
            </View>
            <Switch
              value={appLockSettings.enabled}
              onValueChange={handleAppLockToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
          {appLockSettings.enabled && biometricsAvailable && (
            <View style={styles.menuItemWithToggle}>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuIcon}>
                  {Platform.OS === 'ios' ? '(faceID)' : '(fingerprint)'}
                </Text>
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuText}>
                    Use {Platform.OS === 'ios' ? 'Face ID' : 'Fingerprint'}
                  </Text>
                  <Text style={styles.menuDescription}>
                    Unlock with biometrics instead of PIN
                  </Text>
                </View>
              </View>
              <Switch
                value={appLockSettings.useBiometrics}
                onValueChange={handleBiometricsToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#ffffff"
              />
            </View>
          )}
          {appLockSettings.enabled && (
            <TouchableOpacity style={styles.menuItem} onPress={handleChangePin}>
              <Text style={styles.menuIcon}>🔢</Text>
              <Text style={styles.menuText}>Change PIN</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔒</Text>
            <Text style={styles.menuText}>End-to-End Encryption</Text>
            <Text style={styles.menuStatus}>On</Text>
          </View>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>📊</Text>
            <Text style={styles.menuText}>Analytics</Text>
            <Text style={styles.menuStatus}>Off</Text>
          </View>
        </View>

        {/* Privacy Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.menuItemWithToggle}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>👁️</Text>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Send Read Receipts</Text>
                <Text style={styles.menuDescription}>
                  Let others know when you've read their messages
                </Text>
              </View>
            </View>
            <Switch
              value={privacySettings.readReceipts}
              onValueChange={handleReadReceiptsToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={isDark ? '#ffffff' : '#ffffff'}
            />
          </View>
          <View style={styles.menuItemWithToggle}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>⌨️</Text>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Show Typing Indicator</Text>
                <Text style={styles.menuDescription}>
                  Let others see when you're typing a message
                </Text>
              </View>
            </View>
            <Switch
              value={privacySettings.typingIndicator}
              onValueChange={handleTypingIndicatorToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={isDark ? '#ffffff' : '#ffffff'}
            />
          </View>
          <View style={styles.menuItemWithToggle}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>🟢</Text>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Show Online Status</Text>
                <Text style={styles.menuDescription}>
                  Let others see when you're online
                </Text>
              </View>
            </View>
            <Switch
              value={privacySettings.showOnlineStatus}
              onValueChange={handleOnlineStatusToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={isDark ? '#ffffff' : '#ffffff'}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.menuItemWithToggle}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>🔔</Text>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Enable Notifications</Text>
                <Text style={styles.menuDescription}>
                  Receive message and call notifications
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.enabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
          {notificationSettings.enabled && (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setSoundPickerVisible(true)}
              >
                <Text style={styles.menuIcon}>🔊</Text>
                <Text style={styles.menuText}>Message Sound</Text>
                <Text style={styles.menuValue}>{getMessageSoundName()}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setRingtonePickerVisible(true)}
              >
                <Text style={styles.menuIcon}>📞</Text>
                <Text style={styles.menuText}>Call Ringtone</Text>
                <Text style={styles.menuValue}>{getCallRingtoneName()}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <View style={styles.menuItemWithToggle}>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuIcon}>📳</Text>
                  <View style={styles.menuTextContainer}>
                    <Text style={styles.menuText}>Vibrate</Text>
                    <Text style={styles.menuDescription}>
                      Vibrate on new messages and calls
                    </Text>
                  </View>
                </View>
                <Switch
                  value={notificationSettings.vibrate}
                  onValueChange={handleVibrateToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
              <View style={styles.menuItemWithToggle}>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuIcon}>👁️</Text>
                  <View style={styles.menuTextContainer}>
                    <Text style={styles.menuText}>Show Preview</Text>
                    <Text style={styles.menuDescription}>
                      Show message content in notifications
                    </Text>
                  </View>
                </View>
                <Switch
                  value={notificationSettings.showPreview}
                  onValueChange={handleShowPreviewToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </>
          )}
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.menuItemWithToggle}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>{isDark ? '🌙' : '☀️'}</Text>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Dark Mode</Text>
                <Text style={styles.menuDescription}>
                  {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('About')}
          >
            <Text style={styles.menuIcon}>ℹ️</Text>
            <Text style={styles.menuText}>About Whisper</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Privacy')}
          >
            <Text style={styles.menuIcon}>📜</Text>
            <Text style={styles.menuText}>Privacy Policy</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Terms')}
          >
            <Text style={styles.menuIcon}>📋</Text>
            <Text style={styles.menuText}>Terms of Service</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('ChildSafety')}
          >
            <Text style={styles.menuIcon}>🛡️</Text>
            <Text style={styles.menuText}>Child Safety</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.menuText, styles.dangerText]}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAccount}>
            <Text style={styles.menuIcon}>🗑️</Text>
            <Text style={[styles.menuText, styles.dangerText]}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Whisper</Text>
          <Text style={styles.footerSubtext}>Private. Secure. Anonymous.</Text>
        </View>
      </ScrollView>

      {/* Message Sound Picker Modal */}
      <Modal
        visible={soundPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSoundPickerVisible(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setSoundPickerVisible(false)}
        >
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Message Sound</Text>
            {MESSAGE_SOUNDS.map((sound) => (
              <TouchableOpacity
                key={sound.id}
                style={[
                  styles.pickerOption,
                  notificationSettings.messageSound === sound.id && styles.pickerOptionSelected,
                ]}
                onPress={() => handleMessageSoundSelect(sound.id)}
              >
                <Text style={[
                  styles.pickerOptionText,
                  notificationSettings.messageSound === sound.id && styles.pickerOptionTextSelected,
                ]}>
                  {sound.name}
                </Text>
                {notificationSettings.messageSound === sound.id && (
                  <Text style={styles.pickerCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Call Ringtone Picker Modal */}
      <Modal
        visible={ringtonePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRingtonePickerVisible(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setRingtonePickerVisible(false)}
        >
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Call Ringtone</Text>
            {CALL_RINGTONES.map((ringtone) => (
              <TouchableOpacity
                key={ringtone.id}
                style={[
                  styles.pickerOption,
                  notificationSettings.callRingtone === ringtone.id && styles.pickerOptionSelected,
                ]}
                onPress={() => handleCallRingtoneSelect(ringtone.id)}
              >
                <Text style={[
                  styles.pickerOptionText,
                  notificationSettings.callRingtone === ringtone.id && styles.pickerOptionTextSelected,
                ]}>
                  {ringtone.name}
                </Text>
                {notificationSettings.callRingtone === ringtone.id && (
                  <Text style={styles.pickerCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
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
    content: {
      paddingBottom: spacing.xxl,
    },
    profileSection: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      backgroundColor: colors.surface,
      marginTop: spacing.md,
      marginHorizontal: spacing.md,
      borderRadius: borderRadius.md,
    },
    profileAvatar: {
      width: moderateScale(60),
      height: moderateScale(60),
      backgroundColor: colors.primary,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    profileAvatarText: {
      fontSize: fontSize.xxl,
      color: colors.text,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    profileId: {
      fontSize: fontSize.xs,
      color: colors.textMuted,
      fontFamily: 'monospace',
    },
    chevron: {
      fontSize: fontSize.lg,
      color: colors.textMuted,
    },
    section: {
      marginTop: spacing.lg,
      marginHorizontal: spacing.md,
    },
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
      textTransform: 'uppercase',
    },
    dangerTitle: {
      color: colors.error,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    menuIcon: {
      fontSize: fontSize.lg,
      marginRight: spacing.md,
    },
    menuText: {
      flex: 1,
      fontSize: fontSize.md,
      color: colors.text,
    },
    dangerText: {
      color: colors.error,
    },
    menuStatus: {
      fontSize: fontSize.sm,
      color: colors.success,
      fontWeight: '500',
    },
    menuValue: {
      fontSize: fontSize.sm,
      color: colors.textMuted,
    },
    menuItemWithToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    menuItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: spacing.md,
    },
    menuTextContainer: {
      flex: 1,
    },
    menuDescription: {
      fontSize: fontSize.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    footer: {
      alignItems: 'center',
      marginTop: spacing.xxl,
      paddingVertical: spacing.lg,
    },
    footerText: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: colors.textMuted,
    },
    footerSubtext: {
      fontSize: fontSize.sm,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    pickerContainer: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      width: '80%',
      maxWidth: 300,
    },
    pickerTitle: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    pickerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.sm,
    },
    pickerOptionSelected: {
      backgroundColor: colors.primary + '20',
    },
    pickerOptionText: {
      fontSize: fontSize.md,
      color: colors.text,
    },
    pickerOptionTextSelected: {
      color: colors.primary,
      fontWeight: '600',
    },
    pickerCheckmark: {
      fontSize: fontSize.md,
      color: colors.primary,
      fontWeight: '700',
    },
  });
