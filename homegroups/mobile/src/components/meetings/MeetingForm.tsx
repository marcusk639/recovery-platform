import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {Meeting} from '../../types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationPicker from '../groups/LocationPicker';
import DayPicker from '../groups/DayPicker';
import TimePicker from '../groups/TimePicker';

interface MeetingFormProps {
  initialMeeting?: Meeting;
  onSubmit: (meeting: Partial<Meeting>) => void;
  onCancel: () => void;
  errors?: {
    day?: string;
    time?: string;
    location?: string;
    address?: string;
    link?: string;
  };
  containerStyle?: StyleProp<ViewStyle>;
}

const MeetingForm: React.FC<MeetingFormProps> = ({
  initialMeeting,
  onSubmit,
  onCancel,
  errors,
  containerStyle = {},
}) => {
  const [meeting, setMeeting] = useState<Partial<Meeting>>(
    initialMeeting
      ? {
          ...initialMeeting,
          id: initialMeeting.id,
        }
      : {
          name: '',
          day: '',
          time: '',
          format: 'Open Discussion',
          online: false,
          location: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          link: '',
          type: 'AA',
        },
  );

  const handleSubmit = () => {
    if (!meeting.day) {
      Alert.alert('Error', 'Meeting day is required');
      return;
    }
    if (!meeting.time) {
      Alert.alert('Error', 'Meeting time is required');
      return;
    }
    if (meeting.online) {
      if (!meeting.link) {
        Alert.alert('Error', 'Meeting link is required for online meetings');
        return;
      }
    } else {
      if (!meeting.location) {
        Alert.alert('Error', 'Location name is required');
        return;
      }
      if (!meeting.address) {
        Alert.alert('Error', 'Address is required');
        return;
      }
    }
    onSubmit(meeting);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Meeting Name</Text>
          <TextInput
            style={styles.input}
            value={meeting.name}
            onChangeText={text => setMeeting(prev => ({...prev, name: text}))}
            placeholder="Enter meeting name"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Day</Text>
          <DayPicker
            selectedDay={meeting.day || ''}
            onSelectDay={day => setMeeting(prev => ({...prev, day}))}
          />
          {errors?.day && <Text style={styles.errorText}>{errors.day}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Time</Text>
          <TimePicker
            selectedTime={meeting.time || ''}
            onSelectTime={time => setMeeting(prev => ({...prev, time}))}
          />
          {errors?.time && <Text style={styles.errorText}>{errors.time}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Format</Text>
          <TextInput
            style={styles.input}
            value={meeting.format}
            onChangeText={text => setMeeting(prev => ({...prev, format: text}))}
            placeholder="Enter meeting format"
          />
        </View>

        <View style={styles.onlineToggle}>
          <Text style={styles.label}>Online Meeting</Text>
          <Switch
            value={meeting.online}
            onValueChange={value =>
              setMeeting(prev => ({...prev, online: value}))
            }
            trackColor={{false: '#E0E0E0', true: '#90CAF9'}}
            thumbColor={meeting.online ? '#2196F3' : '#FFFFFF'}
          />
        </View>

        {meeting.online ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Online Meeting Link</Text>
            <TextInput
              style={styles.input}
              value={meeting.link || ''}
              onChangeText={text => setMeeting(prev => ({...prev, link: text}))}
              placeholder="Enter online meeting link"
            />
            {errors?.link && (
              <Text style={styles.errorText}>{errors.link}</Text>
            )}
          </View>
        ) : (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Location Name</Text>
              <TextInput
                style={styles.input}
                value={meeting.location}
                onChangeText={text =>
                  setMeeting(prev => ({...prev, location: text}))
                }
                placeholder="Enter location name"
              />
              {errors?.location && (
                <Text style={styles.errorText}>{errors.location}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address</Text>
              <LocationPicker
                label="Address"
                initialAddress={meeting.address}
                initialLocation={
                  meeting.lat && meeting.lng
                    ? {
                        latitude: meeting.lat,
                        longitude: meeting.lng,
                      }
                    : undefined
                }
                onLocationSelect={location => {
                  setMeeting(prev => ({
                    ...prev,
                    address: location.address || '',
                    city: location.city || '',
                    state: location.state || '',
                    zip: location.zip || '',
                    lat: location.latitude,
                    lng: location.longitude,
                    location:
                      location.placeName || prev.location || location.address,
                  }));
                }}
              />
              {errors?.address && (
                <Text style={styles.errorText}>{errors.address}</Text>
              )}
            </View>
          </>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>
              {initialMeeting ? 'Update' : 'Add'} Meeting
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  onlineToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingBottom: 50,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
  },
  submitButton: {
    backgroundColor: '#2196F3',
  },
  cancelButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MeetingForm;
