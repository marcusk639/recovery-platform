import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  TextInput,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupModel} from '../../models/GroupModel';
import {UserModel} from '../../models/UserModel';

const AdminPanelScreen: React.FC = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [directAssignModalVisible, setDirectAssignModalVisible] =
    useState(false);
  const [groupId, setGroupId] = useState('');
  const [userIdToAssign, setUserIdToAssign] = useState('');
  const [processing, setProcessing] = useState(false);

  const navigation = useNavigation();

  // Check if the user is a super admin
  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const isSuperAdminUser = await UserModel.isSuperAdmin();
        setIsSuperAdmin(isSuperAdminUser);
        if (!isSuperAdminUser) {
          Alert.alert(
            'Access Denied',
            'You need super admin privileges to access this panel.',
          );
          navigation.goBack();
        }
      } catch (error) {
        console.error('Error checking super admin status:', error);
        setIsSuperAdmin(false);
      }
    };

    checkSuperAdmin();
  }, [navigation]);

  const handleDirectAssign = async () => {
    if (!groupId || !userIdToAssign) {
      Alert.alert('Error', 'Group ID and user ID are required.');
      return;
    }

    try {
      setProcessing(true);
      await GroupModel.assignAdmin(groupId, userIdToAssign);
      Alert.alert('Success', 'User assigned as admin successfully.');
      setGroupId('');
      setUserIdToAssign('');
      setDirectAssignModalVisible(false);
    } catch (error: any) {
      console.error('Error assigning admin:', error);
      Alert.alert('Error', error.message || 'Failed to assign admin.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="admin-panel-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Icon name="information-outline" size={48} color="#2196F3" />
          <Text style={styles.infoTitle}>Direct Admin Assignment</Text>
          <Text style={styles.infoText}>
            Use this tool to directly assign admin privileges to users for any
            group. This bypasses the normal admin request process.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.mainAssignButton}
          testID="admin-assign-button"
          onPress={() => setDirectAssignModalVisible(true)}>
          <Icon name="account-plus" size={24} color="#FFFFFF" />
          <Text style={styles.mainAssignButtonText}>Assign Admin</Text>
        </TouchableOpacity>
      </View>

      {/* Direct Assign Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={directAssignModalVisible}
        onRequestClose={() => setDirectAssignModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="admin-assign-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Directly Assign Admin</Text>
              <TouchableOpacity
                style={styles.closeButton}
                testID="admin-close-modal-button"
                onPress={() => setDirectAssignModalVisible(false)}>
                <Icon name="close" size={24} color="#757575" />
              </TouchableOpacity>
            </View>

            <>
              <Text style={styles.inputLabel}>Group ID:</Text>
              <TextInput
                style={styles.input}
                testID="admin-group-id-input"
                value={groupId}
                onChangeText={setGroupId}
                placeholder="Enter group ID"
                autoCapitalize="none"
              />
              <Text style={styles.inputLabel}>User ID:</Text>
              <TextInput
                style={styles.input}
                testID="admin-user-id-input"
                value={userIdToAssign}
                onChangeText={setUserIdToAssign}
                placeholder="Enter user ID (UID)"
                autoCapitalize="none"
              />
              <Text style={styles.helperText}>
                Enter the Firebase UID of the user and the group ID to assign
                admin privileges
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  testID="admin-cancel-button"
                  onPress={() => setDirectAssignModalVisible(false)}
                  disabled={processing}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.assignButton]}
                  testID="admin-confirm-button"
                  onPress={handleDirectAssign}
                  disabled={processing || !groupId || !userIdToAssign}>
                  {processing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.assignButtonText}>Assign</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#2196F3',
    padding: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 20,
  },
  mainAssignButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  mainAssignButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    width: '100%',
    maxWidth: 500,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#EEEEEE',
  },
  cancelButtonText: {
    color: '#616161',
    fontWeight: '500',
  },
  assignButton: {
    backgroundColor: '#4CAF50',
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    padding: 10,
    fontSize: 14,
    color: '#212121',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 20,
  },
});

export default AdminPanelScreen;
