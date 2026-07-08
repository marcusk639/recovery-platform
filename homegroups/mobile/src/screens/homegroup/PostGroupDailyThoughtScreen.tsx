// mobile/src/screens/homegroup/PostGroupDailyThoughtScreen.tsx
import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/Ionicons';

type PostGroupDailyThoughtRouteProp = RouteProp<
  GroupStackParamList,
  'PostGroupDailyThought'
>;

const MAX_CHARS = 500;

const PostGroupDailyThoughtScreen: React.FC = () => {
  const route = useRoute<PostGroupDailyThoughtRouteProp>();
  const navigation = useNavigation();
  const {groupId, groupName} = route.params;

  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const displayDate = (() => {
    const d = new Date(today + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  })();

  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert('Required', 'Please enter a message for your group.');
      return;
    }
    if (content.trim().length > MAX_CHARS) {
      Alert.alert('Too long', `Message must be ${MAX_CHARS} characters or fewer.`);
      return;
    }

    setSaving(true);
    try {
      const fn = functions().httpsCallable('postGroupDailyThought');
      await fn({groupId, content: content.trim(), date: today});
      Alert.alert(
        'Posted!',
        "Your group's daily thought has been posted for today.",
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to post group thought.');
    } finally {
      setSaving(false);
    }
  };

  const remaining = MAX_CHARS - content.length;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerCard}>
            <Icon name="sunny-outline" size={24} color="#F9A825" />
            <Text style={styles.headerTitle}>Group Daily Thought</Text>
            <Text style={styles.headerSubtitle}>{groupName}</Text>
            <Text style={styles.headerDate}>{displayDate}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>
              Share a thought, quote, or reflection with your group for today
            </Text>
            <TextInput
              style={styles.input}
              value={content}
              onChangeText={setContent}
              placeholder="Write something meaningful for your group..."
              multiline
              maxLength={MAX_CHARS}
              textAlignVertical="top"
            />
            <Text
              style={[styles.charCount, remaining < 50 && styles.charCountWarning]}>
              {remaining} characters remaining
            </Text>
          </View>

          <Text style={styles.helperText}>
            This message will appear alongside today's daily reflection for all
            members of {groupName}. You can update it by posting again today.
          </Text>

          <TouchableOpacity
            style={[styles.saveButton, saving && {opacity: 0.6}]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="paper-plane-outline" size={18} color="#fff" />
                <Text style={styles.saveButtonText}>Post to Group</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFF8E1'},
  content: {padding: 16, paddingBottom: 32},
  headerCard: {
    backgroundColor: '#F9A825',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  headerDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 10,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 120,
    backgroundColor: '#FAFAFA',
  },
  charCount: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'right',
    marginTop: 6,
  },
  charCountWarning: {color: '#F44336'},
  helperText: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: '#F9A825',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
});

export default PostGroupDailyThoughtScreen;
