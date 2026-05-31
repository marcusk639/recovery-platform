// src/components/common/DatePicker.tsx

import React, {useState} from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface DatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (date: Date | undefined) => void;
  initialDate?: Date;
  maxDate?: Date;
  minDate?: Date;
  title?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
  visible,
  onClose,
  onSelect,
  initialDate,
  maxDate,
  minDate,
  title = 'Select Date',
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialDate || new Date(),
  );

  const handleDateChange = (_: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);

      // On Android, the picker is dismissed automatically after selection
      if (Platform.OS === 'android') {
        onSelect(date);
      }
    } else {
      // If date is undefined (user canceled on Android)
      if (Platform.OS === 'android') {
        onClose();
      }
    }
  };

  const handleConfirm = () => {
    onSelect(selectedDate);
  };

  const handleCancel = () => {
    onClose();
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Display selected date more prominently for better UX */}
          <View style={styles.selectedDateContainer}>
            <Text style={styles.selectedDateText}>
              {formatDate(selectedDate)}
            </Text>
          </View>

          {/* DatePicker - Platform specific implementation */}
          {Platform.OS === 'ios' ? (
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="inline"
                onChange={handleDateChange}
                maximumDate={maxDate}
                minimumDate={minDate}
              />

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.confirmButton]}
                  onPress={handleConfirm}>
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Android DatePicker
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={maxDate}
              minimumDate={minDate}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '90%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  selectedDateContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  selectedDateText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#2196F3',
  },
  datePickerContainer: {
    // On iOS, we need to handle the layout and buttons ourselves
    alignItems: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    color: '#757575',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#2196F3',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default DatePicker;
