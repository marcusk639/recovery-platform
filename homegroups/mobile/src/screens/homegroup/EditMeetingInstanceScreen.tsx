import React, {useState, useEffect, useLayoutEffect, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectMeetingInstanceById,
  updateMeetingInstance,
  fetchUpcomingMeetingInstances,
} from '../../store/slices/meetingsSlice';
import {MeetingInstance} from '../../types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';

/** Returns true if `now` is within [scheduledAt - 30min, scheduledAt + 30min]. */
function isWithinCheckInWindow(scheduledAt: Date): boolean {
  const nowMs = Date.now();
  const scheduledMs = scheduledAt.getTime();
  const windowMs = 30 * 60 * 1000;
  return nowMs >= scheduledMs - windowMs && nowMs <= scheduledMs + windowMs;
}

type ScreenRouteProp = RouteProp<GroupStackParamList, 'EditMeetingInstance'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'EditMeetingInstance'
>;

const EditMeetingInstanceScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const {groupId, groupName, instanceId} = route.params;
  const dispatch = useAppDispatch();

  const instance = useAppSelector(state =>
    selectMeetingInstanceById(state, instanceId),
  );

  const [scheduledAt, setScheduledAt] = useState<Date>(
    instance?.scheduledAt || new Date(),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState(instance?.location || '');
  const [address, setAddress] = useState(instance?.address || '');
  const [city, setCity] = useState(instance?.city || '');
  const [state, setState] = useState(instance?.state || '');
  const [zip, setZip] = useState(instance?.zip || '');
  const [locationName, setLocationName] = useState(
    instance?.locationName || '',
  );
  const [isOnline, setIsOnline] = useState(instance?.isOnline || false);
  const [link, setLink] = useState(instance?.link || '');
  const [onlineNotes, setOnlineNotes] = useState(instance?.onlineNotes || '');
  const [isCancelled, setIsCancelled] = useState(
    instance?.isCancelled || false,
  );
  const [instanceNotice, setInstanceNotice] = useState(
    instance?.instanceNotice || '',
  );
  const [isPublic, setIsPublic] = useState(instance?.isPublic ?? false);
  // V3.5: Step study — step being studied (only relevant when format === 'step_study')
  const [currentStep, setCurrentStep] = useState<string>(
    String((instance as any)?.currentStep ?? ''),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const currentUser = auth().currentUser;

  // Determine check-in window based on scheduled time
  const inCheckInWindow = useMemo(
    () =>
      instance && !instance.isCancelled
        ? isWithinCheckInWindow(instance.scheduledAt)
        : false,
    // Re-evaluate when instance changes; this is a derived value at render time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instance?.scheduledAt, instance?.isCancelled],
  );

  // Determine if current user already checked in
  useEffect(() => {
    if (instance && currentUser && instance.attendees?.includes(currentUser.uid)) {
      setCheckedIn(true);
    }
  }, [instance, currentUser]);

  const handleCheckIn = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be signed in to check in.');
      return;
    }
    setIsCheckingIn(true);
    try {
      const functions = require('@react-native-firebase/functions').default;
      const result = await functions().httpsCallable('checkInToMeeting')({
        instanceId,
      });
      const data = result.data as {
        success: boolean;
        attendeeCount: number;
        alreadyCheckedIn: boolean;
      };
      if (data.alreadyCheckedIn) {
        Alert.alert('Already Checked In', 'You have already checked in to this meeting.');
      } else {
        setCheckedIn(true);
        Alert.alert(
          'Checked In!',
          `You're checked in. ${data.attendeeCount} member(s) attending.`,
        );
      }
    } catch (error: any) {
      console.error('Check-in error:', error);
      Alert.alert('Check-In Failed', error.message || 'Unable to check in. Please try again.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Fetch instance if not in store
  useEffect(() => {
    if (!instance) {
      dispatch(fetchUpcomingMeetingInstances(groupId));
    }
  }, [dispatch, groupId, instance]);

  // Update form when instance loads
  useEffect(() => {
    if (instance) {
      setScheduledAt(instance.scheduledAt || new Date());
      setLocation(instance.location || '');
      setAddress(instance.address || '');
      setCity(instance.city || '');
      setState(instance.state || '');
      setZip(instance.zip || '');
      setLocationName(instance.locationName || '');
      setIsOnline(instance.isOnline || false);
      setLink(instance.link || '');
      setOnlineNotes(instance.onlineNotes || '');
      setIsCancelled(instance.isCancelled || false);
      setInstanceNotice(instance.instanceNotice || '');
      setIsPublic(instance.isPublic ?? false);
      setCurrentStep(String((instance as any).currentStep ?? ''));
    }
  }, [instance]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: instance?.name || 'Edit Meeting Instance',
    });
  }, [navigation, instance]);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const newDate = new Date(scheduledAt);
      newDate.setFullYear(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );
      setScheduledAt(newDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const newDate = new Date(scheduledAt);
      newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setScheduledAt(newDate);
    }
  };

  const handleSave = async () => {
    if (!instance) {
      Alert.alert('Error', 'Meeting instance not found.');
      return;
    }

    setIsSaving(true);
    try {
      await dispatch(
        updateMeetingInstance({
          instanceId,
          updates: {
            scheduledAt,
            location: location || undefined,
            address: address || undefined,
            city: city || undefined,
            state: state || undefined,
            zip: zip || undefined,
            locationName: locationName || undefined,
            isOnline,
            link: link || null,
            onlineNotes: onlineNotes || null,
            isCancelled,
            instanceNotice: instanceNotice || null,
            isPublic,
          },
        }),
      ).unwrap();

      // V3.5: If this is a step-study meeting, persist currentStep to the meeting template
      if (instance.format === 'step_study' && instance.meetingId) {
        const stepNum = parseInt(currentStep, 10);
        if (!isNaN(stepNum) && stepNum >= 1 && stepNum <= 12) {
          await firestore()
            .collection('meetings')
            .doc(instance.meetingId)
            .set({currentStep: stepNum}, {merge: true});
        }
      }

      Alert.alert('Success', 'Meeting instance updated successfully.');
      navigation.goBack();
    } catch (error: any) {
      console.error('Error updating instance:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to update meeting instance.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!instance) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading meeting instance...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Date & Time</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowDatePicker(true)}>
            <Icon name="calendar" size={20} color="#2196F3" />
            <Text style={styles.dateTimeText}>
              {moment(scheduledAt).format('MMM D, YYYY')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowTimePicker(true)}>
            <Icon name="clock-outline" size={20} color="#2196F3" />
            <Text style={styles.dateTimeText}>
              {moment(scheduledAt).format('h:mm A')}
            </Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={scheduledAt}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={scheduledAt}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
          />
        )}

        <Text style={styles.sectionTitle}>Location</Text>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Online Meeting</Text>
          <Switch value={isOnline} onValueChange={setIsOnline} />
        </View>

        {isOnline ? (
          <>
            <Text style={styles.label}>Meeting Link</Text>
            <TextInput
              style={styles.input}
              value={link}
              onChangeText={setLink}
              placeholder="https://..."
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.label}>Online Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={onlineNotes}
              onChangeText={setOnlineNotes}
              placeholder="Additional information for online meeting"
              multiline
              numberOfLines={3}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>Location Name</Text>
            <TextInput
              style={styles.input}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="Building name, room number, etc."
            />
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address"
            />
            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                />
              </View>
              <View style={styles.halfWidth}>
                <Text style={styles.label}>State</Text>
                <TextInput
                  style={styles.input}
                  value={state}
                  onChangeText={setState}
                  placeholder="State"
                  maxLength={2}
                  autoCapitalize="characters"
                />
              </View>
            </View>
            <Text style={styles.label}>ZIP Code</Text>
            <TextInput
              style={styles.input}
              value={zip}
              onChangeText={setZip}
              placeholder="ZIP"
              keyboardType="numeric"
              maxLength={10}
            />
          </>
        )}

        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Cancel This Meeting</Text>
          <Switch value={isCancelled} onValueChange={setIsCancelled} />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.label}>Make This Meeting Public</Text>
            <Text style={styles.switchSubLabel}>
              Visible to users outside your group
            </Text>
          </View>
          <Switch value={isPublic} onValueChange={setIsPublic} />
        </View>

        <Text style={styles.label}>Special Notice</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={instanceNotice}
          onChangeText={setInstanceNotice}
          placeholder="Any special notes for this meeting instance"
          multiline
          numberOfLines={3}
        />

        {/* V3.5: Step being studied — only for step study meetings */}
        {instance.format === 'step_study' && (
          <>
            <Text style={styles.sectionTitle}>Step Study</Text>
            <Text style={styles.label}>Step being studied (1–12)</Text>
            <TextInput
              style={styles.input}
              value={currentStep}
              onChangeText={text => {
                // Only allow digits 1-12
                const num = parseInt(text, 10);
                if (text === '' || (!isNaN(num) && num >= 1 && num <= 12)) {
                  setCurrentStep(text);
                }
              }}
              placeholder="Enter step number (1-12)"
              keyboardType="number-pad"
              maxLength={2}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        {/* V2.2: Check-in button — visible during meeting window */}
        {inCheckInWindow && (
          <TouchableOpacity
            style={[
              styles.checkInButton,
              (checkedIn || isCheckingIn) && styles.checkInButtonDisabled,
            ]}
            onPress={handleCheckIn}
            disabled={checkedIn || isCheckingIn}
            testID="check-in-button">
            {isCheckingIn ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Icon
                  name={checkedIn ? 'check-circle' : 'hand-wave'}
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.checkInButtonText}>
                  {checkedIn ? 'Checked In!' : "I'm Here"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {inCheckInWindow && (
          <Text style={styles.attendeeCountText}>
            {instance.attendeeCount
              ? `${instance.attendeeCount} member(s) checked in`
              : 'Be the first to check in!'}
          </Text>
        )}
      </ScrollView>
    </View>
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dateTimeText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#212121',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#212121',
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  halfWidth: {
    flex: 1,
    marginHorizontal: 4,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 8,
  },
  switchSubLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  checkInButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  checkInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  attendeeCountText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#616161',
    marginTop: 8,
    marginBottom: 16,
  },
});

export default EditMeetingInstanceScreen;
