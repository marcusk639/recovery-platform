import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {BylawDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type EditBylawsRouteProp = RouteProp<GroupStackParamList, 'EditBylaws'>;
type EditBylawsNavigationProp = StackNavigationProp<GroupStackParamList>;

const EditBylawsScreen: React.FC = () => {
  const route = useRoute<EditBylawsRouteProp>();
  const navigation = useNavigation<EditBylawsNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  const [title, setTitle] = useState('Home Group Guidelines');
  const [content, setContent] = useState('');
  const [existingBylaw, setExistingBylaw] = useState<BylawDocument | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadExistingBylaw = useCallback(async () => {
    try {
      const doc = await firestore()
        .collection('group_bylaws')
        .doc(groupId)
        .get();

      if (doc.exists) {
        const data = doc.data() as BylawDocument;
        setExistingBylaw(data);
        setTitle(data.title || 'Home Group Guidelines');
        setContent(data.content || '');
      }
    } catch (error) {
      console.error('Error loading bylaw:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadExistingBylaw();
  }, [loadExistingBylaw]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleSaveDraft}
          disabled={saving}
          testID="save-bylaws-header-button">
          {saving ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <Text style={styles.headerSaveText}>Save</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, saving, title, content]);

  const handleSaveDraft = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title for the guidelines.');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Error', 'Please enter the guidelines content.');
      return;
    }

    setSaving(true);
    try {
      const saveFn = functions().httpsCallable('saveBylawDraft');
      await saveFn({groupId, title: title.trim(), content: content.trim()});

      Alert.alert(
        'Draft Saved',
        'Your guidelines draft has been saved.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('GroupBylaws', {groupId, groupName}),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartRatificationVote = () => {
    const newVersion = existingBylaw ? (existingBylaw.version || 0) + 1 : 1;
    navigation.navigate('CreateConscienceVote', {
      groupId,
      groupName,
    });
    // Note: In a production build, we'd pass prefilled title to CreateConscienceVote.
    // The screen is navigated to with groupId/groupName for the vote creation flow.
  };

  const isDraftDifferentFromRatified =
    existingBylaw?.status !== 'ratified' ||
    content !== existingBylaw?.content ||
    title !== existingBylaw?.title;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="edit-bylaws-screen">
      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Icon
          name="information-outline"
          size={18}
          color="#1565C0"
          style={{marginRight: 8, marginTop: 2}}
        />
        <Text style={styles.infoBannerText}>
          Changes are saved as a draft. Start a ratification vote when ready to
          make this official.
        </Text>
      </View>

      {/* Title Input */}
      <View style={styles.fieldSection}>
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Home Group Guidelines"
          placeholderTextColor="#9E9E9E"
          testID="bylaw-title-input"
        />
      </View>

      {/* Content Input */}
      <View style={styles.fieldSection}>
        <Text style={styles.fieldLabel}>Guidelines Content</Text>
        <Text style={styles.fieldHint}>
          Plain text or markdown supported
        </Text>
        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={setContent}
          placeholder="Enter your group guidelines here..."
          placeholderTextColor="#9E9E9E"
          multiline
          textAlignVertical="top"
          testID="bylaw-content-input"
        />
      </View>

      {/* Save Draft Button */}
      <TouchableOpacity
        style={styles.saveDraftButton}
        onPress={handleSaveDraft}
        disabled={saving}
        testID="save-draft-button">
        {saving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Icon
              name="content-save"
              size={18}
              color="#FFFFFF"
              style={{marginRight: 8}}
            />
            <Text style={styles.saveDraftButtonText}>Save Draft</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Start Ratification Vote Button */}
      {isDraftDifferentFromRatified && existingBylaw && (
        <TouchableOpacity
          style={styles.ratificationButton}
          onPress={handleStartRatificationVote}
          testID="start-ratification-button">
          <Icon
            name="vote"
            size={18}
            color="#388E3C"
            style={{marginRight: 8}}
          />
          <Text style={styles.ratificationButtonText}>
            Start Ratification Vote
          </Text>
        </TouchableOpacity>
      )}

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    marginRight: 12,
    padding: 4,
  },
  headerSaveText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    margin: 12,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  fieldSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 8,
  },
  titleInput: {
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
  },
  contentInput: {
    fontSize: 14,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
    minHeight: 300,
    fontFamily: 'Courier New',
  },
  saveDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#388E3C',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    paddingVertical: 14,
  },
  saveDraftButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  ratificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#388E3C',
  },
  ratificationButtonText: {
    color: '#388E3C',
    fontWeight: '600',
    fontSize: 15,
  },
});

export default EditBylawsScreen;
