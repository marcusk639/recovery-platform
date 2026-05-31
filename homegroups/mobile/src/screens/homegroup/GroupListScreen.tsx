import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Button,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {CompositeNavigationProp} from '@react-navigation/native';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchUserGroups,
  selectMemberGroups,
  selectGroupsStatus,
  selectGroupsError,
} from '../../store/slices/groupsSlice';
import {fetchAllUnreadCounts} from '../../store/slices/chatSlice';

// Import types
import {GroupStackParamList, MainTabParamList} from '../../types/navigation';
import {GroupDocument, UserDocument} from '../../types/schema';
import {GroupModel} from '../../models/GroupModel';
import {HomeGroup} from '../../types';
import {UserModel} from '../../models/UserModel';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import EnterInviteCodeModal from '../../components/groups/EnterInviteCodeModal';

type GroupsListScreenNavigationProp = CompositeNavigationProp<
  StackNavigationProp<GroupStackParamList, 'GroupsList'>,
  BottomTabNavigationProp<MainTabParamList>
>;

const GroupsListScreen: React.FC = () => {
  const navigation = useNavigation<GroupsListScreenNavigationProp>();
  const dispatch = useAppDispatch();

  // Get groups from Redux store (only groups user is a member of)
  const groups = useAppSelector(selectMemberGroups);
  const status = useAppSelector(selectGroupsStatus);
  const error = useAppSelector(selectGroupsError);
  const isLoading = status === 'loading';
  const isInitialLoad = status === 'idle';

  const [userName, setUserName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCodeModalVisible, setInviteCodeModalVisible] = useState(false);

  // Track whether this is the first time loading
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    // Get current user's display name
    const currentUser = auth().currentUser;
    if (currentUser?.displayName) {
      setUserName(currentUser.displayName);
    }

    // Load groups if not already loaded or if empty
    if (status === 'idle' || (groups.length === 0 && status !== 'loading')) {
      loadData();
    }
  }, []);

  // Set initialLoadComplete and fetch unread counts when groups first load
  useEffect(() => {
    if (status === 'succeeded' && !initialLoadComplete) {
      setInitialLoadComplete(true);
      if (groups.length > 0) {
        const groupIds = groups.map(g => g.id!).filter(Boolean);
        dispatch(fetchAllUnreadCounts(groupIds));
      }
    }
  }, [status, initialLoadComplete]);

  useEffect(() => {
    // Show error if there's one
    if (error) {
      Alert.alert('Error', error);
    }
  }, [error]);

  const loadData = async () => {
    dispatch(fetchUserGroups());
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  };

  const navigateToGroupDetails = (group: HomeGroup) => {
    navigation.navigate('GroupOverview', {
      groupId: group.id!,
      groupName: group.name,
    });
  };

  const navigateToCreateGroup = () => {
    navigation.navigate('CreateGroup', {});
  };

  const navigateToGroupSearch = () => {
    navigation.navigate('GroupSearch');
  };

  // Format location string from city, state, zip
  const formatLocation = (group: HomeGroup): string | null => {
    if (group.city || group.state || group.zip) {
      const cityState = [group.city, group.state].filter(Boolean).join(', ');
      return group.zip ? `${cityState} ${group.zip}` : cityState;
    }
    return group.location || null;
  };

  const renderHomeGroupItem = ({item}: {item: HomeGroup}) => {
    const locationText = formatLocation(item);

    return (
      <TouchableOpacity
        style={styles.homeGroupCard}
        onPress={() => navigateToGroupDetails(item)}
        testID={`group-card-${item.id}`}>
        <View style={styles.homeGroupHeader}>
          <Text style={styles.homeGroupName}>{item.name}</Text>
          {item.admins.includes(auth().currentUser?.uid || '') && (
            <View style={styles.adminBadge}>
              <Icon name="crown" size={14} color="#FFA000" />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>
        {locationText && (
          <View style={styles.homeGroupLocation}>
            <Icon name="map-marker" size={14} color="#757575" />
            <Text style={styles.homeGroupLocationText}>{locationText}</Text>
          </View>
        )}
        <Text style={styles.homeGroupDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.homeGroupFooter}>
          <Text style={styles.homeGroupMemberCount}>
            {item.memberCount} members
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Skeleton loading indicator for groups
  const renderSkeletonItem = () => (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonTitle} />
        <View style={[styles.skeletonBadge, {width: 50}]} />
      </View>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, {width: '70%'}]} />
      <View style={styles.skeletonFooter}>
        <View style={styles.skeletonMemberCount} />
      </View>
    </View>
  );

  const renderEmptyComponent = () => {
    // Show skeleton loaders during initial load
    if (isLoading && !initialLoadComplete) {
      return (
        <View>
          {[...Array(3)].map((_, index) => (
            <View key={`skeleton-${index}`}>{renderSkeletonItem()}</View>
          ))}
        </View>
      );
    }

    // Show empty state when loaded but no groups found
    return (
      <View style={styles.emptyStateContainer} testID="group-list-empty-state">
        <Icon
          name="account-group-outline"
          size={64}
          color="#BBDEFB"
          style={styles.emptyStateIcon}
        />
        <Text style={styles.emptyStateHeading}>No Groups Yet</Text>
        <Text style={styles.emptyStateText}>
          You haven't joined any home groups yet. Join an existing group or
          create your own.
        </Text>
        <View style={styles.emptyStateButtons}>
          <TouchableOpacity
            style={styles.emptyStateButtonPrimary}
            onPress={navigateToGroupSearch}
            testID="empty-state-find-group-button">
            <Text style={styles.emptyStateButtonPrimaryText}>Find a Group</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptyStateButtonSecondary}
            onPress={navigateToCreateGroup}
            testID="empty-state-create-group-button">
            <Text style={styles.emptyStateButtonSecondaryText}>
              Create Group
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.inviteCodeLink}
          onPress={() => setInviteCodeModalVisible(true)}
          testID="empty-state-invite-code-button">
          <Icon name="ticket-confirmation-outline" size={18} color="#2196F3" />
          <Text style={styles.inviteCodeLinkText}>Have an invite code?</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Handle loading state with a clean message when not initial load
  const renderLoadingOverlay = () => {
    if (isLoading && initialLoadComplete && groups.length === 0) {
      return (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading your groups...</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} testID="group-list-screen">
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Hello, {userName || 'Friend'}</Text>
          <Text style={styles.subtitleText}>
            Your recovery journey continues
          </Text>
        </View>

        {/* Home Groups Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Home Groups</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.inviteCodeButton}
                onPress={() => setInviteCodeModalVisible(true)}
                testID="group-list-invite-code-button">
                <Icon
                  name="ticket-confirmation-outline"
                  size={18}
                  color="#2196F3"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createGroupButton}
                onPress={navigateToCreateGroup}
                testID="group-list-create-button">
                <Text style={styles.createGroupButtonText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={navigateToGroupSearch}
                testID="group-list-search-button">
                <Text style={styles.seeAllText}>Join New</Text>
              </TouchableOpacity>
            </View>
          </View>

          {groups.length > 0 ? (
            <FlatList
              data={groups}
              renderItem={renderHomeGroupItem}
              keyExtractor={item => item.id!}
              testID="group-list"
              horizontal={false}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={false}
              contentContainerStyle={styles.homeGroupsList}
            />
          ) : (
            renderEmptyComponent()
          )}
        </View>
      </ScrollView>

      {renderLoadingOverlay()}

      {/* Enter Invite Code Modal */}
      <EnterInviteCodeModal
        visible={inviteCodeModalVisible}
        onClose={() => setInviteCodeModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  welcomeSection: {
    padding: 24,
    backgroundColor: '#2196F3',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  section: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  inviteCodeButton: {
    padding: 10,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createGroupButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createGroupButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  seeAllText: {
    fontSize: 14,
    color: '#2196F3',
  },
  homeGroupsList: {
    paddingBottom: 8,
  },
  homeGroupCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  homeGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  homeGroupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFA000',
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF8F00',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  homeGroupLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  homeGroupLocationText: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 4,
  },
  homeGroupDescription: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 12,
    flex: 1,
  },
  homeGroupFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  homeGroupMeetingTime: {
    fontSize: 12,
    color: '#616161',
  },
  homeGroupMemberCount: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  // Skeleton loading styles
  skeletonCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  skeletonTitle: {
    width: '60%',
    height: 16,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  skeletonBadge: {
    width: 60,
    height: 16,
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
  },
  skeletonLine: {
    width: '100%',
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  skeletonMemberCount: {
    width: 80,
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  // Empty state styles
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginVertical: 8,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  emptyStateHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  emptyStateButtonPrimary: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
  },
  emptyStateButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyStateButtonSecondary: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyStateButtonSecondaryText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
  },
  inviteCodeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  inviteCodeLinkText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
});

export default GroupsListScreen;
