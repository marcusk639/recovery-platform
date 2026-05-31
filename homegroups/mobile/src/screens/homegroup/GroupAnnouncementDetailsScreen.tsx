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
  SafeAreaView,
  Modal,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  selectAnnouncementById,
  selectAnnouncementsStatus,
  selectAnnouncementsError,
} from '../../store/slices/announcementsSlice';
import {Announcement} from '../../types';
import {Button} from '../../components/common/Button';
import {AnnouncementModel} from '../../models/AnnouncementModel';

type GroupAnnouncementDetailsScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupAnnouncementDetails'
>;
type GroupAnnouncementDetailsScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const GroupAnnouncementDetailsScreen: React.FC = () => {
  const route = useRoute<GroupAnnouncementDetailsScreenRouteProp>();
  const navigation =
    useNavigation<GroupAnnouncementDetailsScreenNavigationProp>();
  const {groupId, announcementId} = route.params;
  const dispatch = useAppDispatch();

  // Get announcement from Redux store
  const announcement = useAppSelector(state =>
    selectAnnouncementById(state, announcementId),
  );
  const status = useAppSelector(selectAnnouncementsStatus);
  const error = useAppSelector(selectAnnouncementsError);

  const loading = status === 'loading';

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  // Check if current user is admin or author
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthor, setIsAuthor] = useState(false);

  useEffect(() => {
    loadAnnouncementDetails();
  }, [groupId, announcementId]);

  useEffect(() => {
    // Initialize form values for editing when announcement is loaded
    if (announcement) {
      setTitle(announcement.title);
      setContent(announcement.content);
      setIsPinned(announcement.isPinned);

      // Check if current user is admin or author
      const currentUser = auth().currentUser;
      if (currentUser) {
        // Check if user is the author
        setIsAuthor(announcement.createdBy === currentUser.uid);

        // Check if user is an admin - this would need to be determined from the group data
        // For now, use a placeholder implementation
        checkIfUserIsAdmin(groupId, currentUser.uid);
      }
    }
  }, [announcement]);

  // Mark announcement as read when viewed
  useEffect(() => {
    if (!announcement) {
      return;
    }
    const currentUser = auth().currentUser;
    if (!currentUser) {
      return;
    }
    // Only mark as read if the user hasn't already read it (prevents double-incrementing readCount)
    if (announcement.readBy?.includes(currentUser.uid)) {
      return;
    }
    AnnouncementModel.markAsRead(announcement.id, currentUser.uid).catch(err => {
      // Non-fatal — read tracking should not interrupt the user experience
      console.warn('Failed to mark announcement as read:', err);
    });
  }, [announcement?.id]);

  // Show Redux errors
  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
    }
  }, [error]);

  const checkIfUserIsAdmin = async (groupId: string, userId: string) => {
    try {
      const groupDoc = await firestore()
        .collection('groups')
        .doc(groupId)
        .get();
      if (groupDoc.exists) {
        const groupData = groupDoc.data();
        setIsAdmin(groupData?.admins?.includes(userId) || false);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadAnnouncementDetails = () => {
    // Fetch announcement from Redux if not already in store
    if (!announcement) {
      dispatch(fetchAnnouncementById({groupId, announcementId}));
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Please provide both a title and content.');
      return;
    }

    dispatch(
      updateAnnouncement({
        announcementId,
        title,
        content,
        isPinned,
      }),
    )
      .unwrap()
      .then(() => {
        setEditMode(false);
        Alert.alert('Success', 'Announcement updated successfully.');
      })
      .catch(error => {
        Alert.alert(
          'Error',
          error || 'Failed to update announcement. Please try again.',
        );
      });
  };

  const handleDelete = async () => {
    dispatch(deleteAnnouncement({groupId, announcementId}))
      .unwrap()
      .then(() => {
        navigation.goBack();
        Alert.alert('Success', 'Announcement deleted successfully.');
      })
      .catch(error => {
        Alert.alert(
          'Error',
          error || 'Failed to delete announcement. Please try again.',
        );
        setDeleteConfirmVisible(false);
      });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!announcement) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Announcement not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        {editMode ? (
          // Edit mode
          <View style={styles.editContainer}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter announcement title"
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Content</Text>
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="Enter announcement details..."
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={styles.pinnedCheckbox}
              onPress={() => setIsPinned(!isPinned)}>
              <View
                style={[styles.checkbox, isPinned && styles.checkboxActive]}>
                {isPinned && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Pin this announcement</Text>
            </TouchableOpacity>

            <View style={styles.editButtonsContainer}>
              <TouchableOpacity
                style={[styles.editButton, styles.cancelButton]}
                onPress={() => {
                  // Reset to original values
                  setTitle(announcement.title);
                  setContent(announcement.content);
                  setIsPinned(announcement.isPinned);
                  setEditMode(false);
                }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editButton, styles.saveButton]}
                onPress={handleSave}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // View mode
          <>
            <View style={styles.announcementHeader}>
              {announcement.isPinned && (
                <View style={styles.pinnedBadge}>
                  <Text style={styles.pinnedText}>📌 Pinned</Text>
                </View>
              )}
              <Text style={styles.announcementTitle}>{announcement.title}</Text>
              <View style={styles.metaContainer}>
                <Text style={styles.announcementMeta}>
                  Posted by {announcement.authorName} on{' '}
                  {formatDate(announcement.createdAt)}
                </Text>
                {announcement.updatedAt.getTime() !==
                  announcement.createdAt.getTime() && (
                  <Text style={styles.updateText}>
                    (Updated: {formatDate(announcement.updatedAt)})
                  </Text>
                )}
              </View>
            </View>

            <Text style={styles.announcementContent}>
              {announcement.content}
            </Text>

            {(isAdmin || isAuthor) && (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() => setEditMode(true)}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => setDeleteConfirmVisible(true)}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>Delete Announcement</Text>
            <Text style={styles.confirmText}>
              Are you sure you want to delete this announcement? This action
              cannot be undone.
            </Text>
            <View style={styles.confirmButtonsContainer}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelConfirmButton]}
                onPress={() => setDeleteConfirmVisible(false)}
                disabled={loading}>
                <Text style={styles.cancelConfirmText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteConfirmButton]}
                onPress={handleDelete}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#F44336',
    marginBottom: 16,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  announcementHeader: {
    marginBottom: 16,
  },
  pinnedBadge: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  pinnedText: {
    fontSize: 12,
    color: '#FFA726',
    fontWeight: '600',
  },
  // Edit mode styles
  editContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333333',
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#F9F9F9',
  },
  contentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#F9F9F9',
    minHeight: 150,
  },
  pinnedCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#2196F3',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#2196F3',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333333',
  },
  editButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  editButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  saveButton: {
    backgroundColor: '#2196F3',
  },
  cancelButtonText: {
    color: '#757575',
    fontWeight: '600',
    fontSize: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  // View mode styles
  announcementTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 8,
  },
  metaContainer: {
    marginBottom: 16,
  },
  announcementMeta: {
    fontSize: 14,
    color: '#757575',
  },
  updateText: {
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
  },
  announcementContent: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333333',
    marginBottom: 24,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 16,
  },
  confirmText: {
    fontSize: 16,
    color: '#333333',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  confirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelConfirmButton: {
    backgroundColor: '#F5F5F5',
  },
  deleteConfirmButton: {
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmText: {
    color: '#757575',
    fontWeight: '600',
  },
  deleteConfirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default GroupAnnouncementDetailsScreen;
