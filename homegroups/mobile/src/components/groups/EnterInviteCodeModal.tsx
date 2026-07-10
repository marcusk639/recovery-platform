import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupStackParamList} from '../../types/navigation';

interface EnterInviteCodeModalProps {
  visible: boolean;
  onClose: () => void;
}

const EnterInviteCodeModal: React.FC<EnterInviteCodeModalProps> = ({
  visible,
  onClose,
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<StackNavigationProp<GroupStackParamList>>();
  const currentUser = auth().currentUser;

  const handleSubmit = async () => {
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedCode) {
      Alert.alert('Error', 'Please enter an invite code.');
      return;
    }

    if (trimmedCode.length !== 6) {
      Alert.alert('Error', 'Invite codes are 6 characters long.');
      return;
    }

    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to join a group.');
      return;
    }

    setLoading(true);
    try {
      const joinGroupFunction = functions().httpsCallable(
        'joinGroupByInviteCode',
      );
      const result = await joinGroupFunction({code: trimmedCode});
      const {success, groupId, groupName, message} = result.data as {
        success: boolean;
        groupId: string;
        groupName?: string;
        message: string;
      };

      if (success && groupId) {
        setCode('');
        onClose();
        Alert.alert('Success!', `You've joined ${groupName || 'the group'}!`, [
          {
            text: 'View Group',
            onPress: () => {
              navigation.navigate('GroupOverview', {
                groupId,
                groupName: groupName || 'Group',
              });
            },
          },
        ]);
      } else {
        Alert.alert('Unable to Join', message || 'Could not join the group.');
      }
    } catch (error: any) {
      console.error('Error joining group by invite code:', error);
      const errorMessage =
        error.message || 'Failed to join group. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCode('');
    onClose();
  };

  const formatCode = (text: string) => {
    // Remove non-alphanumeric characters and uppercase
    return text
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Enter Invite Code</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#757575" />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter the 6-character invite code you received to join a group.
          </Text>

          <TextInput
            style={styles.codeInput}
            placeholder="ABC123"
            placeholderTextColor="#BDBDBD"
            value={code}
            onChangeText={text => setCode(formatCode(text))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            keyboardType="default"
            editable={!loading}
            autoFocus={true}
            testID="invite-code-input"
          />

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={loading}
              testID="invite-code-cancel-button">
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.joinButton,
                (!code.trim() || code.length !== 6) && styles.disabledButton,
              ]}
              onPress={handleSubmit}
              disabled={loading || !code.trim() || code.length !== 6}
              testID="invite-code-submit-button">
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="account-group" size={20} color="#FFFFFF" />
                  <Text style={styles.joinButtonText}>Join Group</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.helpSection}>
            <Icon name="information-outline" size={16} color="#757575" />
            <Text style={styles.helpText}>
              Don't have a code? Ask a member of the group to send you an
              invite.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 15,
    color: '#616161',
    marginBottom: 20,
    lineHeight: 22,
  },
  codeInput: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 24,
    backgroundColor: '#FAFAFA',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#616161',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    gap: 8,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#BDBDBD',
  },
  helpSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    gap: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
  },
});

export default EnterInviteCodeModal;
