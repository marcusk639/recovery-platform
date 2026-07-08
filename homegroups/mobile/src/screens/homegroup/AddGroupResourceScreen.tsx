// mobile/src/screens/homegroup/AddGroupResourceScreen.tsx
import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  uploadGroupResource,
  addGroupResourceLink,
  selectIsUploading,
  selectUploadProgress,
} from '../../store/slices/groupResourcesSlice';
import {GroupResourceDocument} from '../../types/schema';
import DocumentPicker from 'react-native-document-picker';
import Icon from 'react-native-vector-icons/Ionicons';

type AddGroupResourceRouteProp = RouteProp<GroupStackParamList, 'AddGroupResource'>;

type TabType = 'upload' | 'link';
type ResourceType = GroupResourceDocument['type'];

const TYPE_OPTIONS: {label: string; value: ResourceType}[] = [
  {label: 'PDF', value: 'pdf'},
  {label: 'Document', value: 'document'},
  {label: 'Image', value: 'image'},
  {label: 'Link', value: 'link'},
  {label: 'Other', value: 'other'},
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const AddGroupResourceScreen: React.FC = () => {
  const route = useRoute<AddGroupResourceRouteProp>();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const {groupId, groupName} = route.params;

  const isUploading = useAppSelector(selectIsUploading);
  const uploadProgress = useAppSelector(selectUploadProgress);

  const [activeTab, setActiveTab] = useState<TabType>('upload');

  // Upload tab state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadType, setUploadType] = useState<ResourceType>('pdf');
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    type?: string;
  } | null>(null);

  // Link tab state
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState<ResourceType>('link');

  const [saving, setSaving] = useState(false);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });

      if (!result.uri) {
        Alert.alert('Error', 'Could not read the selected file.');
        return;
      }

      const fileSize = result.size || 0;
      if (fileSize > MAX_FILE_SIZE) {
        Alert.alert('File Too Large', 'Maximum file size is 10 MB.');
        return;
      }

      setSelectedFile({
        uri: result.fileCopyUri || result.uri,
        name: result.name || 'file',
        size: result.size || undefined,
        type: result.type || undefined,
      });

      // Auto-detect type from extension
      const ext = (result.name || '').split('.').pop()?.toLowerCase();
      if (ext === 'pdf') setUploadType('pdf');
      else if (['doc', 'docx', 'txt', 'rtf'].includes(ext || ''))
        setUploadType('document');
      else if (['jpg', 'jpeg', 'png', 'gif', 'heic'].includes(ext || ''))
        setUploadType('image');
      else setUploadType('other');

      if (!uploadTitle && result.name) {
        setUploadTitle(result.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Error', 'Failed to pick file.');
      }
    }
  };

  const handleUpload = async () => {
    if (!uploadTitle.trim()) {
      Alert.alert('Required', 'Please enter a title for this resource.');
      return;
    }
    if (!selectedFile) {
      Alert.alert('Required', 'Please select a file to upload.');
      return;
    }

    setSaving(true);
    try {
      await dispatch(
        uploadGroupResource({
          groupId,
          title: uploadTitle.trim(),
          description: uploadDescription.trim() || undefined,
          fileUri: selectedFile.uri,
          filename: selectedFile.name,
          fileSize: selectedFile.size,
          resourceType: uploadType,
        }),
      ).unwrap();

      Alert.alert('Uploaded!', 'Resource has been added to the group library.', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload resource.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!linkTitle.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if (!linkUrl.trim()) {
      Alert.alert('Required', 'Please enter a URL.');
      return;
    }

    // Basic URL validation
    const urlPattern = /^https?:\/\/.+/i;
    if (!urlPattern.test(linkUrl.trim())) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }

    setSaving(true);
    try {
      await dispatch(
        addGroupResourceLink({
          groupId,
          title: linkTitle.trim(),
          description: linkDescription.trim() || undefined,
          url: linkUrl.trim(),
          type: linkType,
        }),
      ).unwrap();

      Alert.alert('Added!', 'Link has been added to the group library.', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add link.');
    } finally {
      setSaving(false);
    }
  };

  const isSaving = saving || isUploading;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Tab selector */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'upload' && styles.tabActive]}
              onPress={() => setActiveTab('upload')}>
              <Icon
                name="cloud-upload-outline"
                size={18}
                color={activeTab === 'upload' ? '#7B1FA2' : '#9E9E9E'}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'upload' && styles.tabTextActive,
                ]}>
                Upload File
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'link' && styles.tabActive]}
              onPress={() => setActiveTab('link')}>
              <Icon
                name="link-outline"
                size={18}
                color={activeTab === 'link' ? '#7B1FA2' : '#9E9E9E'}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'link' && styles.tabTextActive,
                ]}>
                Add Link
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'upload' ? (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={uploadTitle}
                onChangeText={setUploadTitle}
                placeholder="Resource title"
                maxLength={100}
              />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={uploadDescription}
                onChangeText={setUploadDescription}
                placeholder="Brief description..."
                multiline
                maxLength={300}
              />

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeRow}>
                {TYPE_OPTIONS.filter(t => t.value !== 'link').map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeChip,
                      uploadType === opt.value && styles.typeChipActive,
                    ]}
                    onPress={() => setUploadType(opt.value)}>
                    <Text
                      style={[
                        styles.typeChipText,
                        uploadType === opt.value && styles.typeChipTextActive,
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.filePickerButton}
                onPress={handlePickFile}>
                <Icon name="document-attach-outline" size={22} color="#7B1FA2" />
                <Text style={styles.filePickerText}>
                  {selectedFile ? selectedFile.name : 'Choose File (max 10 MB)'}
                </Text>
              </TouchableOpacity>

              {isUploading && (
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {width: `${Math.round(uploadProgress * 100)}%`},
                    ]}
                  />
                  <Text style={styles.progressText}>
                    {Math.round(uploadProgress * 100)}%
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!selectedFile || !uploadTitle.trim() || isSaving) && styles.saveButtonDisabled,
                ]}
                onPress={handleUpload}
                disabled={!selectedFile || !uploadTitle.trim() || isSaving}>
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name="cloud-upload-outline" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Upload</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={linkTitle}
                onChangeText={setLinkTitle}
                placeholder="Resource title"
                maxLength={100}
              />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={linkDescription}
                onChangeText={setLinkDescription}
                placeholder="Brief description..."
                multiline
                maxLength={300}
              />

              <Text style={styles.fieldLabel}>URL *</Text>
              <TextInput
                style={styles.input}
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://..."
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeRow}>
                {TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeChip,
                      linkType === opt.value && styles.typeChipActive,
                    ]}
                    onPress={() => setLinkType(opt.value)}>
                    <Text
                      style={[
                        styles.typeChipText,
                        linkType === opt.value && styles.typeChipTextActive,
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!linkTitle.trim() || !linkUrl.trim() || isSaving) && styles.saveButtonDisabled,
                ]}
                onPress={handleAddLink}
                disabled={!linkTitle.trim() || !linkUrl.trim() || isSaving}>
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name="save-outline" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Link</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  scrollContent: {padding: 16, paddingBottom: 40},
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabActive: {backgroundColor: '#F3E5F5'},
  tabText: {fontSize: 14, color: '#9E9E9E'},
  tabTextActive: {color: '#7B1FA2', fontWeight: '700'},
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
    color: '#212121',
  },
  multilineInput: {minHeight: 80, textAlignVertical: 'top'},
  typeRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
  typeChip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  typeChipActive: {backgroundColor: '#7B1FA2', borderColor: '#7B1FA2'},
  typeChipText: {fontSize: 13, color: '#616161'},
  typeChipTextActive: {color: '#fff', fontWeight: '600'},
  filePickerButton: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#CE93D8',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FAFAFA',
  },
  filePickerText: {
    flex: 1,
    fontSize: 14,
    color: '#616161',
  },
  progressBar: {
    marginTop: 12,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#7B1FA2',
    borderRadius: 4,
  },
  progressText: {
    position: 'absolute',
    right: 4,
    top: -18,
    fontSize: 12,
    color: '#7B1FA2',
  },
  saveButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  saveButtonDisabled: {opacity: 0.5},
  saveButtonText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});

export default AddGroupResourceScreen;
