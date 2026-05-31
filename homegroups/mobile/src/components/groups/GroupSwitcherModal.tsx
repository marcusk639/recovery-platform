import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppSelector} from '../../store';
import {selectMemberGroups} from '../../store/slices/groupsSlice';
import {selectUnreadCount} from '../../store/slices/chatSlice';
import {GroupStackParamList} from '../../types/navigation';
import {HomeGroup} from '../../types';
import {RootState} from '../../store/types';
import {theme} from '../../theme/theme';

interface GroupSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
  currentGroupId?: string;
}

interface GroupRowProps {
  group: HomeGroup & {id: string};
  isActive: boolean;
  onSelect: () => void;
  unreadCount: number;
}

const GroupRow: React.FC<GroupRowProps> = ({
  group,
  isActive,
  onSelect,
  unreadCount,
}) => (
  <TouchableOpacity
    style={[styles.groupRow, isActive && styles.groupRowActive]}
    onPress={onSelect}
    activeOpacity={0.7}
    testID={`group-switcher-row-${group.id}`}>
    <View style={styles.groupRowLeft}>
      <View style={[styles.groupIcon, isActive && styles.groupIconActive]}>
        <Icon
          name="account-group"
          size={20}
          color={isActive ? theme.colors.neutral.white : theme.colors.primary.main}
        />
      </View>
      <View style={styles.groupInfo}>
        <Text
          style={[styles.groupName, isActive && styles.groupNameActive]}
          numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.memberCount}>{group.memberCount} members</Text>
      </View>
    </View>
    <View style={styles.groupRowRight}>
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
      {isActive && (
        <Icon
          name="check-circle"
          size={18}
          color={theme.colors.primary.main}
          style={styles.checkIcon}
        />
      )}
      <Icon
        name="chevron-right"
        size={20}
        color={theme.colors.neutral.grey400}
      />
    </View>
  </TouchableOpacity>
);

// Inner component to resolve unread count per group (hooks must be called consistently)
const GroupRowConnected: React.FC<{
  group: HomeGroup & {id: string};
  isActive: boolean;
  onSelect: (group: HomeGroup & {id: string}) => void;
}> = ({group, isActive, onSelect}) => {
  const unreadCount = useAppSelector((state: RootState) =>
    selectUnreadCount(state, group.id),
  );
  return (
    <GroupRow
      group={group}
      isActive={isActive}
      onSelect={() => onSelect(group)}
      unreadCount={unreadCount}
    />
  );
};

const GroupSwitcherModal: React.FC<GroupSwitcherModalProps> = ({
  visible,
  onClose,
  currentGroupId,
}) => {
  const navigation = useNavigation<StackNavigationProp<GroupStackParamList>>();
  const groups = useAppSelector(selectMemberGroups) as (HomeGroup & {
    id: string;
  })[];

  const handleSelectGroup = (group: HomeGroup & {id: string}) => {
    onClose();
    navigation.navigate('GroupOverview', {
      groupId: group.id,
      groupName: group.name,
    });
  };

  const renderItem = ({item}: {item: HomeGroup & {id: string}}) => (
    <GroupRowConnected
      group={item}
      isActive={item.id === currentGroupId}
      onSelect={handleSelectGroup}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer} testID="group-switcher-empty">
      <Icon
        name="account-group-outline"
        size={48}
        color={theme.colors.neutral.grey300}
      />
      <Text style={styles.emptyText}>You haven't joined any groups yet.</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="group-switcher-modal">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Switch Group</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            testID="group-switcher-close-button"
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon
              name="close"
              size={24}
              color={theme.colors.neutral.grey700}
            />
          </TouchableOpacity>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {groups.length === 0
            ? 'Join a group to get started'
            : `${groups.length} group${groups.length === 1 ? '' : 's'}`}
        </Text>

        {/* Group list */}
        <FlatList
          data={groups}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={
            groups.length === 0 ? styles.emptyListContainer : styles.listContent
          }
          showsVerticalScrollIndicator={false}
          testID="group-switcher-list"
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.grey200,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey500,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  groupRowActive: {
    backgroundColor: theme.colors.primary.light + '22',
    borderWidth: 1,
    borderColor: theme.colors.primary.light,
  },
  groupRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary.light + '33',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  groupIconActive: {
    backgroundColor: theme.colors.primary.main,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.neutral.grey900,
    marginBottom: 2,
  },
  groupNameActive: {
    color: theme.colors.primary.dark,
  },
  memberCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.neutral.grey500,
  },
  groupRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unreadBadge: {
    backgroundColor: theme.colors.status.error,
    borderRadius: theme.borderRadius.full,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginRight: 4,
  },
  unreadBadgeText: {
    color: theme.colors.neutral.white,
    fontSize: 11,
    fontWeight: '700',
  },
  checkIcon: {
    marginRight: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey500,
    textAlign: 'center',
  },
});

export default GroupSwitcherModal;
