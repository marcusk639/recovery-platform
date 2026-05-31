import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchAnnouncementsForGroup,
  createAnnouncement,
  selectAnnouncementsByGroupId,
  selectAnnouncementsStatus,
  selectAnnouncementsError,
  deleteAnnouncement,
} from '../../store/slices/announcementsSlice';
import {Announcement} from '../../types';
import {
  selectGroupById,
  selectAdminGroups,
} from '../../store/slices/groupsSlice';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import FeatureTooltip from '../../components/subscription/FeatureTooltip';
import AskAdminUpgradeModal from '../../components/payments/AskAdminUpgradeModal';
import {useTrialStatus} from '../../hooks/useTrialStatus';

type GroupAnnouncementsScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupAnnouncements'
>;
type GroupAnnouncementsScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const GroupAnnouncementsScreen: React.FC = () => {
  const route = useRoute<GroupAnnouncementsScreenRouteProp>();
  const navigation = useNavigation<GroupAnnouncementsScreenNavigationProp>();
  const {groupId, groupName} = route.params;

  const trialStatus = useTrialStatus(groupId);
  const isSubscriptionActive =
    (trialStatus.isInTrial && !trialStatus.isExpired) || trialStatus.isActive;

  const dispatch = useAppDispatch();

  // Get data from Redux store
  const announcements = useAppSelector(state =>
    selectAnnouncementsByGroupId(state, groupId),
  );
  const status = useAppSelector(selectAnnouncementsStatus);
  const error = useAppSelector(selectAnnouncementsError);

  const loading = status === 'loading';
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [askAdminModalVisible, setAskAdminModalVisible] = useState(false);

  const handleCreatePress = () => {
    if (!isSubscriptionActive) {
      navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
      return;
    }
    setModalVisible(true);
  };

  const group = useAppSelector(state => selectGroupById(state, groupId));

  // Derive admin display name for Ask Admin modal
  const groupMembers = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );
  const firstAdminDisplayName: string | undefined = (() => {
    const adminUids = group?.admins || [];
    if (adminUids.length === 0) return undefined;
    const adminMember = groupMembers.find(m => adminUids.includes(m.userId));
    return adminMember?.name || undefined;
  })();

  // All groups where the current user is an admin — used for multi-group posting
  const adminGroups = useAppSelector(selectAdminGroups);
  // Groups other than the current one where user is also admin
  const otherAdminGroups = adminGroups.filter(g => g && g.id !== groupId);
  const canPostToMultipleGroups = isAdmin && otherAdminGroups.length >= 1;

  // Multi-group announcement state
  const [multiGroupModalVisible, setMultiGroupModalVisible] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([groupId]);
  const [multiGroupSubmitting, setMultiGroupSubmitting] = useState(false);
  const [multiGroupTitle, setMultiGroupTitle] = useState('');
  const [multiGroupContent, setMultiGroupContent] = useState('');

  // New announcement form
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<Date>(
    new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const checkAdminStatus = async () => {
    try {
      // Get the current user
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return;
      }

      // Check if user is in admins array of the group

      const isUserAdmin = group?.admins?.includes(currentUser.uid) || false;
      setIsAdmin(isUserAdmin);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadAnnouncements = useCallback(() => {
    setRefreshing(true);
    dispatch(fetchAnnouncementsForGroup({groupId, isAdmin}))
      .unwrap()
      .catch(error => {
        if (error && error.name !== 'ConditionError') {
          Alert.alert(
            'Error',
            'Failed to load announcements. Please try again later.',
          );
        }
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [dispatch, groupId, isAdmin]);

  // Effect 1: Check admin status when groupId changes
  useEffect(() => {
    checkAdminStatus();
  }, [groupId]); // checkAdminStatus depends on group/groupId, so this is correct

  // Effect 2: Load announcements when loadAnnouncements changes (which happens when isAdmin changes)
  useEffect(() => {
    if (groupId) {
      loadAnnouncements();
    }
  }, [loadAnnouncements]); // loadAnnouncements already has isAdmin in its useCallback deps

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Please enter both a title and content.');
      return;
    }

    if (isScheduled && scheduledFor <= new Date()) {
      Alert.alert('Error', 'Scheduled time must be in the future');
      return;
    }

    const currentUser = auth().currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'Please sign in to create an announcement.');
      return;
    }

    try {
      setSubmitting(true);

      // Dispatch the create action to Redux store
      await dispatch(
        createAnnouncement({
          groupId,
          title: title.trim(),
          content: content.trim(),
          isPinned,
          scheduledFor: isScheduled ? scheduledFor : undefined,
          userId: currentUser.uid,
          memberId: currentUser.uid,
        }),
      ).unwrap();

      // Capture values before resetForm clears them
      const wasScheduled = isScheduled;
      const scheduledDate = scheduledFor;

      setModalVisible(false);
      resetForm();

      Alert.alert(
        wasScheduled ? 'Scheduled!' : 'Posted!',
        wasScheduled
          ? `Announcement scheduled for ${scheduledDate.toLocaleString()}`
          : 'Announcement posted successfully',
      );
    } catch (error) {
      console.error('Error creating announcement:', error);
      Alert.alert('Error', 'Failed to create announcement. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (announcementId: string) => {
    try {
      await dispatch(deleteAnnouncement({groupId, announcementId})).unwrap();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      Alert.alert('Error', 'Failed to delete announcement. Please try again.');
    }
  };

  const toggleGroupSelection = (gId: string) => {
    if (gId === groupId) return; // current group is always included
    setSelectedGroupIds(prev =>
      prev.includes(gId) ? prev.filter(id => id !== gId) : [...prev, gId],
    );
  };

  const handleMultiGroupSubmit = async () => {
    if (!multiGroupTitle.trim() || !multiGroupContent.trim()) {
      Alert.alert('Error', 'Please enter both a title and content.');
      return;
    }
    if (selectedGroupIds.length === 0) {
      Alert.alert('Error', 'Select at least one group to post to.');
      return;
    }

    setMultiGroupSubmitting(true);
    try {
      const callable = functions().httpsCallable(
        'createMultiGroupAnnouncement',
      );
      const result = await callable({
        groupIds: selectedGroupIds,
        title: multiGroupTitle.trim(),
        content: multiGroupContent.trim(),
      });
      const data = result.data as {
        createdCount: number;
        announcementIds: string[];
      };

      setMultiGroupModalVisible(false);
      setMultiGroupTitle('');
      setMultiGroupContent('');
      setSelectedGroupIds([groupId]);

      Alert.alert(
        'Posted!',
        `Announcement posted to ${data.createdCount} group${data.createdCount !== 1 ? 's' : ''}.`,
      );

      // Refresh the current group's announcements
      dispatch(fetchAnnouncementsForGroup({groupId, isAdmin}));
    } catch (error: any) {
      console.error('Error posting multi-group announcement:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to post announcement. Please try again.',
      );
    } finally {
      setMultiGroupSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setIsPinned(false);
    setIsScheduled(false);
    setScheduledFor(new Date(Date.now() + 60 * 60 * 1000));
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const handleViewDetails = (announcement: Announcement) => {
    navigation.navigate('GroupAnnouncementDetails', {
      groupId,
      announcementId: announcement.id,
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderItem = ({item}: {item: Announcement}) => (
    <View
      style={styles.announcementCard}
      testID={`announcement-card-${item.id}`}>
      <View style={styles.cardHeader}>
        <Text style={styles.announcementTitle}>{item.title}</Text>
        {isAdmin && (
          <TouchableOpacity
            onPress={() => handleDelete(item.id)}
            style={styles.deleteButton}
            testID={`announcement-delete-button-${item.id}`}>
            <Icon name="delete-outline" size={20} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.badgeRow}>
        {item.isPinned && (
          <View style={styles.pinnedBadge}>
            <Text style={styles.pinnedText}>📌 Pinned</Text>
          </View>
        )}
        {item.status === 'scheduled' && (
          <View style={styles.scheduledBadge}>
            <Text style={styles.scheduledBadgeText}>
              🕐 {item.scheduledFor?.toLocaleDateString() ?? 'Pending'}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.announcementContent} numberOfLines={3}>
        {item.content}
      </Text>
      <View style={styles.announcementFooter}>
        <Text style={styles.announcementMeta}>
          Posted by {item.authorName} on {formatDate(item.createdAt)}
        </Text>
        {isAdmin && (
          <View style={styles.readCountContainer}>
            <Icon name="eye-outline" size={14} color="#9E9E9E" />
            <Text style={styles.readCountText}>{item.readCount ?? 0} read</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setModalVisible(false);
        resetForm();
      }}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Announcement</Text>
            <TouchableOpacity
              onPress={() => {
                setModalVisible(false);
                resetForm();
              }}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter announcement title"
              maxLength={100}
              testID="announcement-title-input"
            />

            <Text style={styles.inputLabel}>Content</Text>
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="Enter announcement details..."
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              maxLength={2000}
              testID="announcement-content-input"
            />

            <TouchableOpacity
              style={styles.pinnedCheckbox}
              onPress={() => setIsPinned(!isPinned)}>
              <View
                style={[styles.checkbox, isPinned && styles.checkboxActive]}>
                {isPinned && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Pin this announcement</Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              Pinned announcements will appear at the top of the list. Only 3
              announcements can be pinned at a time.
            </Text>

            {/* Schedule toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsScheduled(!isScheduled)}>
              <View
                style={[
                  styles.scheduleCheckbox,
                  isScheduled && styles.checkboxActive,
                ]}>
                {isScheduled && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Schedule for later</Text>
            </TouchableOpacity>

            {isScheduled && (
              <View style={styles.schedulerContainer}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.dateButtonLabel}>Date</Text>
                  <Text style={styles.dateButtonValue}>
                    {scheduledFor.toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowTimePicker(true)}>
                  <Text style={styles.dateButtonLabel}>Time</Text>
                  <Text style={styles.dateButtonValue}>
                    {scheduledFor.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={scheduledFor}
                mode="date"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    const updated = new Date(scheduledFor);
                    updated.setFullYear(
                      date.getFullYear(),
                      date.getMonth(),
                      date.getDate(),
                    );
                    setScheduledFor(updated);
                  }
                }}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={scheduledFor}
                mode="time"
                onChange={(_, time) => {
                  setShowTimePicker(false);
                  if (time) {
                    const updated = new Date(scheduledFor);
                    updated.setHours(time.getHours(), time.getMinutes());
                    setScheduledFor(updated);
                  }
                }}
              />
            )}

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreate}
              disabled={submitting}
              testID="announcement-submit-button">
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isScheduled ? 'Schedule Announcement' : 'Post Announcement'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderMultiGroupModal = () => (
    <Modal
      visible={multiGroupModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setMultiGroupModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Post to Multiple Groups</Text>
            <TouchableOpacity
              onPress={() => setMultiGroupModalVisible(false)}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={multiGroupTitle}
              onChangeText={setMultiGroupTitle}
              placeholder="Enter announcement title"
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Content</Text>
            <TextInput
              style={styles.contentInput}
              value={multiGroupContent}
              onChangeText={setMultiGroupContent}
              placeholder="Enter announcement details..."
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />

            <Text style={styles.inputLabel}>Post To</Text>
            <Text style={styles.helperText}>
              Select which of your groups should receive this announcement.
            </Text>

            {/* Current group — always selected and non-removable */}
            <TouchableOpacity
              style={[styles.groupCheckRow, styles.groupCheckRowSelected]}
              disabled={true}>
              <View style={[styles.groupCheckbox, styles.groupCheckboxActive]}>
                <Icon name="check" size={14} color="#FFFFFF" />
              </View>
              <View style={styles.groupCheckInfo}>
                <Text style={styles.groupCheckName}>
                  {group?.name ?? 'Current Group'}
                </Text>
                <Text style={styles.groupCheckCurrent}>Current group</Text>
              </View>
            </TouchableOpacity>

            {otherAdminGroups.map(g => {
              if (!g) return null;
              const isSelected = selectedGroupIds.includes(g.id!);
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.groupCheckRow,
                    isSelected && styles.groupCheckRowSelected,
                  ]}
                  onPress={() => toggleGroupSelection(g.id!)}>
                  <View
                    style={[
                      styles.groupCheckbox,
                      isSelected && styles.groupCheckboxActive,
                    ]}>
                    {isSelected && (
                      <Icon name="check" size={14} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.groupCheckName}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!multiGroupTitle.trim() ||
                  !multiGroupContent.trim() ||
                  multiGroupSubmitting) &&
                  styles.submitButtonDisabled,
              ]}
              onPress={handleMultiGroupSubmit}
              disabled={
                !multiGroupTitle.trim() ||
                !multiGroupContent.trim() ||
                multiGroupSubmitting
              }>
              {multiGroupSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  Post to {selectedGroupIds.length} Group
                  {selectedGroupIds.length !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView
      style={styles.container}
      testID={`group-announcements-screen-${groupId}`}>
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#2196F3"
            testID="announcements-loader"
          />
        </View>
      ) : error ? (
        <Text style={styles.errorText} testID="announcements-error-text">
          Error: {error}
        </Text>
      ) : (
        <View style={styles.announcementsContainer}>
          {isAdmin && !isSubscriptionActive && (
            <TouchableOpacity
              style={styles.subscriptionExpiredBanner}
              onPress={() =>
                navigation.navigate('SubscriptionUpgrade', {groupId, groupName})
              }
              testID="announcements-subscription-expired-banner">
              <Icon name="alert-circle-outline" size={16} color="#fff" />
              <Text style={styles.subscriptionExpiredText}>
                Subscription expired — tap to renew
              </Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={announcements}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.announcementsList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={loadAnnouncements}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text
                  style={styles.emptyText}
                  testID="announcements-empty-list">
                  No announcements yet
                </Text>
              </View>
            }
            testID="group-announcements-list"
          />

          {isAdmin && (
            <View style={styles.createButtonContainer}>
              <FeatureTooltip
                featureId="announcements_create"
                title="Premium Feature: Announcements"
                description="Send push notifications to all members instantly. Included in your subscription!">
                <TouchableOpacity
                  style={styles.createButtonCentered}
                  onPress={handleCreatePress}
                  testID="group-announcements-create-button">
                  <Text style={styles.createButtonText}>
                    Create Announcement
                  </Text>
                </TouchableOpacity>
              </FeatureTooltip>

              {canPostToMultipleGroups && (
                <TouchableOpacity
                  style={styles.multiGroupButton}
                  onPress={() => {
                    if (!isSubscriptionActive) {
                      navigation.navigate('SubscriptionUpgrade', {
                        groupId,
                        groupName,
                      });
                      return;
                    }
                    setSelectedGroupIds([groupId]);
                    setMultiGroupModalVisible(true);
                  }}
                  testID="group-announcements-multi-group-button">
                  <Icon name="account-group" size={16} color="#2196F3" />
                  <Text style={styles.multiGroupButtonText}>
                    Post to multiple groups
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Ask Admin to Upgrade — shown to non-admin members */}
          {!isAdmin && (
            <View style={styles.createButtonContainer}>
              <TouchableOpacity
                style={styles.askAdminButton}
                onPress={() => setAskAdminModalVisible(true)}
                testID="announcements-ask-admin-upgrade-button">
                <Icon name="star-circle-outline" size={16} color="#FFA000" />
                <Text style={styles.askAdminButtonText}>
                  Ask admin to enable announcements
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {renderModal()}

      {/* Ask Admin to Upgrade Modal */}
      <AskAdminUpgradeModal
        visible={askAdminModalVisible}
        onClose={() => setAskAdminModalVisible(false)}
        groupId={groupId}
        adminName={firstAdminDisplayName}
        featureName="Announcements"
      />
      {renderMultiGroupModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  announcementsContainer: {
    flex: 1,
  },
  askAdminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  askAdminButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5D4037',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementsList: {
    padding: 16,
  },
  announcementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pinnedCard: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  pinnedBadge: {
    marginRight: 6,
  },
  pinnedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },
  announcementTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  announcementContent: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 12,
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
  readCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readCountText: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9E9E9E',
    marginBottom: 16,
  },
  createButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
  },
  createButtonCentered: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '75%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#757575',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  contentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 160,
  },
  pinnedCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  checkmark: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#424242',
  },
  helperText: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 24,
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 4,
  },
  errorText: {
    color: '#F44336',
    textAlign: 'center',
    marginTop: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  toggleLabel: {
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
  },
  scheduleCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  schedulerContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  dateButtonLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  dateButtonValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  scheduledBadge: {
    backgroundColor: '#FFF3CD',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  scheduledBadgeText: {
    fontSize: 11,
    color: '#856404',
  },
  multiGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    width: '75%',
    alignSelf: 'center',
  },
  multiGroupButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  // Group selection rows in multi-group modal
  groupCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  groupCheckRowSelected: {
    backgroundColor: '#F0F7FF',
    borderRadius: 6,
  },
  groupCheckbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupCheckboxActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  groupCheckInfo: {
    flex: 1,
  },
  groupCheckName: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
  },
  groupCheckCurrent: {
    fontSize: 12,
    color: '#757575',
    marginTop: 1,
  },
  subscriptionExpiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  subscriptionExpiredText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
});

export default GroupAnnouncementsScreen;
