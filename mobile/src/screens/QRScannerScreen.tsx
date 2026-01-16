import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { RootStackParamList, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { parseQRData } from '../utils/helpers';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function QRScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const navigateBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    console.log('QR Scanned!', { type, data });
    if (scanned) return;
    setScanned(true);

    const parsed = parseQRData(data);

    if (!parsed) {
      Alert.alert('Invalid QR Code', 'This QR code is not a valid Whisper contact.', [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
      return;
    }

    // Check if contact already exists
    const existing = await secureStorage.getContact(parsed.whisperId);
    if (existing) {
      Alert.alert('Contact Exists', 'This contact is already in your list.', [
        { text: 'OK', onPress: () => navigateBack() },
      ]);
      return;
    }

    // Confirm adding contact
    Alert.alert(
      'Add Contact',
      `Do you want to add ${parsed.whisperId} as a contact?`,
      [
        { text: 'Cancel', onPress: () => setScanned(false), style: 'cancel' },
        {
          text: 'Add',
          onPress: async () => {
            const contact: Contact = {
              whisperId: parsed.whisperId,
              publicKey: parsed.publicKey,
              addedAt: Date.now(),
            };
            await secureStorage.addContact(contact);
            // Navigate directly to chat - Alert inside callback can fail on iOS
            navigation.replace('Chat', { contactId: contact.whisperId });
          },
        },
      ]
    );
  };

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centered}>
          <Text style={styles.text}>Requesting camera permission...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={navigateBack}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Camera Access</Text>
          <Text style={styles.permissionDescription}>
            Whisper needs camera access to scan QR codes and add contacts quickly.
          </Text>
          <Text style={styles.permissionNote}>
            Without camera access, you can still add contacts manually using their Whisper ID.
          </Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={navigateBack}>
            <Text style={styles.secondaryButtonText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={navigateBack}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        {/* Overlay with absolute positioning */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsText}>
          Point your camera at a Whisper QR code to add a contact
        </Text>
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: moderateScale(30),
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  text: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  permissionIcon: {
    fontSize: moderateScale(60),
    marginBottom: spacing.lg,
  },
  permissionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  permissionDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: moderateScale(22),
  },
  permissionNote: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: moderateScale(250),
    height: moderateScale(250),
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: moderateScale(30),
    height: moderateScale(30),
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructions: {
    padding: spacing.xl,
  },
  instructionsText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
});
