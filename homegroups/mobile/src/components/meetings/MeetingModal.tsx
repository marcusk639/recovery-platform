import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  ScrollView,
  Dimensions,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Meeting} from '../../types';
import MeetingForm from './MeetingForm';
import LoadingOverlay from '../common/LoadingOverlay';

const {height: SCREEN_HEIGHT} = Dimensions.get('window');

interface MeetingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (meetingData: any) => Promise<void>;
  initialMeeting?: Meeting;
  formContainerStyle?: StyleProp<ViewStyle>;
  errors?: {
    day?: string;
    time?: string;
    location?: string;
    address?: string;
    link?: string;
  };
}

const MeetingModal: React.FC<MeetingModalProps> = ({
  visible,
  onClose,
  onSubmit,
  initialMeeting,
  errors,
  formContainerStyle,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBackdropPress = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleSubmit = async (meetingData: any) => {
    setIsSubmitting(true);
    try {
      await onSubmit(meetingData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {initialMeeting ? 'Edit Meeting' : 'Add Meeting'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close" size={24} color="#757575" />
            </TouchableOpacity>
          </View>
          <View style={styles.formWrapper}>
            <ScrollView
              style={styles.formContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}>
              <MeetingForm
                initialMeeting={initialMeeting}
                onSubmit={handleSubmit}
                onCancel={onClose}
                errors={errors}
                containerStyle={formContainerStyle}
              />
            </ScrollView>
          </View>
          {isSubmitting && (
            <LoadingOverlay message="Saving meeting..." fullScreen={false} />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: SCREEN_HEIGHT * 0.8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: -2},
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
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
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  formWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  formContainer: {
    flex: 1,
    padding: 16,
  },
});

export default MeetingModal;
