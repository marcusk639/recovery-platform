import React, { useState } from 'react';
import { Alert, View, Modal, StyleSheet, TextInput } from 'react-native';
import { format } from 'date-fns';
import { dischargeGuest } from '../../services/guest';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { color, normalize, fontSize } from '../../styles/theme';
import { logException } from '../../util/logging';

interface Props {
  visible: boolean;
  guestId: string;
  guestName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DischargeGuestModal: React.FC<Props> = ({
  visible,
  guestId,
  guestName,
  onClose,
  onSuccess,
}) => {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const moveOutDate = format(new Date(), 'yyyy-MM-dd');

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await dischargeGuest(guestId, moveOutDate, notes || undefined);
      onSuccess();
    } catch (error) {
      logException(error);
      Alert.alert(
        'Discharge Failed',
        'Could not discharge resident. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <RatsText
            translate={false}
            text="Discharge Resident"
            style={styles.title}
          />
          <RatsText
            translate={false}
            text={`This will mark ${guestName} as discharged with a move-out date of ${format(
              new Date(),
              'MMMM d, yyyy',
            )}.`}
            style={styles.body}
          />
          <TextInput
            style={styles.input}
            placeholder="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <View style={styles.actions}>
            <RatsButton
              testID="cancel-discharge-button"
              title="Cancel"
              onPress={onClose}
              disabled={loading}
            />
            <RatsButton
              testID="confirm-discharge-button"
              title="Confirm Discharge"
              onPress={handleConfirm}
              disabled={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: color.white,
    borderRadius: normalize(8),
    padding: normalize(24),
    width: '85%',
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: 'bold',
    marginBottom: normalize(12),
    color: color.dark_grey,
  },
  body: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    marginBottom: normalize(16),
  },
  input: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: normalize(4),
    padding: normalize(8),
    marginBottom: normalize(16),
    minHeight: normalize(60),
    color: color.dark_grey,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default DischargeGuestModal;
