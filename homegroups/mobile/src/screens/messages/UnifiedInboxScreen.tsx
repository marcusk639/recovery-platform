import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {CompositeNavigationProp} from '@react-navigation/native';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useAppDispatch, useAppSelector} from '../../store';
import {selectMemberGroups} from '../../store/slices/groupsSlice';
import {
  selectAllConversations,
  fetchConversations,
} from '../../store/slices/directMessagesSlice';
import {
  selectAllAnnouncements,
  fetchAnnouncementsForGroup,
} from '../../store/slices/announcementsSlice';
import {
  fetchAllUnreadCounts,
  selectUnreadCount,
} from '../../store/slices/chatSlice';
import {selectMemberGroupIds} from '../../store/slices/groupsSlice';
import {MessagesStackParamList, MainTabParamList} from '../../types/navigation';
import {HomeGroup} from '../../types';
import {DirectConversationEntity} from '../../store/slices/directMessagesSlice';
import {AnnouncementEntity} from '../../store/slices/announcementsSlice';
import {RootState} from '../../store/types';
import {theme} from '../../theme/theme';

// Navigation types
type UnifiedInboxNavigationProp = CompositeNavigationProp<
  StackNavigationProp<MessagesStackParamList, 'UnifiedInbox'>,
  BottomTabNavigationProp<MainTabParamList>
>;

// Section data types
type GroupChatItem = {
  type: 'groupChat';
  groupId: string;
  groupName: string;
  unreadCount: number;
  memberCount: number;
};

type DMItem = {
  type: 'dm';
  conversation: DirectConversationEntity;
};

type AnnouncementItem = {
  type: 'announcement';
  announcement: AnnouncementEntity;
  groupName: string;
};

type SectionItem = GroupChatItem | DMItem | AnnouncementItem;

// Group chat row — reads unread count from Redux per group
const GroupChatRow: React.FC<{
  item: GroupChatItem;
  onPress: () => void;
}> = ({item, onPress}) => {
  const unreadCount = useAppSelector((state: RootState) =>
    selectUnreadCount(state, item.groupId),
  );

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`inbox-group-chat-${item.groupId}`}>
      <View style={styles.rowIconContainer}>
        <Icon
          name="account-group"
          size={22}
          color={theme.colors.primary.main}
        />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.groupName}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {item.memberCount} members
        </Text>
      </View>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
      <Icon
        name="chevron-right"
        size={18}
        color={theme.colors.neutral.grey400}
      />
    </TouchableOpacity>
  );
};

const DMRow: React.FC<{
  item: DMItem;
  onPress: () => void;
}> = ({item, onPress}) => {
  const {conversation} = item;
  const unread = conversation.unreadCount || 0;

  const formatTime = (date: Date): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 24) {
      return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }
    return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
  };

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`inbox-dm-${conversation.threadId}`}>
      <View style={styles.rowIconContainer}>
        <Icon
          name="account-circle"
          size={22}
          color={theme.colors.neutral.grey600}
        />
      </View>
      <View style={styles.rowContent}>
        <Text
          style={[styles.rowTitle, unread > 0 && styles.rowTitleUnread]}
          numberOfLines={1}>
          {conversation.otherUserName}
        </Text>
        <Text
          style={[styles.rowSubtitle, unread > 0 && styles.rowSubtitleUnread]}
          numberOfLines={1}>
          {conversation.lastMessage?.text || 'No messages yet'}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {conversation.lastMessage?.sentAt && (
          <Text style={styles.timeText}>
            {formatTime(conversation.updatedAt)}
          </Text>
        )}
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        )}
      </View>
      <Icon
        name="chevron-right"
        size={18}
        color={theme.colors.neutral.grey400}
      />
    </TouchableOpacity>
  );
};

const AnnouncementRow: React.FC<{
  item: AnnouncementItem;
  onPress: () => void;
}> = ({item, onPress}) => {
  const {announcement, groupName} = item;

  const formatDate = (date: Date): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
  };

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`inbox-announcement-${announcement.id}`}>
      <View style={styles.rowIconContainer}>
        <Icon
          name="bullhorn"
          size={22}
          color={theme.colors.status.warning}
        />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {announcement.title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {groupName} · {formatDate(announcement.createdAt)}
        </Text>
      </View>
      <Icon
        name="chevron-right"
        size={18}
        color={theme.colors.neutral.grey400}
      />
    </TouchableOpacity>
  );
};

const SectionEmptyRow: React.FC<{message: string}> = ({message}) => (
  <View style={styles.sectionEmpty}>
    <Text style={styles.sectionEmptyText}>{message}</Text>
  </View>
);

const UnifiedInboxScreen: React.FC = () => {
  const navigation = useNavigation<UnifiedInboxNavigationProp>();
  const dispatch = useAppDispatch();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const memberGroups = useAppSelector(selectMemberGroups) as (HomeGroup & {
    id: string;
  })[];
  const memberGroupIds = useAppSelector(selectMemberGroupIds);
  const allConversations = useAppSelector(state =>
    selectAllConversations(state),
  );
  const allAnnouncements = useAppSelector(selectAllAnnouncements);

  // Build sections
  const groupChatItems: GroupChatItem[] = memberGroups.map(g => ({
    type: 'groupChat',
    groupId: g.id,
    groupName: g.name,
    unreadCount: 0, // resolved per-row via hook
    memberCount: g.memberCount || 0,
  }));

  const dmItems: DMItem[] = allConversations
    .filter(c => c.unreadCount > 0)
    .sort((a, b) => {
      const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
      const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
      return bTime - aTime;
    })
    .map(c => ({type: 'dm', conversation: c as DirectConversationEntity}));

  // Get recent announcements (last 10 across all groups)
  const recentAnnouncements: AnnouncementItem[] = allAnnouncements
    .filter(a => {
      if (!a) return false;
      return memberGroupIds.includes(a.groupId);
    })
    .sort((a, b) => {
      const aTime =
        a && a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bTime =
        b && b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 10)
    .map(a => {
      const group = memberGroups.find(g => g.id === a!.groupId);
      return {
        type: 'announcement' as const,
        announcement: a as AnnouncementEntity,
        groupName: group?.name || 'Unknown Group',
      };
    });

  const sections: Array<{
    title: string;
    data: SectionItem[];
    emptyMessage: string;
  }> = [
    {
      title: 'Group Chats',
      data: groupChatItems,
      emptyMessage: 'No groups joined yet.',
    },
    {
      title: 'Direct Messages',
      data: dmItems,
      emptyMessage: 'No unread direct messages.',
    },
    {
      title: 'Recent Announcements',
      data: recentAnnouncements,
      emptyMessage: 'No recent announcements.',
    },
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await dispatch(fetchConversations(undefined));
      if (memberGroupIds.length > 0) {
        await dispatch(fetchAllUnreadCounts(memberGroupIds));
        // Fetch announcements for all user's groups in parallel
        await Promise.all(
          memberGroupIds.map(gId =>
            dispatch(fetchAnnouncementsForGroup({groupId: gId})),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [dispatch, memberGroupIds]);

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleGroupChatPress = useCallback(
    (item: GroupChatItem) => {
      // Navigate via Home tab stack to GroupChat
      (navigation as any).navigate('Home', {
        screen: 'GroupChat',
        params: {groupId: item.groupId, groupName: item.groupName},
      });
    },
    [navigation],
  );

  const handleDMPress = useCallback(
    (item: DMItem) => {
      navigation.navigate('DirectMessage', {
        threadId: item.conversation.threadId,
        otherUserId: item.conversation.otherUserId,
        otherUserName: item.conversation.otherUserName,
        otherUserPhotoURL: item.conversation.otherUserPhotoURL,
      });
    },
    [navigation],
  );

  const handleAnnouncementPress = useCallback(
    (item: AnnouncementItem) => {
      (navigation as any).navigate('Home', {
        screen: 'GroupAnnouncements',
        params: {
          groupId: item.announcement.groupId,
          groupName: item.groupName,
        },
      });
    },
    [navigation],
  );

  const renderItem = ({item}: {item: SectionItem}) => {
    if (item.type === 'groupChat') {
      return (
        <GroupChatRow
          item={item}
          onPress={() => handleGroupChatPress(item)}
        />
      );
    }
    if (item.type === 'dm') {
      return <DMRow item={item} onPress={() => handleDMPress(item)} />;
    }
    if (item.type === 'announcement') {
      return (
        <AnnouncementRow
          item={item}
          onPress={() => handleAnnouncementPress(item)}
        />
      );
    }
    return null;
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: (typeof sections)[number];
  }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  const renderSectionFooter = ({
    section,
  }: {
    section: (typeof sections)[number];
  }) => {
    if (section.data.length === 0) {
      return <SectionEmptyRow message={section.emptyMessage} />;
    }
    return null;
  };

  if (loading && !refreshing && allConversations.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer} testID="unified-inbox-loading">
        <ActivityIndicator size="large" color={theme.colors.primary.main} />
        <Text style={styles.loadingText}>Loading inbox...</Text>
      </SafeAreaView>
    );
  }

  const totalItems = groupChatItems.length + dmItems.length + recentAnnouncements.length;

  return (
    <SafeAreaView style={styles.container} testID="unified-inbox-screen">
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => {
          if (item.type === 'groupChat') return `gc-${item.groupId}`;
          if (item.type === 'dm') return `dm-${item.conversation.threadId}`;
          if (item.type === 'announcement')
            return `ann-${item.announcement.id}`;
          return String(index);
        }}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary.main}
          />
        }
        contentContainerStyle={
          totalItems === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          totalItems === 0 ? (
            <View style={styles.globalEmpty} testID="unified-inbox-empty">
              <Icon
                name="inbox-outline"
                size={64}
                color={theme.colors.neutral.grey300}
              />
              <Text style={styles.globalEmptyTitle}>All caught up!</Text>
              <Text style={styles.globalEmptySubtitle}>
                No messages or announcements yet.
              </Text>
            </View>
          ) : null
        }
        testID="unified-inbox-list"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey500,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  emptyContainer: {
    flex: 1,
  },
  sectionHeader: {
    backgroundColor: theme.colors.background.secondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.grey200,
  },
  sectionHeaderText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.neutral.grey700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.neutral.grey200,
  },
  rowIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.neutral.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  rowContent: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  rowTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '500',
    color: theme.colors.neutral.grey900,
    marginBottom: 2,
  },
  rowTitleUnread: {
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
  },
  rowSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey500,
  },
  rowSubtitleUnread: {
    color: theme.colors.neutral.grey700,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginRight: theme.spacing.xs,
  },
  timeText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.neutral.grey500,
    marginBottom: 4,
  },
  badge: {
    backgroundColor: theme.colors.status.error,
    borderRadius: theme.borderRadius.full,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: theme.colors.neutral.white,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionEmpty: {
    backgroundColor: theme.colors.background.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.neutral.grey200,
  },
  sectionEmptyText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey500,
    fontStyle: 'italic',
  },
  globalEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: theme.spacing.sm,
  },
  globalEmptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.neutral.grey700,
  },
  globalEmptySubtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey500,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
});

export default UnifiedInboxScreen;
