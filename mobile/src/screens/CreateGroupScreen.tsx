import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CreateGroupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const contactList = await secureStorage.getContacts();
    // Sort by name
    contactList.sort((a, b) => {
      const nameA = a.nickname || a.username || a.whisperId;
      const nameB = b.nickname || b.username || b.whisperId;
      return nameA.localeCompare(nameB);
    });
    setContacts(contactList);
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

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (selectedMembers.size < 1) {
      Alert.alert('Error', 'Please select at least one member');
      return;
    }

    setIsCreating(true);

    try {
      const memberIds = Array.from(selectedMembers);
      const group = await messagingService.createGroup(groupName.trim(), memberIds);

      // Navigate to the new group chat
      navigation.replace('GroupChat', { groupId: group.id });
    } catch (error) {
      console.error('Failed to create group:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
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

  const canCreate = groupName.trim().length > 0 && selectedMembers.size >= 1;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <TouchableOpacity
          onPress={handleCreateGroup}
          style={[styles.createButton, !canCreate && styles.createButtonDisabled]}
          disabled={!canCreate || isCreating}
        >
          <Text style={[styles.createText, !canCreate && styles.createTextDisabled]}>
            {isCreating ? '...' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Group Name Input */}
      <View style={styles.nameSection}>
        <View style={styles.groupIcon}>
          <Text style={styles.groupIconText}>
            {groupName ? getInitials(groupName) : 'GR'}
          </Text>
        </View>
        <TextInput
          style={styles.nameInput}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
          autoFocus
        />
      </View>

      {/* Members Section */}
      <View style={styles.membersHeader}>
        <Text style={styles.membersTitle}>Add Members</Text>
        <Text style={styles.membersCount}>
          {selectedMembers.size} selected
        </Text>
      </View>

      {/* Contacts List */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.whisperId}
        renderItem={renderContact}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No contacts available</Text>
            <Text style={styles.emptySubtext}>
              Add contacts first to create a group
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
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
  createButton: {
    padding: spacing.xs,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  createTextDisabled: {
    color: colors.textMuted,
  },
  nameSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupIcon: {
    width: moderateScale(60),
    height: moderateScale(60),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  groupIconText: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
  },
  nameInput: {
    flex: 1,
    fontSize: fontSize.lg,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  membersTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  membersCount: {
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
