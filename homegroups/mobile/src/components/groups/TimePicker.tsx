import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as dateFns from 'date-fns';

interface TimePickerProps {
  selectedTime: string;
  onSelectTime: (time: string) => void;
}

// Helper function to standardize time format for comparison
const standardizeTime = (time: string): string => {
  try {
    // Parse the time string into a Date object
    // Assuming input is in military format (24-hour)
    const parsedDate = dateFns.parse(time, 'HH:mm', new Date());

    // Format the time consistently in 12-hour format with AM/PM
    return dateFns.format(parsedDate, 'h:mm a').toUpperCase();
  } catch (error) {
    // If parsing fails, return the original time trimmed and uppercase
    return time.trim().toUpperCase();
  }
};

const TimePicker: React.FC<TimePickerProps> = ({
  selectedTime,
  onSelectTime,
}) => {
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState(() => {
    // Initialize tempTime with the selected time if it exists
    if (selectedTime) {
      try {
        const parsedDate = dateFns.parse(selectedTime, 'h:mm a', new Date());
        // Validate the parsed date
        if (isNaN(parsedDate.getTime())) {
          return new Date();
        }
        return parsedDate;
      } catch (e) {
        return new Date();
      }
    }
    return new Date();
  });

  // Common time slots for meetings
  const commonTimes = [
    '6:30 AM',
    '7:00 AM',
    '12:00 PM',
    '5:30 PM',
    '7:00 PM',
    '8:00 PM',
    '8:30 PM',
  ];

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) {
      setTempTime(selectedDate);

      // Format time
      const hours = selectedDate.getHours();
      const minutes = selectedDate.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const formattedMinutes = minutes.toString().padStart(2, '0');
      const formattedTime = `${formattedHours}:${formattedMinutes} ${ampm}`;

      onSelectTime(formattedTime);
    }

    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
  };

  const handleCommonTimeSelect = (time: string) => {
    try {
      const parsedTime = dateFns.parse(time, 'h:mm a', new Date());
      setTempTime(parsedTime);
      onSelectTime(time);
    } catch (e) {
      onSelectTime(time);
    }
  };

  const formatDisplayTime = (time: string) => {
    try {
      const parsedTime = dateFns.parse(time, 'h:mm a', new Date());
      return dateFns.format(parsedTime, 'h:mm a');
    } catch (e) {
      return time;
    }
  };

  return (
    <View style={styles.container}>
      {/* Common time presets */}
      <View style={styles.commonTimesContainer}>
        {commonTimes.map(time => (
          <TouchableOpacity
            key={time}
            style={[
              styles.timeButton,
              standardizeTime(selectedTime) === standardizeTime(time) &&
                styles.selectedTimeButton,
            ]}
            onPress={() => handleCommonTimeSelect(time)}>
            <Text
              style={[
                styles.timeText,
                standardizeTime(selectedTime) === standardizeTime(time) &&
                  styles.selectedTimeText,
              ]}>
              {time}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom time picker */}
      <TouchableOpacity
        style={styles.customTimeButton}
        onPress={() => setShowTimePicker(true)}>
        <Text style={styles.customTimeText}>
          {selectedTime
            ? `Selected: ${formatDisplayTime(selectedTime)}`
            : 'Choose Custom Time'}
        </Text>
      </TouchableOpacity>

      {/* Time picker modal */}
      {showTimePicker &&
        (Platform.OS === 'ios' ? (
          <Modal
            visible={showTimePicker}
            transparent={true}
            animationType="fade">
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Time</Text>
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(false)}
                    style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <DateTimePicker
                  value={tempTime}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                />

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={tempTime}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  commonTimesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  timeButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  selectedTimeButton: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  timeText: {
    fontSize: 14,
    color: '#757575',
  },
  selectedTimeText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  customTimeButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  customTimeText: {
    fontSize: 14,
    color: '#2196F3',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '80%',
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
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
    fontSize: 18,
    color: '#757575',
  },
  iosTimePicker: {
    width: '100%',
  },
  confirmButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default TimePicker;
