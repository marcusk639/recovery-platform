import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Alert,
  Modal,
  Platform,
  Linking,
  Share,
} from 'react-native';
import functions from '@react-native-firebase/functions';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import moment from 'moment';

// Import types and Redux
import {GroupStackParamList} from '../../types/navigation';
import {Meeting} from '../../types';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchGroupById,
  selectGroupById,
  selectGroupsStatus,
} from '../../store/slices/groupsSlice';
import {
  fetchGroupMeetings,
  selectGroupMeetings,
  selectMeetingsStatus,
  selectMeetingById,
  createMeeting,
  updateMeeting,
  fetchUpcomingMeetingInstances,
  selectAllMeetingInstances,
  selectGroupMeetingInstanceIds,
} from '../../store/slices/meetingsSlice';
import {MeetingInstance} from '../../types';
import MeetingModal from '../../components/meetings/MeetingModal';

type GroupScheduleScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupSchedule'
>;
type GroupScheduleScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'GroupSchedule'
>;

const GroupScheduleScreen: React.FC = () => {
  const route = useRoute<GroupScheduleScreenRouteProp>();
  const navigation = useNavigation<GroupScheduleScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  const daysOfWeek = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const dispatch = useAppDispatch();

  // Get data from Redux store
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const meetings = useAppSelector(state => selectGroupMeetings(state, groupId));
  const meetingsStatus = useAppSelector(selectMeetingsStatus);
  const groupsStatus = useAppSelector(selectGroupsStatus);
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
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()) || [];

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [meetingDetailsVisible, setMeetingDetailsVisible] = useState(false);
  const [errors, setErrors] = useState<{
    day?: string;
    time?: string;
    location?: string;
    address?: string;
    link?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCurrentUserAdmin = group?.admins?.includes(currentUser?.uid || '');

  // Export meeting guide handler
  const handleExportMeetingGuide = useCallback(async () => {
    try {
      Alert.alert(
        'Export for Meeting Guide',
        'Generating CSV and JSON for your intergroup or district...',
      );
      const result = await functions().httpsCallable(
        'exportMeetingGuideFormat',
      )({
        groupId,
      });
      const {csv, instructions} = result.data as {
        csv: string;
        json: string;
        instructions: string;
      };
      // Share CSV + instructions
      await Share.share({
        message: `${instructions}\n\n--- CSV ---\n${csv}`,
        title: `${groupName} - Meeting Guide Export`,
      });
    } catch (error: any) {
      console.error('Error exporting meeting guide:', error);
      Alert.alert(
        'Export Failed',
        error.message || 'Could not export meeting guide. Please try again.',
      );
    }
  }, [groupId, groupName]);

  // Set calendar + export header buttons
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
          {isCurrentUserAdmin && (
            <TouchableOpacity
              onPress={handleExportMeetingGuide}
              style={{marginRight: 8, padding: 4}}
              accessibilityLabel="Export for meeting guide"
              accessibilityHint="Export meeting schedule as CSV for intergroup or district">
              <Icon name="export" size={22} color="#2196F3" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('GroupCalendar', {groupId, groupName})
            }
            style={{marginRight: 16, padding: 4}}
            accessibilityLabel="View calendar"
            accessibilityHint="Open the meeting calendar view">
            <Icon name="calendar-month" size={22} color="#2196F3" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [
    navigation,
    groupId,
    groupName,
    isCurrentUserAdmin,
    handleExportMeetingGuide,
  ]);

  const loadScheduleData = useCallback(
    async (force = false) => {
      setIsLoading(true);
      setRefreshing(true);
      try {
        await dispatch(fetchGroupMeetings({groupId, force})).unwrap();
        await dispatch(fetchUpcomingMeetingInstances(groupId)).unwrap();
        await dispatch(fetchGroupById(groupId)).unwrap();
      } catch (error: any) {
        console.error('Error loading group schedule data:', error);
        if (error?.name !== 'ConditionError') {
          Alert.alert(
            'Error',
            'Failed to load schedule data. Please try again later.',
          );
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [groupId, dispatch],
  );

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  const handleAddMeeting = () => {
    setSelectedMeeting(null);
    setIsModalVisible(true);
  };

  const handleEditMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setIsModalVisible(true);
  };

  const handleSubmitMeeting = async (meetingData: Partial<Meeting>) => {
    setIsSubmitting(true);
    try {
      if (selectedMeeting?.id) {
        await dispatch(
          updateMeeting({meetingId: selectedMeeting.id, meetingData}),
        ).unwrap();
      } else {
        await dispatch(createMeeting({groupId, meetingData})).unwrap();
      }
      setIsModalVisible(false);
      setSelectedMeeting(null);
      loadScheduleData(true);
    } catch (error: any) {
      console.error('Error saving meeting:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to save meeting. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const showMeetingDetails = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setMeetingDetailsVisible(true);
  };

  const formatDayAndTime = (meeting: Meeting): string => {
    if (meeting.day) {
      let meetingDay = meeting.day;
      if (typeof meetingDay === 'number') {
        meetingDay = daysOfWeek[meetingDay - 1];
      }
      const day = meetingDay.charAt(0).toUpperCase() + meetingDay.slice(1);
      const formattedTime = formatMeetingTime(meeting.time);
      return `${day} at ${formattedTime}`;
    }
    return 'Schedule TBD';
  };

  const formatMeetingTime = (timeString?: string): string => {
    if (!timeString) {
      return 'Time TBD';
    }

    const formats = ['HH:mm:ss', 'HH:mm', 'hh:mm:ss A', 'hh:mm A'];

    for (const format of formats) {
      const momentTime = moment(timeString, format);
      if (momentTime.isValid()) {
        return momentTime.format('h:mm A');
      }
    }

    return 'Time TBD';
  };

  // Parse time string to minutes since midnight for sorting
  const parseTimeToMinutes = (timeString?: string): number => {
    if (!timeString) return 0;

    const formats = ['HH:mm:ss', 'HH:mm', 'hh:mm:ss A', 'hh:mm A'];
    for (const format of formats) {
      const momentTime = moment(timeString, format);
      if (momentTime.isValid()) {
        return momentTime.hours() * 60 + momentTime.minutes();
      }
    }
    return 0;
  };

  // Sort meetings by day of week (Sunday first) then by time
  const sortMeetings = (meetingsToSort: Meeting[]): Meeting[] => {
    const dayOrder: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    return [...meetingsToSort].sort((a, b) => {
      const aDayIndex = dayOrder[a.day?.toLowerCase() || ''] ?? 7;
      const bDayIndex = dayOrder[b.day?.toLowerCase() || ''] ?? 7;

      if (aDayIndex !== bDayIndex) {
        return aDayIndex - bDayIndex;
      }

      // Same day, sort by time
      const aTime = parseTimeToMinutes(a.time);
      const bTime = parseTimeToMinutes(b.time);
      return aTime - bTime;
    });
  };

  const formatAddress = (meeting: Meeting): string => {
    if (meeting.online) {
      return 'Online Meeting';
    }

    const streetLine = meeting.address || meeting.street || '';
    const cityStateZipLine = [meeting.city, meeting.state, meeting.zip]
      .filter(Boolean)
      .join(', ');

    if (!streetLine && !cityStateZipLine) {
      return 'Address not specified';
    }

    return `${streetLine}\n${cityStateZipLine}`;
  };

  const renderMeetingItem = ({item}: {item: Meeting}) => {
    const isOnline = item.online ?? false;
    const locationDisplay = isOnline
      ? 'Online Meeting'
      : item.locationName || item.address || 'Location TBD';
    // V3.5: Step study badge
    const isStepStudy = item.format === 'step_study';
    const stepBadgeNum = isStepStudy && (item as any).currentStep;

    return (
      <TouchableOpacity
        style={styles.meetingItemContainer}
        onPress={() => showMeetingDetails(item)}
        testID={`meeting-item-${item.id}`}>
        <View style={styles.dateTimeContainer}>
          <Text style={styles.dayText}>
            {item.day ? item.day.toUpperCase() : 'TBD'}
          </Text>
          <Text style={styles.timeText}>{formatMeetingTime(item.time)}</Text>
        </View>
        <View style={styles.detailsContainer}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
            <Text style={styles.meetingName}>{item.name}</Text>
            {stepBadgeNum ? (
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step {stepBadgeNum}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.locationText}>{locationDisplay}</Text>
        </View>
        {isCurrentUserAdmin && (
          <View style={styles.meetingRowActions}>
            <TouchableOpacity
              style={styles.qrButton}
              testID={`meeting-qr-button-${item.id}`}
              onPress={() =>
                navigation.navigate('MeetingQRCode', {
                  groupId,
                  meetingId: item.id ?? '',
                  meetingName: item.name,
                })
              }
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              accessibilityLabel="Show QR code"
              accessibilityHint="Double tap to show QR check-in code for this meeting">
              <Icon name="qrcode" size={20} color="#2196F3" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => handleEditMeeting(item)}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              accessibilityLabel="Edit meeting"
              accessibilityHint="Double tap to edit this meeting">
              <View style={styles.editButtonContent}>
                <Icon
                  name="pencil-outline"
                  size={20}
                  color={styles.editButtonText.color}
                />
                <Text style={styles.editButtonLabel}>Edit</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderInstanceItem = (instance: MeetingInstance) => {
    const isOnline = instance.isOnline ?? false;
    const locationDisplay = isOnline
      ? 'Online Meeting'
      : instance.locationName || instance.address || 'Location TBD';
    const hasOverrides =
      instance.overriddenFields &&
      Object.keys(instance.overriddenFields).length > 0;
    const formattedDate = moment(instance.scheduledAt).format('MMM D');
    const formattedTime = moment(instance.scheduledAt).format('h:mm A');

    return (
      <TouchableOpacity
        style={[
          styles.instanceItemContainer,
          instance.isCancelled && styles.cancelledItem,
        ]}
        onPress={() => {
          navigation.navigate('EditMeetingInstance', {
            groupId,
            groupName,
            instanceId: instance.instanceId,
          });
        }}
        testID={`instance-item-${instance.instanceId}`}>
        <View style={styles.dateTimeContainer}>
          <Text style={styles.dayText}>{formattedDate}</Text>
          <Text style={styles.timeText}>{formattedTime}</Text>
          {hasOverrides && (
            <Icon
              name="alert-circle"
              size={12}
              color="#FFA000"
              style={{marginTop: 4}}
            />
          )}
        </View>
        <View style={styles.detailsContainer}>
          <Text style={styles.meetingName}>{instance.name}</Text>
          <Text style={styles.locationText}>{locationDisplay}</Text>
          {instance.chairpersonName && (
            <Text style={styles.chairpersonText}>
              Chair: {instance.chairpersonName}
            </Text>
          )}
          {instance.isCancelled && (
            <View style={[styles.noticeContainer, styles.cancelledNotice]}>
              <Icon name="cancel" size={14} color="#D32F2F" />
              <Text style={[styles.noticeText, styles.cancelledNoticeText]}>
                Cancelled
              </Text>
            </View>
          )}
          {instance.instanceNotice && !instance.isCancelled && (
            <View style={styles.noticeContainer}>
              <Icon name="information" size={14} color="#FFA000" />
              <Text style={styles.noticeText}>{instance.instanceNotice}</Text>
            </View>
          )}
        </View>
        {isCurrentUserAdmin && (
          <View style={styles.adminActionsContainer}>
            <TouchableOpacity
              style={styles.adminActionButton}
              onPress={e => {
                e.stopPropagation();
                navigation.navigate('AssignChairperson', {
                  groupId,
                  groupName,
                  instanceId: instance.instanceId,
                  currentChairpersonId: instance.chairpersonId,
                  scheduledAt: instance.scheduledAt.getTime(),
                });
              }}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              accessibilityLabel="Assign chairperson"
              accessibilityHint="Double tap to assign a chairperson for this meeting">
              <Icon name="account-tie" size={18} color="#2196F3" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.adminActionButton}
              onPress={e => {
                e.stopPropagation();
                navigation.navigate('EditMeetingInstance', {
                  groupId,
                  groupName,
                  instanceId: instance.instanceId,
                });
              }}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              accessibilityLabel="Edit instance"
              accessibilityHint="Double tap to edit this meeting instance">
              <Icon name="pencil-outline" size={18} color="#757575" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderMeetingDetailsModal = () => (
    <Modal
      visible={meetingDetailsVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setMeetingDetailsVisible(false)}
      testID={`meeting-details-modal-${selectedMeeting?.id}`}>
      {selectedMeeting && (
        <View style={styles.modalOverlay}>
          <View
            style={styles.detailsModalContent}
            testID={`meeting-details-modal-${selectedMeeting.id}`}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meeting Details</Text>
              <TouchableOpacity
                onPress={() => setMeetingDetailsVisible(false)}
                style={styles.modalCloseButton}
                testID="meeting-details-close-button">
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'flex-start',
                width: '100%',
              }}
              style={styles.meetingDetailContent}>
              <Text style={styles.detailsName}>{selectedMeeting.name}</Text>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsLabel}>Time:</Text>
                <Text style={styles.detailsText}>
                  {formatDayAndTime(selectedMeeting)}
                </Text>
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsLabel}>Location:</Text>
                <Text style={styles.detailsText}>
                  {selectedMeeting.online
                    ? 'Online Meeting'
                    : selectedMeeting.location ||
                      selectedMeeting.name ||
                      'Location name not specified'}
                </Text>
                {!selectedMeeting.online && (
                  <Text style={styles.detailsSubtext}>
                    {formatAddress(selectedMeeting)}
                  </Text>
                )}
                {selectedMeeting.online && selectedMeeting.link && (
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => {
                      Linking.openURL(selectedMeeting.link || '#');
                    }}
                    testID="meeting-details-join-link-button">
                    <Text style={styles.linkButtonText}>Join Meeting</Text>
                  </TouchableOpacity>
                )}
                {selectedMeeting.online && selectedMeeting.onlineNotes && (
                  <Text style={styles.detailsNotes}>
                    {selectedMeeting.onlineNotes}
                  </Text>
                )}
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsLabel}>Type:</Text>
                <Text style={styles.detailsText}>{selectedMeeting.type}</Text>
              </View>

              {!selectedMeeting.online &&
                selectedMeeting.lat &&
                selectedMeeting.lng && (
                  <View style={styles.detailsSection}>
                    <TouchableOpacity
                      style={styles.directionsButton}
                      onPress={() => {
                        const scheme = Platform.select({
                          ios: 'maps:0,0?q=',
                          android: 'geo:0,0?q=',
                        });
                        const latLng = `${selectedMeeting.lat},${selectedMeeting.lng}`;
                        const label = selectedMeeting.name;
                        const url = Platform.select({
                          ios: `${scheme}${label}@${latLng}`,
                          android: `${scheme}${latLng}(${label})`,
                        });
                        if (url) Linking.openURL(url);
                      }}>
                      <Text style={styles.directionsButtonText}>
                        Get Directions
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );

  const renderContent = () => {
    if (isLoading && meetingsStatus === 'loading') {
      return (
        <ActivityIndicator
          size="large"
          color="#2196F3"
          style={{marginTop: 50}}
        />
      );
    }

    const sortedMeetings = sortMeetings(meetings);

    return (
      <>
        <View style={{paddingVertical: 5}} />
        {/* V2.2: Calendar view shortcut */}
        <TouchableOpacity
          style={styles.calendarButton}
          onPress={() =>
            navigation.navigate('GroupCalendar', {groupId, groupName})
          }
          testID="view-calendar-button">
          <Icon name="calendar-month" size={18} color="#2196F3" />
          <Text style={styles.calendarButtonText}>View Calendar</Text>
          <Icon name="chevron-right" size={18} color="#2196F3" />
        </TouchableOpacity>
        {sortedMeetings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Meeting Templates</Text>
            <FlatList
              data={sortedMeetings}
              renderItem={renderMeetingItem}
              keyExtractor={(item: Meeting) => item.id ?? `no-id-${item.name}`}
              scrollEnabled={false}
              contentContainerStyle={{paddingBottom: 10}}
            />
          </>
        )}
        {instances.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Meetings</Text>
            {instances.map(instance => (
              <View key={instance.instanceId}>
                {renderInstanceItem(instance)}
              </View>
            ))}
          </>
        )}
        {sortedMeetings.length === 0 && instances.length === 0 && (
          <View style={styles.emptyContainer}>
            <Icon
              name="calendar-clock"
              size={64}
              color="#BBDEFB"
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>No Meetings</Text>
            <Text style={styles.emptyText}>
              {isCurrentUserAdmin
                ? 'No meetings have been created yet. Press the button below to add meetings.'
                : 'No meetings have been set up yet. Check back later or contact a group admin.'}
            </Text>
          </View>
        )}
      </>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading && <LoadingOverlay message="Loading schedule..." />}
      {isSubmitting && <LoadingOverlay message="Saving meeting..." />}

      <ScrollView
        contentContainerStyle={{flexGrow: 1}}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadScheduleData}
          />
        }>
        {renderContent()}
      </ScrollView>

      {isCurrentUserAdmin && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddMeeting}
          activeOpacity={0.8}>
          <Icon name="plus" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Meeting</Text>
        </TouchableOpacity>
      )}

      <MeetingModal
        formContainerStyle={{backgroundColor: 'white'}}
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setSelectedMeeting(null);
          setErrors({});
        }}
        onSubmit={handleSubmitMeeting}
        initialMeeting={selectedMeeting || undefined}
        errors={errors}
      />

      {renderMeetingDetailsModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textAlign: 'center',
  },
  fallbackNotice: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#757575',
    paddingHorizontal: 16,
    paddingBottom: 12,
    textAlign: 'center',
  },
  meetingItemContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
  },
  cancelledItem: {
    backgroundColor: '#FFF0F0', // Lighter red for cancelled
    opacity: 0.7,
  },
  dateTimeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#EEEEEE',
    minWidth: 80, // Ensure consistent width
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 4,
  },
  timeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  cancelledText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginTop: 4,
  },
  detailsContainer: {
    flex: 1, // Take remaining space
  },
  meetingName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  // V3.5: Step study badge
  stepBadge: {
    backgroundColor: '#EDE7F6',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginLeft: 6,
    marginBottom: 4,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7B1FA2',
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  noticeText: {
    fontSize: 12,
    color: '#FFA000',
    flexShrink: 1,
  },
  cancelledNotice: {
    backgroundColor: '#FFEBEE',
  },
  cancelledNoticeText: {
    color: '#D32F2F',
  },
  meetingRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  qrButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 18,
  },
  editButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  editButtonText: {
    color: '#2196F3',
  },
  adminActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  adminActionButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 18,
  },
  editButtonLabel: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 16,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 16,
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  calendarButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#2196F3',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  instanceItemContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
  },
  chairpersonText: {
    fontSize: 13,
    color: '#2196F3',
    marginTop: 4,
    fontWeight: '500',
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  detailsModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingTop: 16,
    maxHeight: '85%',
  },
  meetingDetailContent: {
    paddingBottom: 16,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 20,
  },
  detailsSection: {
    marginBottom: 18,
  },
  detailsLabel: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
    fontWeight: '500',
  },
  detailsText: {
    fontSize: 16,
    color: '#212121',
    marginBottom: 4,
    lineHeight: 22,
  },
  detailsSubtext: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
  },
  detailsNotes: {
    fontSize: 14,
    color: '#616161',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 20,
  },
  linkButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  directionsButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  directionsButtonText: {
    color: '#1E88E5',
    fontWeight: '600',
    fontSize: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    flex: 1,
  },
  modalCloseButton: {
    padding: 8,
    marginLeft: 16,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#757575',
    lineHeight: 24,
  },
});

export default GroupScheduleScreen;
