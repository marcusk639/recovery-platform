import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Linking,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchBusinessMeetingById,
  selectBusinessMeetingById,
  selectAgendaItems,
  selectBusinessMeetingsStatus,
  updateMeetingStatus,
  updateAttendees,
  updateMinutes,
  deleteBusinessMeeting,
} from '../../store/slices/businessMeetingsSlice';
import {selectGroupById} from '../../store/slices/groupsSlice';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import {BusinessMeeting, AgendaItem} from '../../types/domain/business-meeting';

type BusinessMeetingDetailScreenRouteProp = RouteProp<
  GroupStackParamList,
  'BusinessMeetingDetail'
>;
type BusinessMeetingDetailScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const BusinessMeetingDetailScreen: React.FC = () => {
  const route = useRoute<BusinessMeetingDetailScreenRouteProp>();
  const navigation = useNavigation<BusinessMeetingDetailScreenNavigationProp>();
  const {groupId, groupName, meetingId} = route.params;

  const dispatch = useAppDispatch();

  // Get data from Redux store
  const meeting = useAppSelector(state =>
    selectBusinessMeetingById(state, meetingId),
  );
  const agendaItems = useAppSelector(state =>
    selectAgendaItems(state, meetingId),
  );
  const status = useAppSelector(selectBusinessMeetingsStatus);
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );

  const loading = status === 'loading';
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['agenda', 'attendance']),
  );
  const [minutesModalVisible, setMinutesModalVisible] = useState(false);
  const [editedMinutes, setEditedMinutes] = useState('');
  const [savingMinutes, setSavingMinutes] = useState(false);

  useEffect(() => {
    loadMeeting();
    checkAdminStatus();
  }, [meetingId]);

  const checkAdminStatus = () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    const isUserAdmin = group?.admins?.includes(currentUser.uid) || false;
    setIsAdmin(isUserAdmin);
  };

  const loadMeeting = useCallback(() => {
    setRefreshing(true);
    dispatch(fetchBusinessMeetingById(meetingId))
      .unwrap()
      .catch(err => {
        if (err && err.name !== 'ConditionError') {
          Alert.alert(
            'Error',
            'Failed to load business meeting. Please try again later.',
          );
        }
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [dispatch, meetingId]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getStatusColor = (status: BusinessMeeting['status']) => {
    switch (status) {
      case 'scheduled':
        return '#2196F3';
      case 'in_progress':
        return '#FF9800';
      case 'completed':
        return '#4CAF50';
      case 'cancelled':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: BusinessMeeting['status']) => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const getMemberName = (userId: string): string => {
    const member = members.find(m => m.userId === userId || m.id === userId);
    return member?.name || 'Unknown';
  };

  const handleStatusChange = async (newStatus: BusinessMeeting['status']) => {
    try {
      await dispatch(
        updateMeetingStatus({meetingId, status: newStatus}),
      ).unwrap();
      Alert.alert(
        'Success',
        `Meeting status updated to ${getStatusLabel(newStatus)}`,
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to update meeting status');
    }
  };

  const handleToggleAttendee = async (userId: string) => {
    if (!meeting) return;

    const currentAttendees = meeting.attendees || [];
    const newAttendees = currentAttendees.includes(userId)
      ? currentAttendees.filter(id => id !== userId)
      : [...currentAttendees, userId];

    try {
      await dispatch(
        updateAttendees({meetingId, attendees: newAttendees}),
      ).unwrap();
    } catch (err) {
      Alert.alert('Error', 'Failed to update attendance');
    }
  };

  const handleSaveMinutes = async () => {
    setSavingMinutes(true);
    try {
      await dispatch(
        updateMinutes({meetingId, minutes: editedMinutes}),
      ).unwrap();
      setMinutesModalVisible(false);
      Alert.alert('Success', 'Minutes saved successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to save minutes');
    } finally {
      setSavingMinutes(false);
    }
  };

  const handleEdit = () => {
    navigation.navigate('CreateEditBusinessMeeting', {
      groupId,
      groupName,
      meetingId,
    });
  };

  const handleManageAgenda = () => {
    navigation.navigate('ManageAgenda', {
      groupId,
      groupName,
      meetingId,
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Meeting',
      'Are you sure you want to delete this business meeting? This action cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(
                deleteBusinessMeeting({groupId, meetingId}),
              ).unwrap();
              navigation.goBack();
              Alert.alert('Success', 'Business meeting deleted');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete meeting');
            }
          },
        },
      ],
    );
  };

  const getAgendaTypeLabel = (type: AgendaItem['type']) => {
    switch (type) {
      case 'old_business':
        return 'Old Business';
      case 'new_business':
        return 'New Business';
      case 'report':
        return 'Report';
      case 'election':
        return 'Election';
      default:
        return 'Other';
    }
  };

  const getAgendaStatusIcon = (status: AgendaItem['status']) => {
    switch (status) {
      case 'completed':
        return 'check-circle';
      case 'in_progress':
        return 'progress-clock';
      case 'tabled':
        return 'table-arrow-right';
      default:
        return 'circle-outline';
    }
  };

  if (!meeting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const renderSection = (
    title: string,
    sectionKey: string,
    content: React.ReactNode,
  ) => (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection(sectionKey)}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Icon
          name={
            expandedSections.has(sectionKey) ? 'chevron-up' : 'chevron-down'
          }
          size={24}
          color="#757575"
        />
      </TouchableOpacity>
      {expandedSections.has(sectionKey) && (
        <View style={styles.sectionContent}>{content}</View>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadMeeting} />
      }
      testID={`business-meeting-detail-screen-${meetingId}`}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View
            style={[
              styles.statusBadge,
              {backgroundColor: getStatusColor(meeting.status)},
            ]}>
            <Text style={styles.statusText}>
              {getStatusLabel(meeting.status)}
            </Text>
          </View>
          {isAdmin && (
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleEdit}>
                <Icon name="pencil" size={20} color="#2196F3" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleDelete}>
                <Icon name="delete" size={20} color="#F44336" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.dateTimeContainer}>
          <Icon name="calendar" size={24} color="#2196F3" />
          <Text style={styles.dateText}>{formatDate(meeting.date)}</Text>
        </View>

        <View style={styles.timeContainer}>
          <Icon name="clock-outline" size={20} color="#757575" />
          <Text style={styles.timeText}>
            {formatTime(meeting.startTime)}
            {meeting.endTime && ` - ${formatTime(meeting.endTime)}`}
          </Text>
        </View>

        <View style={styles.locationContainer}>
          <Icon
            name={meeting.isOnline ? 'video' : 'map-marker'}
            size={20}
            color="#757575"
          />
          <Text style={styles.locationText}>
            {meeting.isOnline ? 'Online Meeting' : meeting.location}
          </Text>
          {meeting.isOnline && meeting.onlineLink && (
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => Linking.openURL(meeting.onlineLink!)}>
              <Text style={styles.joinButtonText}>Join</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Roles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Meeting Roles</Text>
        <View style={styles.rolesContainer}>
          <View style={styles.roleItem}>
            <Icon name="account-tie" size={24} color="#2196F3" />
            <View style={styles.roleInfo}>
              <Text style={styles.roleLabel}>Chair</Text>
              <Text style={styles.roleName}>
                {getMemberName(meeting.chair)}
              </Text>
            </View>
          </View>
          <View style={styles.roleItem}>
            <Icon name="pencil-box" size={24} color="#4CAF50" />
            <View style={styles.roleInfo}>
              <Text style={styles.roleLabel}>Secretary</Text>
              <Text style={styles.roleName}>
                {getMemberName(meeting.secretary)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Agenda Section */}
      {renderSection(
        `Agenda (${agendaItems.length})`,
        'agenda',
        <View>
          {agendaItems.length > 0 ? (
            agendaItems.map((item, index) => (
              <View key={item.id} style={styles.agendaItem}>
                <View style={styles.agendaItemHeader}>
                  <Icon
                    name={getAgendaStatusIcon(item.status)}
                    size={20}
                    color={item.status === 'completed' ? '#4CAF50' : '#757575'}
                  />
                  <Text style={styles.agendaItemOrder}>{index + 1}.</Text>
                  <Text style={styles.agendaItemTitle}>{item.title}</Text>
                </View>
                <View style={styles.agendaItemMeta}>
                  <View style={styles.agendaTypeBadge}>
                    <Text style={styles.agendaTypeText}>
                      {getAgendaTypeLabel(item.type)}
                    </Text>
                  </View>
                  {item.timeAllotted && (
                    <Text style={styles.agendaTime}>
                      {item.timeAllotted} min
                    </Text>
                  )}
                </View>
                {item.description && (
                  <Text style={styles.agendaDescription}>
                    {item.description}
                  </Text>
                )}
                {item.notes && (
                  <View style={styles.agendaNotes}>
                    <Text style={styles.agendaNotesLabel}>Notes:</Text>
                    <Text style={styles.agendaNotesText}>{item.notes}</Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No agenda items yet</Text>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={handleManageAgenda}>
              <Icon name="playlist-edit" size={20} color="#2196F3" />
              <Text style={styles.manageButtonText}>Manage Agenda</Text>
            </TouchableOpacity>
          )}
        </View>,
      )}

      {/* Attendance Section */}
      {renderSection(
        `Attendance (${meeting.attendees?.length || 0})`,
        'attendance',
        <View>
          {members.map(member => {
            const isAttending = meeting.attendees?.includes(
              member.userId || member.id,
            );
            return (
              <TouchableOpacity
                key={member.id}
                style={styles.attendeeItem}
                onPress={() =>
                  isAdmin && handleToggleAttendee(member.userId || member.id)
                }
                disabled={!isAdmin}>
                <Icon
                  name={
                    isAttending ? 'checkbox-marked' : 'checkbox-blank-outline'
                  }
                  size={24}
                  color={isAttending ? '#4CAF50' : '#BDBDBD'}
                />
                <Text style={styles.attendeeName}>{member.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>,
      )}

      {/* Minutes Section */}
      {renderSection(
        'Minutes',
        'minutes',
        <View>
          {meeting.minutes ? (
            <Text style={styles.minutesText}>{meeting.minutes}</Text>
          ) : (
            <Text style={styles.emptyText}>No minutes recorded yet</Text>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => {
                setEditedMinutes(meeting.minutes || '');
                setMinutesModalVisible(true);
              }}>
              <Icon name="pencil" size={20} color="#2196F3" />
              <Text style={styles.manageButtonText}>
                {meeting.minutes ? 'Edit Minutes' : 'Add Minutes'}
              </Text>
            </TouchableOpacity>
          )}
          {/* V4.1: Structured meeting minutes */}
          <TouchableOpacity
            style={[styles.manageButton, {marginTop: 8, borderColor: '#7B1FA2'}]}
            onPress={() =>
              navigation.navigate('MeetingMinutes', {
                groupId,
                groupName,
                businessMeetingId: meetingId,
                meetingDate: meeting.date instanceof Date
                  ? meeting.date.getTime()
                  : new Date(meeting.date).getTime(),
              })
            }
            testID={`business-meeting-view-minutes-${meetingId}`}>
            <Icon name="notebook-outline" size={20} color="#7B1FA2" />
            <Text style={[styles.manageButtonText, {color: '#7B1FA2'}]}>
              Structured Minutes
            </Text>
          </TouchableOpacity>
        </View>,
      )}

      {/* Status Actions */}
      {isAdmin && meeting.status !== 'cancelled' && (
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Meeting Actions</Text>
          <View style={styles.actionButtons}>
            {meeting.status === 'scheduled' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.startButton]}
                onPress={() => handleStatusChange('in_progress')}>
                <Icon name="play" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Start Meeting</Text>
              </TouchableOpacity>
            )}
            {meeting.status === 'in_progress' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => handleStatusChange('completed')}>
                <Icon name="check" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Complete Meeting</Text>
              </TouchableOpacity>
            )}
            {meeting.status !== 'completed' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() =>
                  Alert.alert(
                    'Cancel Meeting',
                    'Are you sure you want to cancel this meeting?',
                    [
                      {text: 'No', style: 'cancel'},
                      {
                        text: 'Yes',
                        onPress: () => handleStatusChange('cancelled'),
                      },
                    ],
                  )
                }>
                <Icon name="cancel" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Cancel Meeting</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Minutes Modal */}
      <Modal
        visible={minutesModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMinutesModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meeting Minutes</Text>
              <TouchableOpacity
                onPress={() => setMinutesModalVisible(false)}
                style={styles.closeButton}>
                <Icon name="close" size={24} color="#757575" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.minutesInput}
              value={editedMinutes}
              onChangeText={setEditedMinutes}
              multiline
              placeholder="Enter meeting minutes..."
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveMinutes}
              disabled={savingMinutes}>
              {savingMinutes ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Minutes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 12,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 16,
    color: '#424242',
    marginLeft: 12,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 12,
    flex: 1,
  },
  joinButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  sectionContent: {
    paddingBottom: 16,
  },
  rolesContainer: {
    flexDirection: 'row',
    paddingBottom: 16,
  },
  roleItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleInfo: {
    marginLeft: 12,
  },
  roleLabel: {
    fontSize: 12,
    color: '#757575',
  },
  roleName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  agendaItem: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  agendaItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  agendaItemOrder: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginLeft: 8,
    marginRight: 4,
  },
  agendaItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },
  agendaItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  agendaTypeBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  agendaTypeText: {
    fontSize: 12,
    color: '#2196F3',
  },
  agendaTime: {
    fontSize: 12,
    color: '#757575',
  },
  agendaDescription: {
    fontSize: 13,
    color: '#616161',
    marginTop: 4,
  },
  agendaNotes: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 4,
  },
  agendaNotesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
    marginBottom: 4,
  },
  agendaNotesText: {
    fontSize: 13,
    color: '#616161',
  },
  attendeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  attendeeName: {
    fontSize: 14,
    color: '#212121',
    marginLeft: 12,
  },
  minutesText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
    marginLeft: 8,
  },
  actionsSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  actionButtons: {
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  startButton: {
    backgroundColor: '#FF9800',
  },
  completeButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
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
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  minutesInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 200,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 32,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default BusinessMeetingDetailScreen;
