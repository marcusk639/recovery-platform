import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchAnnouncementsForGroup,
  createAnnouncement,
  updateAnnouncement,
  selectAnnouncementsByGroupId,
  selectAnnouncementsStatus,
  selectAnnouncementsError,
} from '../../store/slices/announcementsSlice';
import {Announcement} from '../../screens/announcements/AnnouncementsScreen';
import UserModel from '../../models/UserModel';
import {
  selectMemberById,
  selectMemberByUserId,
} from '../../store/slices/membersSlice';

interface AnnouncementListProps {
  groupId: string;
  isAdmin: boolean;
  onAnnouncementPress: (announcement: Announcement) => void;
  announcements: Announcement[];
  setAnnouncements: React.Dispatch<React.SetStateAction<Announcement[]>>;
}

const AnnouncementList: React.FC<AnnouncementListProps> = ({
  groupId,
  isAdmin,
  onAnnouncementPress,
  announcements,
  setAnnouncements,
}) => {
  const dispatch = useAppDispatch();

  // Get data from Redux store
  const status = useAppSelector(selectAnnouncementsStatus);
  const error = useAppSelector(selectAnnouncementsError);

  const loading = status === 'loading';
  const refreshing = status === 'loading'; // Can use the same status for refresh

  const currentUser = UserModel.getCurrentAuthUser();

  // Local UI state for modal
  const [createModalVisible, setCreateModalVisible] = useState<boolean>(false);
  const member = useAppSelector(state =>
    selectMemberByUserId(state, currentUser?.uid!),
  );
  const [newTitle, setNewTitle] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false); // For the create button loading state

  // Load announcements using Redux
  useEffect(() => {
    loadAnnouncements();
  }, [groupId, dispatch]);

  const loadAnnouncements = () => {
    dispatch(fetchAnnouncementsForGroup({groupId, isAdmin}));
  };

  // Show error messages
  useEffect(() => {
    if (error && status === 'failed') {
      Alert.alert('Error', error);
      // Consider clearing the error after showing it
      // dispatch(clearAnnouncementsError());
    }
  }, [error, status]);

  const onRefresh = () => {
    loadAnnouncements(); // Re-fetch data on pull-to-refresh
  };

  const handleCreateAnnouncement = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    if (!newContent.trim()) {
      Alert.alert('Error', 'Please enter content');
      return;
    }

    try {
      setSubmitting(true);
      const currentUser = await UserModel.getCurrentAuthUser();
      await dispatch(
        createAnnouncement({
          groupId,
          title: newTitle,
          content: newContent,
          isPinned,
          userId: currentUser?.uid!,
          memberId: member?.id,
        }),
      ).unwrap();

      setCreateModalVisible(false);
      resetForm();
    } catch (err: any) {
      console.error('Error creating announcement:', err);
      Alert.alert(
        'Error',
        err.message || 'Could not create announcement. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (announcement: Announcement) => {
    try {
      await dispatch(
        updateAnnouncement({
          announcementId: announcement.id,
          isPinned: !announcement.isPinned,
        }),
      ).unwrap();
    } catch (err: any) {
      console.error('Error toggling pin:', err);
      Alert.alert(
        'Error',
        err.message || 'Could not update announcement. Please try again.',
      );
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewContent('');
    setIsPinned(false);
  };

  const formatDate = (dateInput: Date | string): string => {
    let date: Date | null = null;
    if (typeof dateInput === 'string') {
      try {
        date = new Date(dateInput);
      } catch (e) {
        return 'Invalid Date';
      }
    } else if (dateInput instanceof Date) {
      date = dateInput;
    }

    if (!date || isNaN(date.getTime())) {
      return 'Date N/A';
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderItem = ({item}: {item: Announcement}) => (
    <TouchableOpacity
      style={[
        styles.announcementContainer,
        item.isPinned && styles.pinnedAnnouncement,
      ]}
      onPress={() => onAnnouncementPress(item)}>
      <View style={styles.announcementHeader}>
        <Text style={styles.announcementTitle}>{item.title}</Text>
        <TouchableOpacity
          onPress={() => handleTogglePin(item)}
          style={styles.pinButton}>
          <Text style={[styles.pinText, item.isPinned && styles.pinTextActive]}>
            📌
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.announcementContent} numberOfLines={2}>
        {item.content}
      </Text>
      <View style={styles.announcementFooter}>
        <Text style={styles.announcementDate}>{formatDate(item.createdAt)}</Text>
        {isAdmin && (
          <Text style={styles.readCountText}>
            {item.readCount || 0} read
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderCreateAnnouncementModal = () => (
    <Modal
      visible={createModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setCreateModalVisible(false);
        resetForm();
      }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Announcement</Text>
            <TouchableOpacity
              onPress={() => {
                setCreateModalVisible(false);
                resetForm();
              }}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Enter announcement title"
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Content</Text>
            <TextInput
              style={styles.contentInput}
              value={newContent}
              onChangeText={setNewContent}
              placeholder="Enter announcement details..."
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              maxLength={2000}
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

            <Text style={styles.helperText}>
              Pinned announcements will appear at the top of the list.
            </Text>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreateAnnouncement}
              disabled={submitting || loading}>
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Post Announcement</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {status === 'loading' && announcements.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <>
          <FlatList
            data={announcements}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No announcements yet</Text>
              </View>
            }
          />

          {isAdmin && (
            <TouchableOpacity
              style={styles.createButtonBottom}
              onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.createButtonText}>
                Create New Announcement
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {renderCreateAnnouncementModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  announcementContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pinnedAnnouncement: {
    backgroundColor: '#FFF9C4', // Light yellow background for pinned items
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700', // Gold border for pinned items
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  announcementTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  pinButton: {
    padding: 8,
  },
  pinText: {
    fontSize: 16,
    opacity: 0.5,
  },
  pinTextActive: {
    opacity: 1,
  },
  announcementContent: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  announcementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announcementDate: {
    fontSize: 12,
    color: '#999',
  },
  readCountText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9E9E9E',
    marginBottom: 16,
  },
  createButtonBottom: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
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
    fontSize: 20,
    color: '#757575',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  contentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 160,
  },
  pinnedCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  checkmark: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#424242',
  },
  helperText: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 24,
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AnnouncementList;
