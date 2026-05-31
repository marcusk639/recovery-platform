import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import storage from '@react-native-firebase/storage';
import {ChatModel} from '../../models/ChatModel';
import {DirectMessageModel} from '../../models/DirectMessageModel';
import auth from '@react-native-firebase/auth';

type ChatMediaPickerRouteProp = RouteProp<
  GroupStackParamList,
  'ChatMediaPicker'
>;
type ChatMediaPickerNavigationProp = StackNavigationProp<GroupStackParamList>;

interface MediaOption {
  icon: string;
  label: string;
  action: () => void;
  color: string;
}

interface SelectedMedia {
  type: 'image' | 'file';
  uri: string;
  name?: string;
  fileType?: string;
}

/**
 * Shared media picker component for both group chat and direct messages
 * Includes preview and confirmation before sending
 */
const ChatMediaPickerScreen: React.FC = () => {
  const route = useRoute<ChatMediaPickerRouteProp>();
  const navigation = useNavigation<ChatMediaPickerNavigationProp>();
  const {context, groupId, threadId, otherUserName} = route.params;

  const [loading, setLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(
    null,
  );

  // Determine storage path based on context
  const getStoragePath = () => {
    if (context === 'group' && groupId) {
      return `chat_media/${groupId}`;
    } else if (context === 'dm' && threadId) {
      return `dm_media/${threadId}`;
    }
    throw new Error('Invalid media picker context');
  };

  // Handle navigation options
  React.useEffect(() => {
    const title =
      context === 'dm' && otherUserName
        ? `Send to ${otherUserName}`
        : 'Add to Chat';

    navigation.setOptions({
      title: selectedMedia ? 'Preview' : title,
      headerLeft: selectedMedia
        ? () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleCancelPreview}
              disabled={loading}>
              <Icon name="arrow-left" size={24} color="#757575" />
            </TouchableOpacity>
          )
        : undefined,
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleClose}
          disabled={loading}>
          <Icon name="close" size={24} color="#757575" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, loading, context, otherUserName, selectedMedia]);

  const handleClose = () => {
    navigation.goBack();
  };

  const handleCancelPreview = () => {
    setSelectedMedia(null);
  };

  const takePhoto = async () => {
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: false,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Something went wrong');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.uri) {
          // Show preview instead of immediately uploading
          setSelectedMedia({
            type: 'image',
            uri: asset.uri,
            name: asset.fileName || `photo_${Date.now()}.jpg`,
          });
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
        includeBase64: false,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Something went wrong');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.uri) {
          // Show preview instead of immediately uploading
          setSelectedMedia({
            type: 'image',
            uri: asset.uri,
            name: asset.fileName || `image_${Date.now()}.jpg`,
          });
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });

      // DocumentPicker returns an array in newer versions
      const file = Array.isArray(result) ? result[0] : result;

      if (file.uri) {
        // Show preview instead of immediately uploading
        setSelectedMedia({
          type: 'file',
          uri: file.fileCopyUri || file.uri,
          name: file.name || 'file',
          fileType: file.type || '',
        });
      }
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        // User cancelled the picker
        return;
      }
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to select document. Please try again.');
    }
  };

  const handleSendMedia = async () => {
    if (!selectedMedia) return;

    if (selectedMedia.type === 'image') {
      await uploadAndSendImage(selectedMedia.uri);
    } else {
      await uploadAndSendFile(
        selectedMedia.uri,
        selectedMedia.name || 'file',
        selectedMedia.fileType || '',
      );
    }
  };

  const uploadAndSendImage = async (uri: string) => {
    setLoading(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'You must be logged in to send images');
        setLoading(false);
        return;
      }

      // Generate a unique file name
      const fileName = `${currentUser.uid}_${Date.now()}.jpg`;
      const storagePath = getStoragePath();
      const reference = storage().ref(`${storagePath}/${fileName}`);

      // Upload the file
      await reference.putFile(uri);

      // Get the download URL
      const downloadURL = await reference.getDownloadURL();

      // Create attachment data
      const attachment = {
        type: 'image' as const,
        url: downloadURL,
        name: fileName,
      };

      // Send message with attachment based on context
      await sendMessageWithAttachment('📷 Image', [attachment]);

      // Navigate back to chat
      navigation.goBack();
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const uploadAndSendFile = async (
    uri: string,
    name: string,
    _type: string,
  ) => {
    setLoading(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'You must be logged in to send files');
        setLoading(false);
        return;
      }

      // Generate a unique file name while preserving the extension
      const extension = name.split('.').pop() || '';
      const fileName = `${currentUser.uid}_${Date.now()}.${extension}`;
      const storagePath = getStoragePath();
      const reference = storage().ref(`${storagePath}/${fileName}`);

      // Upload the file
      await reference.putFile(uri);

      // Get the download URL
      const downloadURL = await reference.getDownloadURL();

      // Create attachment data
      const attachment = {
        type: 'file' as const,
        url: downloadURL,
        name: name,
        size: 0, // We don't have file size info here
      };

      // Send message with attachment based on context
      await sendMessageWithAttachment(`📎 ${name}`, [attachment]);

      // Navigate back to chat
      navigation.goBack();
    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', 'Failed to upload file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sendMessageWithAttachment = async (
    text: string,
    attachments: any[],
  ) => {
    try {
      if (context === 'group' && groupId) {
        // Send via group chat
        await ChatModel.sendMessage(groupId, text, attachments, null, false);
      } else if (context === 'dm' && threadId) {
        // Send via direct message
        await DirectMessageModel.sendMessage(threadId, text, attachments);
      } else {
        throw new Error('Invalid context for sending message');
      }
    } catch (error) {
      console.error('Error sending message with attachment:', error);
      throw error;
    }
  };

  // Media options
  const mediaOptions: MediaOption[] = [
    {
      icon: 'camera',
      label: 'Take Photo',
      action: takePhoto,
      color: '#4CAF50',
    },
    {
      icon: 'image',
      label: 'Photo Library',
      action: pickImage,
      color: '#2196F3',
    },
    {
      icon: 'file-document',
      label: 'Document',
      action: pickDocument,
      color: '#FF9800',
    },
  ];

  // Render preview screen
  const renderPreview = () => {
    if (!selectedMedia) return null;

    return (
      <View style={styles.previewWrapper}>
        {selectedMedia.type === 'image' ? (
          <View style={styles.imagePreviewContainer}>
            <Image
              source={{uri: selectedMedia.uri}}
              style={styles.imagePreview}
              resizeMode="contain"
            />
          </View>
        ) : (
          <View style={styles.filePreviewContainer}>
            <Icon name="file-document-outline" size={80} color="#2196F3" />
            <Text style={styles.filePreviewName} numberOfLines={2}>
              {selectedMedia.name}
            </Text>
            <Text style={styles.filePreviewHint}>
              Tap Send to share this file
            </Text>
          </View>
        )}

        <View style={styles.previewActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelPreview}
            disabled={loading}>
            <Icon name="close" size={20} color="#757575" />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sendButton, loading && styles.sendButtonDisabled]}
            onPress={handleSendMedia}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Icon name="send" size={20} color="#FFFFFF" />
                <Text style={styles.sendButtonText}>Send</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        {selectedMedia ? (
          renderPreview()
        ) : (
          <ScrollView contentContainerStyle={styles.optionsContainer}>
            <Text style={styles.sectionTitle}>Share</Text>
            <View style={styles.optionsGrid}>
              {mediaOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.optionItem}
                  onPress={option.action}>
                  <View
                    style={[
                      styles.optionIcon,
                      {backgroundColor: option.color},
                    ]}>
                    <Icon name={option.icon} size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  optionsContainer: {
    padding: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  optionItem: {
    width: '33%',
    alignItems: 'center',
    marginBottom: 24,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 14,
    color: '#424242',
  },
  // Preview styles
  previewWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  imagePreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  filePreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 32,
  },
  filePreviewName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#212121',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  filePreviewHint: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    minWidth: 120,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#757575',
    marginLeft: 8,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: '#2196F3',
    minWidth: 120,
  },
  sendButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    marginLeft: 8,
  },
});

export default ChatMediaPickerScreen;
