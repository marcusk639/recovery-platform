import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationPicker from '../LocationPicker';
import {LocationPickerResult} from './types';

export interface LocationPickerModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when a location is selected */
  onLocationSelect: (location: LocationPickerResult) => void;
  /** Modal title */
  title?: string;
  /** Label for the location picker */
  label?: string;
  /** Initial address to display */
  initialAddress?: string;
  /** Text for the done/confirm button */
  doneButtonText?: string;
  /** Callback when done button is pressed (if different from onClose) */
  onDone?: () => void;
}

/**
 * Reusable modal component wrapping the LocationPicker
 */
const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  visible,
  onClose,
  onLocationSelect,
  title = 'Search by Location',
  label = 'Find groups near...',
  initialAddress,
  doneButtonText = 'Done',
  onDone,
}) => {
  const handleDone = () => {
    if (onDone) {
      onDone();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            testID="location-picker-modal-close">
            <Icon name="close" size={24} color="#2196F3" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <LocationPicker
            onLocationSelect={onLocationSelect}
            label={label}
            initialAddress={initialAddress}
          />

          <TouchableOpacity
            style={styles.doneButton}
            onPress={handleDone}
            testID="location-picker-modal-done">
            <Text style={styles.doneButtonText}>{doneButtonText}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  doneButton: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    alignItems: 'center',
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default LocationPickerModal;
