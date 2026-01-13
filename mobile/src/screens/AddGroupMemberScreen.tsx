import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Contact, Group } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AddGroupMemberRouteProp = RouteProp<RootStackParamList, 'AddGroupMember'>;

export default function AddGroupMemberScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AddGroupMemberRouteProp>();
  const insets = useSafeAreaInsets();
  const { groupId } = route.params;

  const [group, setGroup] = useState<Group | null>(null);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    // Load group
    const loadedGroup = await secureStorage.getGroup(groupId);
    if (!loadedGroup) {
      Alert.alert('Error', 'Group not found');
      navigation.goBack();
      return;
    }
    setGroup(loadedGroup);

    // Load contacts that are not already in the group
    const contacts = await secureStorage.getContacts();
    const existingMembers = new Set(loadedGroup.members);
    const available = contacts.filter(c => !existingMembers.has(c.whisperId));

    // Sort by name
    available.sort((a, b) => {
      const nameA = a.nickname || a.username || a.whisperId;
      const nameB = b.nickname || b.username || b.whisperId;
      return nameA.localeCompare(nameB);
    });

    setAvailableContacts(available);
  };

  const toggleMember = (whisperId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(whisperId)) {
      newSelected.delete(whisperId);
    } else {
      newSelected.add(whisperId);
    }
    setSelectedMembers(newSelected);
  };

  const handleAddMembers = async () => {
    if (selectedMembers.size === 0) {
      Alert.alert('Error', 'Please select at least one member');
      return;
    }

    setIsAdding(true);

    try {
      await messagingService.updateGroup(groupId, {
        addMembers: Array.from(selectedMembers),
      });
      navigation.goBack();
    } catch (error) {
      console.error('Failed to add members:', error);
      Alert.alert('Error', 'Failed to add members');
    } finally {
      setIsAdding(false);
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const displayName = item.nickname || item.username || item.whisperId;
    const isSelected = selectedMembers.has(item.whisperId);

    return (
      <TouchableOpacity
        style={[styles.contactItem, isSelected && styles.contactItemSelected]}
        onPress={() => toggleMember(item.whisperId)}
      >
        <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
          <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{displayName}</Text>
          <Text style={styles.contactId}>{item.whisperId}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>OK</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Members</Text>
        <TouchableOpacity
          onPress={handleAddMembers}
          style={[styles.addButton, selectedMembers.size === 0 && styles.addButtonDisabled]}
          disabled={selectedMembers.size === 0 || isAdding}
        >
          <Text style={[styles.addText, selectedMembers.size === 0 && styles.addTextDisabled]}>
            {isAdding ? '...' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>
          Adding to: {group?.name || 'Group'}
        </Text>
        <Text style={styles.selectedCount}>
          {selectedMembers.size} selected
        </Text>
      </View>

      {/* Contacts List */}
      <FlatList
        data={availableContacts}
        keyExtractor={(item) => item.whisperId}
        renderItem={renderContact}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No contacts available</Text>
            <Text style={styles.emptySubtext}>
              All your contacts are already in this group
            </Text>
          </View>
        }
      />
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  backText: {
    fontSize: fontSize.md,
    color: colors.primary,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    padding: spacing.xs,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  addTextDisabled: {
    color: colors.textMuted,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  selectedCount: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  listContent: {
    flexGrow: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactItemSelected: {
    backgroundColor: colors.surface,
  },
  avatar: {
    width: moderateScale(44),
    height: moderateScale(44),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarSelected: {
    backgroundColor: colors.primary,
  },
  avatarText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  contactId: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  checkbox: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
