import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import Clipboard from '@react-native-community/clipboard';
import SubscriptionWebView from '../../components/payments/SubscriptionWebView';
import AdminValuePropModal from '../../components/payments/AdminValuePropModal';
import TrialStatusBanner from '../../components/subscription/TrialStatusBanner';
import useTrialStatus from '../../hooks/useTrialStatus';
import GroupSwitcherModal from '../../components/groups/GroupSwitcherModal';

// Import types and Redux
import {GroupStackParamList} from '../../types/navigation';
import {HomeGroup, Meeting, MeetingInstance} from '../../types';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchGroupById,
  selectGroupById,
  selectGroupsStatus,
  leaveGroup,
  requestGroupAdminAccess,
  joinGroup,
  selectIsGroupMember,
} from '../../store/slices/groupsSlice';
import {
  fetchAnnouncementsForGroup,
  selectAnnouncementsByGroupId,
} from '../../store/slices/announcementsSlice';
import {
  fetchGroupMembers,
  selectMembersByGroupId,
  fetchGroupMilestones,
  selectGroupMilestones,
  GroupMilestone,
} from '../../store/slices/membersSlice';
import {
  fetchGroupMeetings,
  selectGroupMeetings,
  fetchUpcomingMeetingInstances,
  selectAllMeetingInstances,
  selectGroupMeetingInstanceIds,
} from '../../store/slices/meetingsSlice';
import {
  fetchGroupSponsorships,
  selectActiveSponsorship,
} from '../../store/slices/sponsorshipSlice';
import {
  fetchPendingReportCount,
  selectPendingReportCount,
} from '../../store/slices/reportsSlice';
import {fetchUserData} from '../../store/slices/authSlice';
import {
  fetchServicePositionsForGroup,
  selectMemberServicePositionsForGroup,
} from '../../store/slices/servicePositionsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import OfflineBanner from '../../components/common/OfflineBanner';
import AdminRequestCard from '../../components/groups/AdminRequestCard';
import PendingAdminRequestsSection from '../../components/groups/PendingAdminRequestsSection';
import {GroupModel} from '../../models/GroupModel';
import GroupInviteModal from '../../components/groups/GroupInviteModal';
import InviteShareSheet from '../../components/invites/InviteShareSheet';
import UnreadBadge from '../../components/common/UnreadBadge';
import {
  selectUnreadCount,
  fetchUnreadCount,
} from '../../store/slices/chatSlice';
import firestore from '@react-native-firebase/firestore';
import {FEATURE_FLAGS} from '../../config/featureFlags';

type GroupOverviewScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupOverview'
>;
type GroupOverviewScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const GroupOverviewScreen: React.FC = () => {
  const route = useRoute<GroupOverviewScreenRouteProp>();
  const navigation = useNavigation<GroupOverviewScreenNavigationProp>();
  const {groupId, groupName, showClaimBanner} = route.params;
  const currentUser = auth().currentUser;

  const dispatch = useAppDispatch();

  // Get data from Redux store
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const announcements = useAppSelector(state =>
    selectAnnouncementsByGroupId(state, groupId),
  );
  const meetings = useAppSelector(state => selectGroupMeetings(state, groupId));
  const instanceIds = useAppSelector(state =>
    selectGroupMeetingInstanceIds(state, groupId),
  );
  const allInstances = useAppSelector(state =>
    selectAllMeetingInstances(state),
  );
  const instances =
    instanceIds
      ?.map(id => allInstances[id])
      .filter(Boolean)
      .filter(instance => !instance.isCancelled) // Filter out cancelled instances
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, 3) || []; // Show only next 3
  const celebrations = useAppSelector(state =>
    selectGroupMilestones(state, groupId),
  );
  const activeSponsorship = useAppSelector(state =>
    selectActiveSponsorship(state, groupId),
  );
  const isMember = useAppSelector(state => selectIsGroupMember(state, groupId));
  const pendingReportCount = useAppSelector(state =>
    selectPendingReportCount(state, groupId),
  );
  const myServicePositions = useAppSelector(state =>
    selectMemberServicePositionsForGroup(
      state,
      groupId,
      currentUser?.uid || '',
    ),
  );
  const chatUnreadCount = useAppSelector(state =>
    selectUnreadCount(state, groupId),
  );

  // Secretary / role check — for Secretary Toolkit tile visibility
  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );
  const myMember = members?.find(m => m.userId === currentUser?.uid);
  const myRoles: string[] = myMember?.roles || [];
  const isSecretaryOrAdmin =
    (group?.admins?.includes(currentUser?.uid || '') ?? false) ||
    myRoles.includes('secretary');

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [leaveGroupLoading, setLeaveGroupLoading] = useState(false);
  const [joinGroupLoading, setJoinGroupLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claimModalVisible, setClaimModalVisible] = useState(false);
  const [adminRequestMessage, setAdminRequestMessage] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [stripeSetupLoading, setStripeSetupLoading] = useState(false);
  const [stripeSetupModalVisible, setStripeSetupModalVisible] = useState(false);
  const [subscriptionWebViewVisible, setSubscriptionWebViewVisible] =
    useState(false);
  const [valuePropModalVisible, setValuePropModalVisible] = useState(false);
  const [showClaimBannerState, setShowClaimBannerState] = useState(
    showClaimBanner || false,
  );
  const [discreetAdminRequestLoading, setDiscreetAdminRequestLoading] =
    useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [groupSwitcherVisible, setGroupSwitcherVisible] = useState(false);
  const [inviteShareSheetVisible, setInviteShareSheetVisible] = useState(false);

  const trialStatus = useTrialStatus(groupId);
  const isPremium = trialStatus.isInTrial || trialStatus.isActive;

  const handleTrialUpgrade = () => {
    navigation.navigate('AdminValueProp', {groupId, groupName});
  };

  const loadGroupData = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);

    try {
      // Dispatch actions to load data from Redux
      await Promise.all([
        dispatch(fetchGroupById(groupId)).unwrap(),
        dispatch(fetchAnnouncementsForGroup({groupId})).unwrap(),
        dispatch(fetchGroupMembers(groupId)).unwrap(),
        dispatch(fetchGroupMeetings({groupId})).unwrap(),
        dispatch(fetchUpcomingMeetingInstances(groupId)).unwrap(),
        dispatch(fetchGroupMilestones({groupId})).unwrap(),
        dispatch(fetchGroupSponsorships(groupId)).unwrap(),
        dispatch(fetchPendingReportCount(groupId)).unwrap(),
        dispatch(fetchServicePositionsForGroup(groupId)).unwrap(),
      ]);
    } catch (error: any) {
      // Ignore ConditionError - this just means data was already cached
      if (error?.name === 'ConditionError') {
        console.log('Group data already cached, skipping fetch');
        return;
      }

      console.error('Error loading group data:', error);
      Alert.alert(
        'Error',
        'Failed to load group data. Please try again later.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, dispatch]);

  useEffect(() => {
    loadGroupData();
  }, [loadGroupData]);

  // Set header "Switch Group" button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setGroupSwitcherVisible(true)}
          style={{marginRight: 12, padding: 4}}
          testID="group-switcher-header-button"
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Icon name="swap-horizontal" size={24} color="#2196F3" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Listen for new messages in real-time to update unread badge
  useEffect(() => {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      return;
    }
    const unsubscribe = firestore()
      .collection('group_chats')
      .doc(groupId)
      .onSnapshot(snapshot => {
        if (snapshot.exists) {
          dispatch(fetchUnreadCount(groupId));
        }
      });
    return unsubscribe;
  }, [groupId, dispatch]);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const navigateToGroupMembers = () => {
    navigation.navigate('GroupMembers', {
      groupId,
      groupName,
    });
  };

  const navigateToGroupAnnouncements = () => {
    if (!isPremium && isCurrentUserAdmin()) {
      navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
      return;
    }
    navigation.navigate('GroupAnnouncements', {groupId, groupName});
  };

  const navigateToGroupTreasury = () => {
    if (!isPremium && isCurrentUserAdmin()) {
      navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
      return;
    }
    navigation.navigate('GroupTreasury', {groupId, groupName});
  };

  const navigateToGroupSchedule = () => {
    navigation.navigate('GroupSchedule', {
      groupId,
      groupName,
    });
  };

  const navigateToGroupLiterature = () => {
    navigation.navigate('GroupLiterature', {
      groupId,
      groupName,
    });
  };

  const navigateToGroupChat = () => {
    navigation.navigate('GroupChat', {
      groupId,
      groupName,
    });
  };

  const navigateToGroupSponsors = () => {
    navigation.navigate('GroupSponsors', {
      groupId,
      groupName,
    });
  };

  const navigateToBusinessMeetings = () => {
    navigation.navigate('BusinessMeetingsList', {
      groupId,
      groupName,
    });
  };

  const navigateToGroupDonation = () => {
    navigation.navigate('GroupDonation', {
      groupId,
      groupName,
    });
  };

  const navigateToModerationQueue = () => {
    navigation.navigate('ModerationQueue', {
      groupId,
      groupName,
    });
  };

  const navigateToSponsorChat = () => {
    if (!activeSponsorship) return;

    navigation.navigate('SponsorChat', {
      groupId,
      groupName: group?.name || '',
      sponsorId: activeSponsorship.sponsorId,
      sponseeId: activeSponsorship.sponseeId,
      sponsorName: activeSponsorship.sponsorName,
      sponseeName: activeSponsorship.sponseeName,
    });
  };

  const handleJoinGroup = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to join a group.');
      return;
    }

    try {
      setJoinGroupLoading(true);

      await dispatch(joinGroup(groupId)).unwrap();

      await dispatch(fetchUserData(currentUser.uid)).unwrap();

      // Refresh group data to update membership status
      await loadGroupData();

      Alert.alert('Success', `You've joined ${groupName}!`);
    } catch (error: any) {
      console.error('Error joining group:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to join group. Please try again.',
      );
    } finally {
      setJoinGroupLoading(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            setLeaveGroupLoading(true);

            // Use Redux to leave the group
            await dispatch(leaveGroup(groupId)).unwrap();

            // Navigate back to the groups list
            navigation.goBack();
            Alert.alert('Success', `You've left ${groupName}`);
          } catch (error) {
            console.error('Error leaving group:', error);
            Alert.alert(
              'Error',
              'Failed to leave group. Please try again later.',
            );
          } finally {
            setLeaveGroupLoading(false);
          }
        },
      },
    ]);
  };

  // Check if the group is unclaimed
  const isGroupUnclaimed = useCallback(() => {
    return !group?.admins || group?.admins?.length === 0;
  }, [group]);

  // Check if the current user is already an admin
  const isCurrentUserAdmin = useCallback(() => {
    if (!group || !group.admins || !currentUser) {
      return false;
    }
    return group.admins.includes(currentUser.uid);
  }, [group, currentUser]);

  // Check if the current user has a pending admin request
  const hasPendingAdminRequest = useCallback(() => {
    if (!group?.pendingAdminRequests || !currentUser) {
      return false;
    }
    return group.pendingAdminRequests.some(
      request => request.uid === currentUser.uid,
    );
  }, [group, currentUser]);

  // Handle discreet admin request (for members who want to request access)
  const handleDiscreetAdminRequest = async () => {
    if (!currentUser) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to request admin access.',
      );
      return;
    }

    if (hasPendingAdminRequest()) {
      Alert.alert(
        'Request Pending',
        'You already have a pending admin request for this group.',
      );
      return;
    }

    Alert.alert(
      'Request Admin Access',
      'Would you like to request admin access to help manage this group? Current admins will be notified and can approve or deny your request.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Request Access',
          onPress: async () => {
            try {
              setDiscreetAdminRequestLoading(true);
              const result = await GroupModel.requestAdminAccess(
                groupId,
                'Requesting admin access to help manage this group.',
              );

              // Show appropriate message based on escalation level
              if (result?.escalationLevel === 'instant') {
                Alert.alert(
                  'Admin Access Granted!',
                  'The previous admins were inactive, so you have been granted immediate admin access.',
                );
              } else if (result?.escalationLevel === 'timed') {
                Alert.alert(
                  'Request Submitted',
                  'Your request has been submitted. Since current admins appear inactive, your request will auto-approve in 7 days if no response.',
                );
              } else {
                Alert.alert(
                  'Request Submitted',
                  'Your admin request has been submitted. Current admins will be notified.',
                );
              }
              loadGroupData();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to submit admin request.',
              );
            } finally {
              setDiscreetAdminRequestLoading(false);
            }
          },
        },
      ],
    );
  };

  // Open the value prop modal before payment
  const handleContinueToPayment = () => {
    if (!currentUser) {
      Alert.alert(
        'Please sign in',
        'You must be signed in to request admin access',
      );
      return;
    }

    if (!adminRequestMessage.trim()) {
      Alert.alert(
        'Message Required',
        'Please explain your connection to this group.',
      );
      return;
    }

    // Close the request modal and show value proposition
    setClaimModalVisible(false);
    setValuePropModalVisible(true);
  };

  // Handle continue from value prop modal to payment
  const handleValuePropContinue = () => {
    setValuePropModalVisible(false);
    setSubscriptionWebViewVisible(true);
  };

  // Handle closing value prop modal (go back to claim modal)
  const handleValuePropClose = () => {
    setValuePropModalVisible(false);
    setClaimModalVisible(true);
  };

  // Handle successful subscription payment
  const handleSubscriptionSuccess = async (subscriptionId: string) => {
    setSubscriptionWebViewVisible(false);
    setRequestSubmitting(true);

    try {
      // Complete the admin access request with the subscription ID
      await dispatch(
        requestGroupAdminAccess({
          groupId,
          userId: currentUser!.uid,
          message: adminRequestMessage,
          subscriptionId, // Pass subscription ID from web payment
        }),
      ).unwrap();

      await dispatch(joinGroup(groupId)).unwrap();

      Alert.alert(
        'Success!',
        'Your subscription is active and you have been added as an admin.',
      );
      setAdminRequestMessage('');
    } catch (error) {
      console.error('Error completing admin request:', error);
      Alert.alert(
        'Error',
        'Payment was successful but we could not complete the admin request. Please contact support.',
      );
    } finally {
      setRequestSubmitting(false);
    }
  };

  // Handle subscription payment error
  const handleSubscriptionError = (error: string) => {
    setSubscriptionWebViewVisible(false);
    Alert.alert('Payment Failed', error);
  };

  // Handle subscription WebView close
  const handleSubscriptionClose = () => {
    setSubscriptionWebViewVisible(false);
    // Reopen the request modal so user can try again
    setClaimModalVisible(true);
  };

  const handleStripeConnectSetup = async () => {
    if (!currentUser) {
      Alert.alert('Please sign in', 'You must be signed in to set up payments');
      return;
    }

    setStripeSetupLoading(true);
    try {
      const createAccountLink = functions().httpsCallable(
        'createStripeAccountLink',
      );
      const response = await createAccountLink({
        groupId,
        refreshUrl: 'homegroups-app://group-overview',
        returnUrl: 'homegroups-app://group-overview',
      });

      const {url} = response.data;
      if (url) {
        // Open the Stripe Connect onboarding URL
        Linking.openURL(url);
      } else {
        throw new Error('No URL received from server');
      }
    } catch (error: any) {
      console.error('Error setting up Stripe Connect:', error);
      Alert.alert(
        'Error',
        'Failed to set up donations. Please try again later.',
      );
    } finally {
      setStripeSetupLoading(false);
    }
  };

  // Show loading indicator while initial data is loading
  if (loading && !group) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  // Check if group is loaded
  if (!group) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Group not found</Text>
      </View>
    );
  }

  const isShowingButtons = () => {
    return isGroupUnclaimed() && !isCurrentUserAdmin();
  };

  const shouldShowClaimGroupButton = () => {
    const result = isGroupUnclaimed() && !isCurrentUserAdmin();
    return result;
  };

  return (
    <View style={styles.container}>
      <OfflineBanner />

      {/* Trial Banner - shown to admins when group is in trial */}
      {isCurrentUserAdmin() && trialStatus.isInTrial && (
        <TrialStatusBanner
          daysRemaining={trialStatus.daysRemaining}
          onUpgrade={handleTrialUpgrade}
        />
      )}

      {/* Claim Banner - shown after onboarding for admin intent */}
      {showClaimBannerState && !isCurrentUserAdmin() && (
        <View style={styles.claimBanner}>
          <View style={styles.claimBannerContent}>
            <Icon name="shield-account" size={24} color="#4CAF50" />
            <View style={styles.claimBannerText}>
              <Text style={styles.claimBannerTitle}>Complete Your Setup</Text>
              <Text style={styles.claimBannerDescription}>
                Finish claiming this group to manage it
              </Text>
            </View>
          </View>
          <View style={styles.claimBannerButtons}>
            <TouchableOpacity
              style={styles.claimBannerDismiss}
              onPress={() => setShowClaimBannerState(false)}
              testID="claim-banner-dismiss">
              <Text style={styles.claimBannerDismissText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.claimBannerButton}
              onPress={() => {
                setShowClaimBannerState(false);
                setClaimModalVisible(true);
              }}
              testID="claim-banner-action">
              <Text style={styles.claimBannerButtonText}>Complete Setup</Text>
              <Icon name="arrow-right" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadGroupData} />
        }
        testID={`group-overview-screen-${groupId}`}>
        {/* Group Info Section */}
        <View
          style={{
            ...styles.section,
            ...(!isShowingButtons() && {paddingBottom: 0}),
          }}
          testID="group-info-section">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Group Information</Text>
          </View>

          <View style={styles.groupInfoContainer}>
            <Text style={styles.meetingTimeText}>
              {group.type || '12 Step'} Group
            </Text>
            {/* Location details */}
            {group.city || group.state || group.zip ? (
              <View style={styles.locationContainer}>
                <Icon name="map-marker" size={16} color="#757575" />
                <Text style={styles.locationText}>
                  {[group.city, group.state].filter(Boolean).join(', ')}
                  {group.zip ? ` ${group.zip}` : ''}
                </Text>
              </View>
            ) : group.location ? (
              <View style={styles.locationContainer}>
                <Icon name="map-marker" size={16} color="#757575" />
                <Text style={styles.locationText}>{group.location}</Text>
              </View>
            ) : null}
            <Text style={styles.memberCountText}>
              {group.memberCount} Members • Founded{' '}
              {group.foundedDate
                ? formatDate(new Date(group.foundedDate))
                : 'Recently'}
            </Text>
            <Text
              style={{
                ...styles.groupDescriptionText,
                ...(isShowingButtons() && {marginBottom: 16}),
              }}>
              {group.description}
            </Text>
          </View>

          {/* Claim Group Button - Only show if group is unclaimed and user doesn't have a pending request */}
          {shouldShowClaimGroupButton() && (
            <TouchableOpacity
              style={styles.claimGroupButton}
              onPress={() => setClaimModalVisible(true)}
              testID="group-overview-claim-button">
              <Text style={styles.claimGroupButtonText}>
                Is this your group? Request admin access
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Pending Admin Requests - Show to admins only */}
        {isCurrentUserAdmin() &&
          group.pendingAdminRequests &&
          group.pendingAdminRequests.length > 0 && (
            <PendingAdminRequestsSection
              group={group}
              onRequestHandled={loadGroupData}
            />
          )}

        {/* Admin Request Card - Show to non-admin members when group is claimed */}
        {isMember && !isCurrentUserAdmin() && group.isClaimed && (
          <AdminRequestCard group={group} onRequestSubmitted={loadGroupData} />
        )}

        {/* My Service Positions Section - Only show if user has positions */}
        {isMember && myServicePositions && myServicePositions.length > 0 && (
          <View style={styles.section} testID="my-service-positions-section">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Service Positions</Text>
              <Icon name="badge-account" size={20} color="#2196F3" />
            </View>
            {myServicePositions.map(position => (
              <View
                key={position.id}
                style={styles.myPositionItem}
                testID={`my-position-${position.id}`}>
                <View style={styles.myPositionHeader}>
                  <Icon
                    name="star-circle"
                    size={20}
                    color="#FFA000"
                    style={styles.myPositionIcon}
                  />
                  <Text style={styles.myPositionName}>{position.name}</Text>
                </View>
                {position.description && (
                  <Text style={styles.myPositionDescription}>
                    {position.description}
                  </Text>
                )}
                {(position.termStartDate || position.termEndDate) && (
                  <View style={styles.myPositionTerm}>
                    <Icon name="calendar-range" size={14} color="#757575" />
                    <Text style={styles.myPositionTermText}>
                      Term:{' '}
                      {position.termStartDate
                        ? formatDate(new Date(position.termStartDate))
                        : 'Started'}
                      {position.termEndDate
                        ? ` - ${formatDate(new Date(position.termEndDate))}`
                        : ''}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Members section */}
        {/* <TouchableOpacity
        style={styles.section}
        onPress={() =>
          navigation.navigate('GroupMembers', {
            groupId: groupId,
            groupName: group.name,
          })
        }>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members</Text>
          <Text style={styles.sectionCount}>{group.memberCount || 0}</Text>
        </View>
        <Text style={styles.sectionDescription}>
          View and manage group members
        </Text>
        <View style={styles.arrow}>
          <Text style={styles.arrowText}>→</Text>
        </View>

      </TouchableOpacity> */}
        {/* Admin Actions */}
        {group.admins &&
          group.admins.includes(auth().currentUser?.uid || '') && (
            <View style={styles.section} testID="group-admin-actions-section">
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Admin Actions</Text>
              </View>

              <TouchableOpacity
                style={styles.adminButton}
                onPress={() =>
                  navigation.navigate('GroupEditDetails', {
                    groupId,
                    groupName,
                  })
                }
                testID="group-admin-edit-button">
                <Text style={styles.adminButtonText}>Edit Group Details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.adminButton, styles.dashboardButton]}
                onPress={() =>
                  navigation.navigate('AdminDashboard', {
                    groupId,
                    groupName,
                  })
                }
                testID="group-admin-dashboard-button">
                <Icon
                  name="chart-bar"
                  size={16}
                  color="#FFFFFF"
                  style={{marginRight: 6}}
                />
                <Text style={styles.dashboardButtonText}>View Dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.adminButton, styles.referralButton]}
                onPress={() =>
                  navigation.navigate('ReferralDashboard', {
                    groupId,
                    groupName,
                  })
                }
                testID="group-admin-referral-button">
                <Icon
                  name="share-variant"
                  size={16}
                  color="#FFFFFF"
                  style={{marginRight: 6}}
                />
                <Text style={styles.referralButtonText}>Referral Program</Text>
              </TouchableOpacity>

              {FEATURE_FLAGS.SHOW_V4_ANALYTICS_GROUP_HEALTH && (
                <TouchableOpacity
                  style={[styles.adminButton, styles.healthButton]}
                  onPress={() =>
                    navigation.navigate('GroupHealthDashboard', {
                      groupId,
                      groupName,
                    })
                  }
                  testID="group-admin-health-button">
                  <Icon
                    name="chart-line"
                    size={16}
                    color="#FFFFFF"
                    style={{marginRight: 6}}
                  />
                  <Text style={styles.healthButtonText}>Group Health</Text>
                </TouchableOpacity>
              )}

              {/* Donations Setup - Show payment links status or setup button */}
              {group.paymentLinks &&
              (group.paymentLinks.venmo ||
                group.paymentLinks.cashApp ||
                group.paymentLinks.paypal ||
                group.paymentLinks.zelle) ? (
                <View style={styles.paymentLinksStatus}>
                  <View style={styles.paymentLinksHeader}>
                    <Icon name="check-circle" size={20} color="#4CAF50" />
                    <Text style={styles.paymentLinksStatusText}>
                      Donations Enabled
                    </Text>
                  </View>
                  <View style={styles.paymentLinksIcons}>
                    {group.paymentLinks.venmo && (
                      <View
                        style={[
                          styles.paymentLinkBadge,
                          {backgroundColor: '#008CFF'},
                        ]}>
                        <Text style={styles.paymentLinkBadgeText}>Venmo</Text>
                      </View>
                    )}
                    {group.paymentLinks.cashApp && (
                      <View
                        style={[
                          styles.paymentLinkBadge,
                          {backgroundColor: '#00D632'},
                        ]}>
                        <Text style={styles.paymentLinkBadgeText}>
                          Cash App
                        </Text>
                      </View>
                    )}
                    {group.paymentLinks.paypal && (
                      <View
                        style={[
                          styles.paymentLinkBadge,
                          {backgroundColor: '#003087'},
                        ]}>
                        <Text style={styles.paymentLinkBadgeText}>PayPal</Text>
                      </View>
                    )}
                    {group.paymentLinks.zelle && (
                      <View
                        style={[
                          styles.paymentLinkBadge,
                          {backgroundColor: '#6D1ED4'},
                        ]}>
                        <Text style={styles.paymentLinkBadgeText}>Zelle</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.editPaymentLinksButton}
                    onPress={() =>
                      navigation.navigate('PaymentLinksSetup', {
                        groupId,
                        groupName,
                      })
                    }
                    testID="edit-payment-links-button">
                    <Text style={styles.editPaymentLinksText}>
                      Edit Payment Links
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : group.stripeConnectAccountId ? (
                <TouchableOpacity
                  style={styles.adminButton}
                  onPress={() => setStripeSetupModalVisible(true)}
                  disabled={stripeSetupLoading}
                  testID="group-admin-stripe-setup-button">
                  {stripeSetupLoading ? (
                    <ActivityIndicator size="small" color="#2196F3" />
                  ) : (
                    <Text style={styles.adminButtonText}>
                      Update Stripe Settings
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.adminButton, styles.primaryButton]}
                  onPress={() =>
                    navigation.navigate('PaymentLinksSetup', {
                      groupId,
                      groupName,
                    })
                  }
                  testID="setup-donations-button">
                  <Icon
                    name="hand-heart"
                    size={18}
                    color="#FFFFFF"
                    style={{marginRight: 8}}
                  />
                  <Text style={styles.primaryButtonText}>Set Up Donations</Text>
                </TouchableOpacity>
              )}

              {/* Export Group Data */}
              {FEATURE_FLAGS.SHOW_V4_ENTERPRISE_DATA_EXPORT && (
                <TouchableOpacity
                  style={[styles.adminButton]}
                  onPress={() =>
                    navigation.navigate('GroupDataExport', {
                      groupId,
                      groupName: group.name || groupName,
                    })
                  }
                  testID="group-admin-export-button">
                  <Icon
                    name="database-export"
                    size={16}
                    color="#FFFFFF"
                    style={{marginRight: 6}}
                  />
                  <Text style={styles.adminButtonText}>Export Group Data</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

        {/* Navigation Tiles */}
        <View style={styles.navTilesContainer}>
          <TouchableOpacity
            style={styles.navTile}
            onPress={navigateToGroupMembers}
            testID="group-overview-members-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>👥</Text>
            </View>
            <Text style={styles.navTileText}>Members</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTile}
            onPress={navigateToGroupAnnouncements}
            testID="group-overview-announcements-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>📢</Text>
            </View>
            <Text style={styles.navTileText}>Announcements</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTile}
            onPress={navigateToGroupTreasury}
            testID="group-overview-treasury-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>💰</Text>
            </View>
            <Text style={styles.navTileText}>Treasury</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navTile,
              !group.stripeConnectAccountId &&
                !group.paymentLinks?.venmo &&
                !group.paymentLinks?.cashApp &&
                !group.paymentLinks?.paypal &&
                !group.paymentLinks?.zelle && {opacity: 0.5},
            ]}
            onPress={navigateToGroupDonation}
            disabled={
              !group.stripeConnectAccountId &&
              !group.paymentLinks?.venmo &&
              !group.paymentLinks?.cashApp &&
              !group.paymentLinks?.paypal &&
              !group.paymentLinks?.zelle
            }
            testID="group-overview-donation-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>💝</Text>
            </View>
            <Text style={styles.navTileText}>Donate</Text>
            {!group.stripeConnectAccountId &&
              !group.paymentLinks?.venmo &&
              !group.paymentLinks?.cashApp &&
              !group.paymentLinks?.paypal &&
              !group.paymentLinks?.zelle && (
                <Text style={styles.navTileSubtext}>Not available</Text>
              )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTile}
            onPress={navigateToGroupSchedule}
            testID="group-overview-schedule-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>📅</Text>
            </View>
            <Text style={styles.navTileText}>Meetings</Text>
          </TouchableOpacity>

          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={navigateToGroupChat}
              testID="group-overview-chat-tile">
              <View style={styles.navTileIcon}>
                <Text style={styles.navTileIconText}>💬</Text>
                <View style={styles.chatBadgeContainer}>
                  <UnreadBadge count={chatUnreadCount} size="small" />
                </View>
              </View>
              <Text style={styles.navTileText}>Chat</Text>
            </TouchableOpacity>
          )}

          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() => setInviteShareSheetVisible(true)}
              testID="group-overview-invite-tile">
              <View style={styles.navTileIcon}>
                <Text style={styles.navTileIconText}>✉️</Text>
              </View>
              <Text style={styles.navTileText}>Invite</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.navTile, {opacity: 0.5}]}
            disabled={true}
            testID="group-overview-literature-tile"
            onPress={navigateToGroupLiterature}>
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>📚</Text>
            </View>
            <Text style={styles.navTileText}>Literature</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTile}
            onPress={navigateToGroupSponsors}
            testID="group-overview-sponsors-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>🤝</Text>
            </View>
            <Text style={styles.navTileText}>Sponsors</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTile}
            onPress={() =>
              navigation.navigate('GroupServicePositions', {groupId, groupName})
            }
            testID="group-overview-service-positions-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>🧑‍🤝‍🧑</Text>
            </View>
            <Text style={styles.navTileText}>Service Positions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTile}
            onPress={navigateToBusinessMeetings}
            testID="group-overview-business-meetings-tile">
            <View style={styles.navTileIcon}>
              <Text style={styles.navTileIconText}>📋</Text>
            </View>
            <Text style={styles.navTileText}>Business Meetings</Text>
          </TouchableOpacity>

          {/* Phone List tile */}
          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupPhoneList', {groupId, groupName})
              }
              testID="group-overview-phone-list-tile">
              <View style={styles.navTileIcon}>
                <Text style={styles.navTileIconText}>📞</Text>
              </View>
              <Text style={styles.navTileText}>Phone List</Text>
            </TouchableOpacity>
          )}

          {/* Milestones tile */}
          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupMilestones', {groupId, groupName})
              }
              testID="group-overview-milestones-tile">
              <View style={styles.navTileIcon}>
                <Text style={styles.navTileIconText}>🏅</Text>
              </View>
              <Text style={styles.navTileText}>Milestones</Text>
            </TouchableOpacity>
          )}

          {/* Group Conscience tile */}
          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupConscience', {groupId, groupName})
              }
              testID="group-overview-conscience-tile">
              <View style={[styles.navTileIcon, {backgroundColor: '#E8EAF6'}]}>
                <Icon name="vote" size={24} color="#3F51B5" />
              </View>
              <Text style={styles.navTileText}>Group Conscience</Text>
            </TouchableOpacity>
          )}

          {/* Secretary Toolkit tile - Admin or Secretary only */}
          {isMember && isSecretaryOrAdmin && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('SecretaryToolkit', {groupId, groupName})
              }
              testID="group-overview-secretary-toolkit-tile">
              <View style={[styles.navTileIcon, {backgroundColor: '#F3E5F5'}]}>
                <Icon name="clipboard-check" size={24} color="#7B1FA2" />
              </View>
              <Text style={styles.navTileText}>Secretary Toolkit</Text>
            </TouchableOpacity>
          )}

          {/* Group Resources tile - V4.2.5: hidden until content strategy established */}
          {isMember && FEATURE_FLAGS.SHOW_V4_CONTENT_GROUP_RESOURCES && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupResourceLibrary', {
                  groupId,
                  groupName,
                })
              }
              testID="group-overview-resources-tile">
              <View style={[styles.navTileIcon, {backgroundColor: '#E8F5E9'}]}>
                <Icon
                  name="folder-multiple-outline"
                  size={24}
                  color="#388E3C"
                />
              </View>
              <Text style={styles.navTileText}>Resources</Text>
            </TouchableOpacity>
          )}

          {/* Moderation tile - Admin only */}
          {isCurrentUserAdmin() && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={navigateToModerationQueue}
              testID="group-overview-moderation-tile">
              <View style={[styles.navTileIcon, {backgroundColor: '#FFF3E0'}]}>
                <Icon name="shield-alert" size={24} color="#FF9800" />
              </View>
              <Text style={styles.navTileText}>Moderation</Text>
              {pendingReportCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{pendingReportCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* V4.1: Guidelines tile — hidden (niche feature, doesn't drive adoption) */}
          {isMember && FEATURE_FLAGS.SHOW_V4_GOVERNANCE_BYLAWS && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupBylaws', {groupId, groupName})
              }
              testID="group-overview-bylaws-tile">
              <View style={[styles.navTileIcon, {backgroundColor: '#E8F5E9'}]}>
                <Icon name="file-document-outline" size={24} color="#388E3C" />
              </View>
              <Text style={styles.navTileText}>Guidelines</Text>
            </TouchableOpacity>
          )}

          {/* V4.1: Minutes tile — secretary/admin only */}
          {isMember && isSecretaryOrAdmin && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('MinutesArchive', {groupId, groupName})
              }
              testID="group-overview-minutes-archive-tile">
              <View style={[styles.navTileIcon, {backgroundColor: '#FBE9E7'}]}>
                <Icon name="notebook-outline" size={24} color="#BF360C" />
              </View>
              <Text style={styles.navTileText}>Minutes</Text>
            </TouchableOpacity>
          )}

          {/* V4.1: GSR Report tile — hidden (intergroup feature, not yet needed) */}
          {isCurrentUserAdmin() &&
            FEATURE_FLAGS.SHOW_V4_GOVERNANCE_GSR_REPORT && (
              <TouchableOpacity
                style={styles.navTile}
                onPress={() =>
                  navigation.navigate('IntergroupReportHistory', {
                    groupId,
                    groupName,
                  })
                }
                testID="group-overview-gsr-report-tile">
                <View
                  style={[styles.navTileIcon, {backgroundColor: '#E8EAF6'}]}>
                  <Icon name="file-chart-outline" size={24} color="#3949AB" />
                </View>
                <Text style={styles.navTileText}>GSR Report</Text>
              </TouchableOpacity>
            )}
        </View>

        {/* Sponsor Section */}
        {activeSponsorship && (
          <View style={styles.section} testID="group-sponsor-section">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Sponsor</Text>
            </View>
            <View style={styles.sponsorContainer}>
              <Text style={styles.sponsorName}>
                {activeSponsorship.sponsorName}
              </Text>
              <Text style={styles.sponsorStatus}>
                Active since{' '}
                {new Date(activeSponsorship.startDate).toLocaleDateString()}
              </Text>
              <TouchableOpacity
                style={styles.chatButton}
                onPress={navigateToSponsorChat}>
                <Icon name="message-text" size={20} color="#2196F3" />
                <Text style={styles.chatButtonText}>Chat with Sponsor</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Upcoming Meetings Section */}
        <View style={styles.section} testID="group-upcoming-meetings-section">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Meetings</Text>
            <TouchableOpacity
              onPress={navigateToGroupSchedule}
              testID="group-overview-view-schedule-button">
              <Text style={styles.seeAllText}>View Full Schedule</Text>
            </TouchableOpacity>
          </View>

          {instances && instances.length > 0 ? (
            instances.map(instance => {
              const formattedDate = moment(instance.scheduledAt).format(
                'ddd, MMM D',
              );
              const formattedTime = moment(instance.scheduledAt).format(
                'h:mm A',
              );
              const isOnline = instance.isOnline ?? false;
              const locationDisplay = isOnline
                ? 'Online Meeting'
                : instance.locationName || instance.address || 'Location TBD';

              const isAdmin = group?.admins?.includes(currentUser?.uid || '');

              return (
                <TouchableOpacity
                  key={instance.instanceId}
                  style={styles.meetingItem}
                  testID={`group-overview-instance-${instance.instanceId}`}
                  onPress={() => {
                    if (isAdmin) {
                      navigation.navigate('EditMeetingInstance', {
                        groupId,
                        groupName,
                        instanceId: instance.instanceId,
                      });
                    }
                  }}
                  disabled={!isAdmin}>
                  <View style={styles.meetingTimeContainer}>
                    <Text style={styles.meetingDateText}>{formattedDate}</Text>
                    <Text style={styles.meetingTime}>{formattedTime}</Text>
                  </View>
                  <View style={styles.meetingContent}>
                    <Text style={styles.meetingName}>{instance.name}</Text>
                    <Text style={styles.meetingLocation}>
                      {locationDisplay}
                    </Text>
                    <Text style={styles.meetingFormat}>
                      {instance.format || instance.type}
                    </Text>
                    {instance.chairpersonName && (
                      <Text style={styles.chairpersonText}>
                        Chair: {instance.chairpersonName}
                      </Text>
                    )}
                    {instance.instanceNotice && (
                      <View style={styles.noticeContainer}>
                        <Icon
                          name="information-outline"
                          size={14}
                          color="#FFA000"
                          style={{marginRight: 4}}
                        />
                        <Text style={styles.noticeText}>
                          {instance.instanceNotice}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text
              style={styles.emptyStateText}
              testID="group-overview-no-meetings">
              No upcoming meetings scheduled.
            </Text>
          )}
        </View>

        {/* Announcements Section */}
        <View style={styles.section} testID="group-announcements-section">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Announcements</Text>
            <TouchableOpacity
              onPress={navigateToGroupAnnouncements}
              testID="group-overview-view-announcements-button">
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {announcements.length > 0 ? (
            announcements.slice(0, 2).map(announcement => (
              <View
                key={announcement.id}
                style={styles.announcementItem}
                testID={`group-overview-announcement-${announcement.id}`}>
                <Text style={styles.announcementTitle}>
                  {announcement.title}
                </Text>
                <Text style={styles.announcementMessage} numberOfLines={2}>
                  {announcement.content}
                </Text>
                <View style={styles.announcementFooter}>
                  <Text style={styles.announcementMeta}>
                    Posted by {announcement.authorName} on{' '}
                    {formatDate(announcement.createdAt)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text
              style={styles.emptyStateText}
              testID="group-overview-no-announcements">
              No announcements
            </Text>
          )}
        </View>

        {/* Celebrations Section */}
        <View style={styles.section} testID="group-celebrations-section">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Celebrations</Text>
          </View>

          {celebrations.length > 0 ? (
            celebrations.map((celebration: GroupMilestone, index: number) => (
              <View
                key={index}
                style={styles.celebrationItem}
                testID={`group-overview-celebration-${index}`}>
                <View style={styles.celebrationIcon}>
                  <Text style={styles.celebrationIconText}>🎉</Text>
                </View>
                <View style={styles.celebrationInfo}>
                  <Text style={styles.celebrationName}>
                    {celebration.memberName} - {celebration.years}{' '}
                    {celebration.years === 1 ? 'Year' : 'Years'}
                  </Text>
                  <Text style={styles.celebrationDate}>
                    {formatDate(celebration.date)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text
              style={styles.emptyStateText}
              testID="group-overview-no-celebrations">
              No upcoming celebrations
            </Text>
          )}
        </View>

        {/* Join Group Button */}
        {!isMember && (
          <TouchableOpacity
            style={styles.joinGroupButton}
            onPress={handleJoinGroup}
            disabled={joinGroupLoading}
            testID="group-overview-join-button">
            {joinGroupLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.joinGroupButtonText}>Join Group</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Leave Group Button */}
        {isMember && (
          <TouchableOpacity
            style={styles.leaveGroupButton}
            onPress={handleLeaveGroup}
            disabled={leaveGroupLoading}
            testID="group-overview-leave-button">
            {leaveGroupLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.leaveGroupButtonText}>Leave Group</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Discreet Admin Request Link - Show to members who are not admins and don't have pending request */}
        {isMember && !isCurrentUserAdmin() && !hasPendingAdminRequest() && (
          <TouchableOpacity
            style={styles.discreetAdminRequestLink}
            onPress={handleDiscreetAdminRequest}
            disabled={discreetAdminRequestLoading}
            testID="group-overview-request-admin-link">
            {discreetAdminRequestLoading ? (
              <ActivityIndicator size="small" color="#757575" />
            ) : (
              <View style={styles.discreetAdminRequestContent}>
                <Icon name="shield-account-outline" size={16} color="#757575" />
                <Text style={styles.discreetAdminRequestText}>
                  Request Admin Access
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Pending Admin Request Status */}
        {isMember && !isCurrentUserAdmin() && hasPendingAdminRequest() && (
          <View style={styles.pendingRequestStatus}>
            <Icon name="clock-outline" size={16} color="#FF9800" />
            <Text style={styles.pendingRequestStatusText}>
              Admin request pending
            </Text>
          </View>
        )}

        {/* Claim Group Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={claimModalVisible}
          onRequestClose={() => setClaimModalVisible(false)}
          testID="group-claim-modal">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Request Admin Access</Text>

              <Text style={styles.modalDescription}>
                As a group admin, you'll help maintain accurate meeting
                information and details for the recovery community.
              </Text>

              <Text style={styles.inputLabel}>
                Please explain your connection to this group:
              </Text>
              <TextInput
                style={styles.messageInput}
                multiline={true}
                numberOfLines={4}
                placeholder="e.g., 'I am the group secretary' or 'I attend regularly'"
                value={adminRequestMessage}
                onChangeText={setAdminRequestMessage}
                testID="group-claim-message-input"
              />

              <View style={styles.subscriptionInfo}>
                <Icon name="credit-card-outline" size={20} color="#2196F3" />
                <Text style={styles.subscriptionInfoText}>
                  An annual subscription ($12/year) is required to manage this
                  group. You'll be taken to a secure payment page next.
                </Text>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setClaimModalVisible(false);
                    setAdminRequestMessage('');
                  }}
                  testID="group-claim-cancel-button">
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    !adminRequestMessage.trim() && styles.submitButtonDisabled,
                  ]}
                  onPress={handleContinueToPayment}
                  disabled={!adminRequestMessage.trim()}
                  testID="group-claim-submit-button">
                  <Text style={styles.submitButtonText}>
                    Continue to Payment
                  </Text>
                  <Icon
                    name="arrow-right"
                    size={18}
                    color="#FFFFFF"
                    style={{marginLeft: 6}}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Admin Value Proposition Modal */}
        <AdminValuePropModal
          visible={valuePropModalVisible}
          onClose={handleValuePropClose}
          onContinue={handleValuePropContinue}
        />

        {/* Subscription Payment WebView */}
        <SubscriptionWebView
          visible={subscriptionWebViewVisible}
          onClose={handleSubscriptionClose}
          onSuccess={handleSubscriptionSuccess}
          onError={handleSubscriptionError}
          userId={currentUser?.uid || ''}
          userEmail={currentUser?.email || ''}
          userName={currentUser?.displayName || ''}
          groupId={groupId}
          groupName={groupName}
          requestMessage={adminRequestMessage}
        />

        {/* Group Invite Modal (email invite — legacy) */}
        <GroupInviteModal
          visible={inviteModalVisible}
          onClose={() => setInviteModalVisible(false)}
          groupId={groupId}
          groupName={group?.name || groupName}
        />

        {/* Group Switcher Modal */}
        <GroupSwitcherModal
          visible={groupSwitcherVisible}
          onClose={() => setGroupSwitcherVisible(false)}
          currentGroupId={groupId}
        />

        {/* Invite Share Sheet — QR/deep link/SMS/share */}
        <InviteShareSheet
          visible={inviteShareSheetVisible}
          onClose={() => setInviteShareSheetVisible(false)}
          groupId={groupId}
          groupName={group?.name || groupName}
        />

        {/* Stripe Setup Guide Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={stripeSetupModalVisible}
          onRequestClose={() => setStripeSetupModalVisible(false)}
          testID="stripe-setup-modal">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Set Up Donations</Text>

              <Text style={styles.modalDescription}>
                Enable your group to receive donations from members. You'll need
                to complete Stripe's onboarding process to securely accept
                payments. Here's what you need to know:
              </Text>

              <View style={styles.setupStepsContainer}>
                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>1</Text>
                  <View style={styles.setupStepContent}>
                    <Text style={styles.setupStepText}>
                      When asked for your website, if you don't have one you can
                      use your group's page on the Homegroups website:
                    </Text>
                    <View style={styles.urlContainer}>
                      <Text style={styles.setupStepUrl}>
                        https://homegroups-app.com/groups/{groupId}
                      </Text>
                      <TouchableOpacity
                        style={styles.copyButton}
                        onPress={async () => {
                          Clipboard.setString(
                            `https://homegroups-app.com/groups/${groupId}`,
                          );
                          Alert.alert('Copied!', 'URL copied to clipboard');
                        }}
                        testID="copy-group-url-button">
                        <Icon name="content-copy" size={20} color="#2196F3" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>2</Text>
                  <Text style={styles.setupStepText}>
                    Complete all required information about your group
                  </Text>
                </View>

                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>3</Text>
                  <Text style={styles.setupStepText}>
                    Add your bank account information to receive donations
                  </Text>
                </View>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setStripeSetupModalVisible(false)}
                  testID="stripe-setup-cancel-button">
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => {
                    setStripeSetupModalVisible(false);
                    handleStripeConnectSetup();
                  }}
                  testID="stripe-setup-continue-button">
                  <Text style={styles.submitButtonText}>Continue Setup</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContainer: {
    flex: 1,
  },
  // Claim Banner Styles
  claimBanner: {
    backgroundColor: '#E8F5E9',
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
    padding: 16,
  },
  claimBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  claimBannerText: {
    marginLeft: 12,
    flex: 1,
  },
  claimBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 2,
  },
  claimBannerDescription: {
    fontSize: 14,
    color: '#558B2F',
  },
  claimBannerButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  claimBannerDismiss: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  claimBannerDismissText: {
    fontSize: 14,
    color: '#558B2F',
    fontWeight: '500',
  },
  claimBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  claimBannerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  seeAllText: {
    fontSize: 14,
    color: '#2196F3',
  },
  groupInfoContainer: {
    marginBottom: 12,
  },
  meetingTimeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 16,
    color: '#424242',
    marginLeft: 4,
  },
  meetingTypeText: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 8,
  },
  memberCountText: {
    fontSize: 14,
    color: '#9E9E9E',
    marginBottom: 12,
  },
  groupDescriptionText: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
  },
  navTilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 12,
  },
  navTile: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  navTileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  chatBadgeContainer: {
    position: 'absolute',
    top: -4,
    right: -8,
  },
  navTileIconText: {
    fontSize: 24,
  },
  navTileText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  navTileSubtext: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF9800',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  adminButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  adminButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
  },
  meetingItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3', // Default blue border
  },
  cancelledItem: {
    borderLeftColor: '#D32F2F', // Red border for cancelled
    backgroundColor: '#FFF0F0', // Lighter red background
  },
  meetingTimeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    minWidth: 100, // Adjusted width
  },
  meetingDateText: {
    // New style for Date
    fontSize: 13,
    color: '#757575',
    marginBottom: 4,
    textAlign: 'center',
  },
  meetingTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  cancelledText: {
    // Style for CANCELLED text
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginTop: 4,
  },
  meetingContent: {
    flex: 1,
    paddingLeft: 16,
  },
  meetingName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  meetingLocation: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
  },
  meetingFormat: {
    fontSize: 14,
    color: '#9E9E9E',
    marginBottom: 6, // Added margin
  },
  chairpersonText: {
    fontSize: 13,
    color: '#2196F3',
    marginTop: 4,
    fontWeight: '500',
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 6, // Added margin
    alignSelf: 'flex-start', // Prevent full width
  },
  noticeText: {
    fontSize: 12,
    color: '#FFA000',
    flexShrink: 1, // Allow text to wrap
  },
  cancelledNoticeContainer: {
    backgroundColor: '#FFEBEE',
  },
  cancelledNoticeText: {
    color: '#D32F2F',
  },
  announcementItem: {
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 12,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  announcementMessage: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 8,
    lineHeight: 20,
  },
  announcementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announcementMeta: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  celebrationItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  celebrationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  celebrationIconText: {
    fontSize: 20,
  },
  celebrationInfo: {
    flex: 1,
  },
  celebrationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  celebrationDate: {
    fontSize: 14,
    color: '#757575',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  joinGroupButton: {
    backgroundColor: '#2196F3',
    margin: 16,
    marginTop: 4,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  joinGroupButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  leaveGroupButton: {
    backgroundColor: '#FFEBEE',
    margin: 16,
    marginTop: 4,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  leaveGroupButtonText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 16,
  },
  discreetAdminRequestLink: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  discreetAdminRequestContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discreetAdminRequestText: {
    color: '#757575',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  pendingRequestStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 6,
  },
  pendingRequestStatusText: {
    color: '#FF9800',
    fontSize: 14,
    fontStyle: 'italic',
  },
  sectionCount: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#757575',
  },
  arrow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  claimGroupButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 0,
  },
  claimGroupButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
  },
  pendingRequestContainer: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  pendingRequestText: {
    color: '#FFA000',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    width: '100%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: '#212121',
  },
  modalDescription: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
    lineHeight: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    padding: 12,
    fontSize: 14,
    color: '#212121',
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 16, // Add margin to separate from payment input
  },
  subscriptionInfo: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  subscriptionInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    marginLeft: 10,
    lineHeight: 18,
  },
  submitButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#757575',
    fontWeight: '600',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  sponsorContainer: {
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  sponsorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  sponsorStatus: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 12,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  chatButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    marginLeft: 8,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  dashboardButton: {
    backgroundColor: '#1976D2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  referralButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  healthButton: {
    backgroundColor: '#6A1B9A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  setupStepsContainer: {
    marginVertical: 16,
  },
  setupStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  setupStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
    fontSize: 14,
    fontWeight: 'bold',
  },
  setupStepContent: {
    flex: 1,
  },
  setupStepText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    marginTop: 4,
    padding: 8,
  },
  setupStepUrl: {
    flex: 1,
    fontSize: 14,
    color: '#2196F3',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyButton: {
    padding: 8,
    marginLeft: 8,
  },
  // My Service Positions styles
  myPositionItem: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FFA000',
  },
  myPositionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  myPositionIcon: {
    marginRight: 8,
  },
  myPositionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  myPositionDescription: {
    fontSize: 14,
    color: '#616161',
    marginLeft: 28,
    marginBottom: 4,
  },
  myPositionTerm: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 28,
    marginTop: 4,
  },
  myPositionTermText: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 4,
  },
  // Payment Links Status Styles
  paymentLinksStatus: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  paymentLinksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentLinksStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 8,
  },
  paymentLinksIcons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  paymentLinkBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paymentLinkBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  editPaymentLinksButton: {
    marginTop: 4,
  },
  editPaymentLinksText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default GroupOverviewScreen;
