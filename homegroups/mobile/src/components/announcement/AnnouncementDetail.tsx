import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Button,
} from 'react-native';

// Types
interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  authorName: string;
  expiresAt?: Date;
}

interface AnnouncementDetailProps {
  announcement: Announcement;
  isAdmin: boolean;
  isCreator: boolean;
  onDismiss: () => void;
  onUpdate?: (updatedAnnouncement: Announcement) => void;
  onDelete?: (announcementId: string) => void;
}

const AnnouncementDetail: React.FC<AnnouncementDetailProps> = ({
  announcement,
  isAdmin,
  isCreator,
  onDismiss,
  onUpdate,
  onDelete,
}) => {
  const [editMode, setEditMode] = useState<boolean>(false);
  const [title, setTitle] = useState<string>(announcement.title);
  const [content, setContent] = useState<string>(announcement.content);
  const [isPinned, setIsPinned] = useState<boolean>(announcement.isPinned);
  const [loading, setLoading] = useState<boolean>(false);

  const canEdit = isAdmin || isCreator;

  const handleUpdate = async () => {
    // Validate input
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    if (!content.trim()) {
      Alert.alert('Error', 'Please enter content');
      return;
    }

    try {
      setLoading(true);

      // In a real app, this would call the API to update the announcement
      // For now, we'll just simulate it
      const updatedAnnouncement: Announcement = {
        ...announcement,
        title,
        content,
        isPinned,
        updatedAt: new Date(),
      };

      // Call the update callback
      if (onUpdate) {
        onUpdate(updatedAnnouncement);
      }

      // Exit edit mode
      setEditMode(false);
    } catch (error) {
      console.error('Error updating announcement:', error);
      Alert.alert(
        'Error',
        'Could not update announcement. Please try again later.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this announcement? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // In a real app, this would call the API to delete the announcement
              // For now, we'll just simulate it
              if (onDelete) {
                onDelete(announcement.id);
              }

              // Dismiss the detail view
              onDismiss();
            } catch (error) {
              console.error('Error deleting announcement:', error);
              Alert.alert(
                'Error',
                'Could not delete announcement. Please try again later.',
              );
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onDismiss}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editMode ? 'Edit Announcement' : 'Announcement'}
            </Text>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {editMode ? (
              // Edit mode
              <>
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
                  maxLength={2000}
                />

                <TouchableOpacity
                  style={styles.pinnedCheckbox}
                  onPress={() => setIsPinned(!isPinned)}>
                  <View
                    style={[
                      styles.checkbox,
                      isPinned && styles.checkboxActive,
                    ]}>
                    {isPinned && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    Pin this announcement
                  </Text>
                </TouchableOpacity>

                <Text style={styles.helperText}>
                  Pinned announcements will appear at the top of the list. Only
                  3 announcements can be pinned at a time.
                </Text>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => {
                      // Reset form and exit edit mode
                      setTitle(announcement.title);
                      setContent(announcement.content);
                      setIsPinned(announcement.isPinned);
                      setEditMode(false);
                    }}
                    disabled={loading}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.saveButton]}
                    onPress={handleUpdate}
                    disabled={loading}>
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // View mode
              <>
                {announcement.isPinned && (
                  <View style={styles.pinnedBadge}>
                    <Text style={styles.pinnedText}>📌 Pinned</Text>
                  </View>
                )}

                <Text style={styles.announcementTitle}>
                  {announcement.title}
                </Text>

                <View style={styles.metaContainer}>
                  <Text style={styles.metaText}>
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

                <Text style={styles.announcementContent}>
                  {announcement.content}
                </Text>

                {canEdit && (
                  <View style={styles.actionContainer}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.editButton]}
                      onPress={() => setEditMode(true)}>
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={handleDelete}>
                      <View style={{width: '100%', alignItems: 'center'}}>
                        <Text style={styles.deleteButtonText}>Delete Ann</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: '80%',
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
  pinnedBadge: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  pinnedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },
  announcementTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  metaContainer: {
    marginBottom: 16,
  },
  metaText: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  updateText: {
    fontSize: 12,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },
  announcementContent: {
    fontSize: 16,
    color: '#424242',
    lineHeight: 24,
    marginBottom: 24,
  },
  actionContainer: {
    flexDirection: 'row',
    marginTop: 16,
    justifyContent: 'flex-start',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  editButton: {
    backgroundColor: '#E3F2FD',
  },
  editButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#FFEBEE',
  },
  deleteButtonText: {
    color: '#F44336',
    fontWeight: '600',
    textAlign: 'center',
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
    textAlignVertical: 'top',
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#757575',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    marginLeft: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default AnnouncementDetail;
