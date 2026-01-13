import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Group, Contact } from '../types';
import { secureStorage } from '../storage/SecureStorage';
import { useAuth } from '../context/AuthContext';
import { messagingService } from '../services/MessagingService';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { moderateScale } from '../utils/responsive';
import { getInitials } from '../utils/helpers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type GroupInfoRouteProp = RouteProp<RootStackParamList, 'GroupInfo'>;

interface MemberWithInfo {
  whisperId: string;
  displayName: string;
  isContact: boolean;
}

export default function GroupInfoScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<GroupInfoRouteProp>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groupId } = route.params;

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<MemberWithInfo[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [groupId])
  );

  useEffect(() => {
    const handleGroupUpdate = (updatedGroupId: string, updates: Partial<Group>) => {
      if (updatedGroupId === groupId) {
        setGroup(prev => prev ? { ...prev, ...updates } : null);
        loadData(); // Reload to get updated member info
      }
    };

    messagingService.addGroupUpdateHandler(handleGroupUpdate);
    return () => {
      messagingService.removeGroupUpdateHandler(handleGroupUpdate);
    };
  }, [groupId]);

  const loadData = async () => {
    const loadedGroup = await secureStorage.getGroup(groupId);
    if (!loadedGroup) {
      Alert.alert('Error', 'Group not found');
      navigation.goBack();
      return;
    }
    setGroup(loadedGroup);
    setEditedName(loadedGroup.name);

    // Load member info
    const contacts = await secureStorage.getContacts();
    const memberList: MemberWithInfo[] = loadedGroup.members.map(memberId => {
      const contact = contacts.find(c => c.whisperId === memberId);
      const isCurrentUser = memberId === user?.whisperId;

      return {
        whisperId: memberId,
        displayName: isCurrentUser
          ? 'You'
          : contact?.nickname || contact?.username || memberId,
        isContact: !!contact,
      };
    });

    // Sort: current user first, then by name
    memberList.sort((a, b) => {
      if (a.whisperId === user?.whisperId) return -1;
      if (b.whisperId === user?.whisperId) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    setMembers(memberList);
  };

  const isCreator = group?.createdBy === user?.whisperId;

  const handleSaveName = async () => {
    if (!group || !editedName.trim()) return;

    try {
      await messagingService.updateGroup(groupId, { name: editedName.trim() });
      setGroup(prev => prev ? { ...prev, name: editedName.trim() } : null);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update group name:', error);
      Alert.alert('Error', 'Failed to update group name');
    }
  };

  const handleRemoveMember = (member: MemberWithInfo) => {
    if (!isCreator || member.whisperId === user?.whisperId) return;

    Alert.alert(
      'Remove Member',
      `Remove ${member.displayName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await messagingService.updateGroup(groupId, {
                removeMembers: [member.whisperId],
              });
              loadData();
            } catch (error) {
              console.error('Failed to remove member:', error);
              Alert.alert('Error', 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await messagingService.leaveGroup(groupId);
              navigation.navigate('MainTabs');
            } catch (error) {
              console.error('Failed to leave group:', error);
              Alert.alert('Error', 'Failed to leave group');
            }
          },
        },
      ]
    );
  };

  const handleDeleteGroup = () => {
    if (!isCreator) return;

    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await secureStorage.deleteGroup(groupId);
              navigation.navigate('MainTabs');
            } catch (error) {
              console.error('Failed to delete group:', error);
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const handleAddMembers = () => {
    navigation.navigate('AddGroupMember', { groupId });
  };

  const renderMember = ({ item }: { item: MemberWithInfo }) => {
    const isCurrentUser = item.whisperId === user?.whisperId;
    const isGroupCreator = item.whisperId === group?.createdBy;

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onLongPress={() => handleRemoveMember(item)}
        disabled={!isCreator || isCurrentUser}
      >
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>{getInitials(item.displayName)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName}>{item.displayName}</Text>
            {isGroupCreator && (
              <View style={styles.creatorBadge}>
                <Text style={styles.creatorBadgeText}>Admin</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberId}>{item.whisperId}</Text>
        </View>
      </TouchableOpacity>
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Group Info */}
      <View style={styles.groupSection}>
        <View style={styles.groupAvatar}>
          <Text style={styles.groupAvatarText}>{getInitials(group.name)}</Text>
        </View>

        {isEditing ? (
          <View style={styles.editNameContainer}>
            <TextInput
              style={styles.editNameInput}
              value={editedName}
              onChangeText={setEditedName}
              placeholder="Group name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              maxLength={50}
            />
            <TouchableOpacity onPress={handleSaveName} style={styles.saveButton}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setEditedName(group.name);
                setIsEditing(false);
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => isCreator && setIsEditing(true)}
            disabled={!isCreator}
          >
            <Text style={styles.groupName}>{group.name}</Text>
            {isCreator && (
              <Text style={styles.editHint}>Tap to edit</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Members Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{members.length} Members</Text>
        {isCreator && (
          <TouchableOpacity onPress={handleAddMembers}>
            <Text style={styles.addMemberText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.whisperId}
        renderItem={renderMember}
        contentContainerStyle={styles.memberList}
      />

      {/* Actions */}
      <View style={[styles.actionsSection, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveGroup}>
          <Text style={styles.leaveButtonText}>Leave Group</Text>
        </TouchableOpacity>

        {isCreator && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteGroup}>
            <Text style={styles.deleteButtonText}>Delete Group</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
  },
  backText: {
    fontSize: fontSize.xl,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: moderateScale(40),
  },
  groupSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupAvatar: {
    width: moderateScale(80),
    height: moderateScale(80),
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  groupAvatarText: {
    fontSize: fontSize.xxl,
    fontWeight: '600',
    color: colors.text,
  },
  groupName: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  editHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  editNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  editNameInput: {
    flex: 1,
    fontSize: fontSize.lg,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveButton: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  addMemberText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  memberList: {
    flexGrow: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: moderateScale(44),
    height: moderateScale(44),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  creatorBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  creatorBadgeText: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '600',
  },
  memberId: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionsSection: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  leaveButton: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  leaveButtonText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: colors.error,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
  },
});
