import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import functions from '@react-native-firebase/functions';
import {IntergroupStackParamList} from '../../types/navigation';
import {useAppSelector} from '../../store';
import {selectAffiliatedGroups} from '../../store/slices/intergroupSlice';

type Route = RouteProp<IntergroupStackParamList, 'IntergroupAnnouncement'>;
type Nav = StackNavigationProp<IntergroupStackParamList, 'IntergroupAnnouncement'>;

const IntergroupAnnouncementScreen: React.FC = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const {intergroupId} = route.params;

  const affiliatedGroups = useAppSelector(selectAffiliatedGroups);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId],
    );
  };

  const handleSend = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Title and content are required');
      return;
    }

    const targetGroupIds = sendToAll ? undefined : selectedGroupIds;
    if (!sendToAll && selectedGroupIds.length === 0) {
      Alert.alert('Error', 'Select at least one group');
      return;
    }

    setSending(true);
    try {
      const result = await functions().httpsCallable('sendIntergroupAnnouncement')({
        intergroupId,
        title: title.trim(),
        content: content.trim(),
        targetGroupIds,
      });
      const data = result.data as {sentToGroupCount: number; notificationsSent: number};
      Alert.alert(
        'Announcement Sent',
        `Sent to ${data.sentToGroupCount} group(s), ${data.notificationsSent} notification(s) delivered`,
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send announcement');
    } finally {
      setSending(false);
    }
  };

  const groupCount = sendToAll ? affiliatedGroups.length : selectedGroupIds.length;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formSection}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Announcement title"
          maxLength={100}
        />

        <Text style={styles.label}>Content</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={content}
          onChangeText={setContent}
          placeholder="Write your announcement..."
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Send to</Text>
        <TouchableOpacity
          style={[styles.optionRow, sendToAll && styles.optionRowSelected]}
          onPress={() => setSendToAll(true)}>
          <Text style={styles.optionText}>All Affiliated Groups ({affiliatedGroups.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.optionRow, !sendToAll && styles.optionRowSelected]}
          onPress={() => setSendToAll(false)}>
          <Text style={styles.optionText}>Select Specific Groups</Text>
        </TouchableOpacity>

        {!sendToAll && (
          <View style={styles.groupList}>
            {affiliatedGroups.map(group => (
              <TouchableOpacity
                key={group.id}
                style={styles.checkRow}
                onPress={() => toggleGroup(group.id!)}>
                <Text style={styles.checkbox}>
                  {selectedGroupIds.includes(group.id!) ? '[x]' : '[ ]'}
                </Text>
                <Text style={styles.groupName}>{group.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>
              Send to {groupCount} group{groupCount !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  formSection: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 8,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 12},
  label: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  multiline: {height: 120},
  optionRow: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    marginBottom: 8,
  },
  optionRowSelected: {borderColor: '#2196F3', backgroundColor: '#E3F2FD'},
  optionText: {fontSize: 14, color: '#1a1a1a'},
  groupList: {marginTop: 8},
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
  },
  checkbox: {fontSize: 16, color: '#2196F3'},
  groupName: {fontSize: 14, color: '#1a1a1a'},
  actions: {margin: 16, marginTop: 0},
  sendButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  sendButtonDisabled: {backgroundColor: '#90CAF9'},
  sendButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
});

export default IntergroupAnnouncementScreen;
