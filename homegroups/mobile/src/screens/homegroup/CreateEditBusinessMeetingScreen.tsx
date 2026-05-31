import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  createBusinessMeeting,
  updateBusinessMeeting,
  selectBusinessMeetingById,
} from '../../store/slices/businessMeetingsSlice';
import {
  selectMembersByGroupId,
  fetchGroupMembers,
} from '../../store/slices/membersSlice';
import {GroupMember} from '../../types';

type CreateEditBusinessMeetingScreenRouteProp = RouteProp<
  GroupStackParamList,
  'CreateEditBusinessMeeting'
>;
type CreateEditBusinessMeetingScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const CreateEditBusinessMeetingScreen: React.FC = () => {
  const route = useRoute<CreateEditBusinessMeetingScreenRouteProp>();
  const navigation =
    useNavigation<CreateEditBusinessMeetingScreenNavigationProp>();
  const {groupId, groupName, meetingId} = route.params;
  const isEditing = !!meetingId;

  const dispatch = useAppDispatch();

  // Get existing meeting if editing
  const existingMeeting = useAppSelector(state =>
    meetingId ? selectBusinessMeetingById(state, meetingId) : undefined,
  );
  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );

  // Form state
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [onlineLink, setOnlineLink] = useState('');
  const [chair, setChair] = useState('');
  const [secretary, setSecretary] = useState('');

  // UI state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState<
    'chair' | 'secretary' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Load members if not already loaded
    dispatch(fetchGroupMembers(groupId));
  }, [groupId]);

  useEffect(() => {
    // Populate form if editing
    if (existingMeeting) {
      setDate(existingMeeting.date);
      setStartTime(existingMeeting.startTime);
      setEndTime(existingMeeting.endTime || '');
      setLocation(existingMeeting.location);
      setIsOnline(existingMeeting.isOnline);
      setOnlineLink(existingMeeting.onlineLink || '');
      setChair(existingMeeting.chair);
      setSecretary(existingMeeting.secretary);
    }
  }, [existingMeeting]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Business Meeting' : 'New Business Meeting',
    });
  }, [isEditing]);

  const formatDate = (d: Date): string => {
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string): string => {
    if (!time) return 'Not set';
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getMemberName = (userId: string): string => {
    const member = members.find(m => m.userId === userId || m.id === userId);
    return member?.name || 'Select...';
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleTimeChange = (
    event: any,
    selectedDate: Date | undefined,
    type: 'start' | 'end',
  ) => {
    if (type === 'start') {
      setShowStartTimePicker(Platform.OS === 'ios');
    } else {
      setShowEndTimePicker(Platform.OS === 'ios');
    }

    if (selectedDate) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      if (type === 'start') {
        setStartTime(timeString);
      } else {
        setEndTime(timeString);
      }
    }
  };

  const handleSelectMember = (member: GroupMember) => {
    const userId = member.userId || member.id;
    if (showMemberPicker === 'chair') {
      setChair(userId);
    } else if (showMemberPicker === 'secretary') {
      setSecretary(userId);
    }
    setShowMemberPicker(null);
  };

  const validateForm = (): boolean => {
    if (!chair) {
      Alert.alert('Validation Error', 'Please select a Chair for the meeting.');
      return false;
    }
    if (!secretary) {
      Alert.alert(
        'Validation Error',
        'Please select a Secretary for the meeting.',
      );
      return false;
    }
    if (!isOnline && !location.trim()) {
      Alert.alert(
        'Validation Error',
        'Please enter a location for the meeting.',
      );
      return false;
    }
    if (isOnline && !onlineLink.trim()) {
      Alert.alert('Validation Error', 'Please enter an online meeting link.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (isEditing && meetingId) {
        await dispatch(
          updateBusinessMeeting({
            meetingId,
            updates: {
              date,
              startTime,
              endTime: endTime || undefined,
              location: isOnline ? 'Online' : location,
              isOnline,
              onlineLink: isOnline ? onlineLink : undefined,
              chair,
              secretary,
            },
          }),
        ).unwrap();
        Alert.alert('Success', 'Business meeting updated successfully.');
      } else {
        await dispatch(
          createBusinessMeeting({
            groupId,
            date,
            startTime,
            endTime: endTime || undefined,
            location: isOnline ? 'Online' : location,
            isOnline,
            onlineLink: isOnline ? onlineLink : undefined,
            chair,
            secretary,
          }),
        ).unwrap();
        Alert.alert('Success', 'Business meeting created successfully.');
      }
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Failed to save business meeting. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getTimeFromString = (timeStr: string): Date => {
    const d = new Date();
    if (timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      d.setHours(hours, minutes, 0, 0);
    }
    return d;
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Date Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Date & Time</Text>

        <TouchableOpacity
          style={styles.inputRow}
          onPress={() => setShowDatePicker(true)}>
          <Icon name="calendar" size={24} color="#2196F3" />
          <View style={styles.inputContent}>
            <Text style={styles.inputLabel}>Date</Text>
            <Text style={styles.inputValue}>{formatDate(date)}</Text>
          </View>
          <Icon name="chevron-right" size={24} color="#BDBDBD" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.inputRow}
          onPress={() => setShowStartTimePicker(true)}>
          <Icon name="clock-outline" size={24} color="#2196F3" />
          <View style={styles.inputContent}>
            <Text style={styles.inputLabel}>Start Time</Text>
            <Text style={styles.inputValue}>{formatTime(startTime)}</Text>
          </View>
          <Icon name="chevron-right" size={24} color="#BDBDBD" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.inputRow}
          onPress={() => setShowEndTimePicker(true)}>
          <Icon name="clock-check-outline" size={24} color="#757575" />
          <View style={styles.inputContent}>
            <Text style={styles.inputLabel}>End Time (Optional)</Text>
            <Text style={styles.inputValue}>
              {endTime ? formatTime(endTime) : 'Not set'}
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color="#BDBDBD" />
        </TouchableOpacity>
      </View>

      {/* Location Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>

        <View style={styles.switchRow}>
          <Icon
            name="video"
            size={24}
            color={isOnline ? '#2196F3' : '#757575'}
          />
          <Text style={styles.switchLabel}>Online Meeting</Text>
          <Switch
            value={isOnline}
            onValueChange={setIsOnline}
            trackColor={{false: '#E0E0E0', true: '#BBDEFB'}}
            thumbColor={isOnline ? '#2196F3' : '#FAFAFA'}
          />
        </View>

        {isOnline ? (
          <View style={styles.textInputContainer}>
            <Icon name="link" size={24} color="#757575" />
            <TextInput
              style={styles.textInput}
              value={onlineLink}
              onChangeText={setOnlineLink}
              placeholder="Enter meeting link (Zoom, Google Meet, etc.)"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        ) : (
          <View style={styles.textInputContainer}>
            <Icon name="map-marker" size={24} color="#757575" />
            <TextInput
              style={styles.textInput}
              value={location}
              onChangeText={setLocation}
              placeholder="Enter meeting location"
            />
          </View>
        )}
      </View>

      {/* Roles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Meeting Roles</Text>

        <TouchableOpacity
          style={styles.inputRow}
          onPress={() => setShowMemberPicker('chair')}>
          <Icon name="account-tie" size={24} color="#2196F3" />
          <View style={styles.inputContent}>
            <Text style={styles.inputLabel}>Chair *</Text>
            <Text style={[styles.inputValue, !chair && styles.placeholder]}>
              {getMemberName(chair)}
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color="#BDBDBD" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.inputRow}
          onPress={() => setShowMemberPicker('secretary')}>
          <Icon name="pencil-box" size={24} color="#4CAF50" />
          <View style={styles.inputContent}>
            <Text style={styles.inputLabel}>Secretary *</Text>
            <Text style={[styles.inputValue, !secretary && styles.placeholder]}>
              {getMemberName(secretary)}
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color="#BDBDBD" />
        </TouchableOpacity>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>
            {isEditing ? 'Save Changes' : 'Create Meeting'}
          </Text>
        )}
      </TouchableOpacity>

      <View style={{height: 32}} />

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Start Time Picker */}
      {showStartTimePicker && (
        <DateTimePicker
          value={getTimeFromString(startTime)}
          mode="time"
          display="default"
          onChange={(e, d) => handleTimeChange(e, d, 'start')}
        />
      )}

      {/* End Time Picker */}
      {showEndTimePicker && (
        <DateTimePicker
          value={getTimeFromString(endTime || startTime)}
          mode="time"
          display="default"
          onChange={(e, d) => handleTimeChange(e, d, 'end')}
        />
      )}

      {/* Member Picker Modal */}
      <Modal
        visible={showMemberPicker !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMemberPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select {showMemberPicker === 'chair' ? 'Chair' : 'Secretary'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowMemberPicker(null)}
                style={styles.closeButton}>
                <Icon name="close" size={24} color="#757575" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={members}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.memberItem}
                  onPress={() => handleSelectMember(item)}>
                  <Icon name="account" size={24} color="#757575" />
                  <Text style={styles.memberName}>{item.name}</Text>
                  {(item.userId === chair || item.id === chair) &&
                    showMemberPicker === 'chair' && (
                      <Icon name="check" size={24} color="#4CAF50" />
                    )}
                  {(item.userId === secretary || item.id === secretary) &&
                    showMemberPicker === 'secretary' && (
                      <Icon name="check" size={24} color="#4CAF50" />
                    )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No members found</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  inputContent: {
    flex: 1,
    marginLeft: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 2,
  },
  inputValue: {
    fontSize: 16,
    color: '#212121',
  },
  placeholder: {
    color: '#9E9E9E',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 16,
  },
  textInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 16,
    paddingVertical: 8,
  },
  submitButton: {
    backgroundColor: '#2196F3',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
    maxHeight: '70%',
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
    fontWeight: '600',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    padding: 32,
  },
});

export default CreateEditBusinessMeetingScreen;
