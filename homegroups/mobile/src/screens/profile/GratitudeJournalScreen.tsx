// mobile/src/screens/profile/GratitudeJournalScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchPastGratitudeEntries as fetchGratitudeEntries,
  saveGratitudeEntry,
  selectPastGratitudeEntries as selectAllGratitudeEntries,
  selectTodayGratitudeEntry as selectTodayGratitude,
  selectGratitudeStatus,
} from '../../store/slices/engagementSlice';

const GratitudeJournalScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = useAppSelector(selectTodayGratitude);
  const allEntries = useAppSelector(selectAllGratitudeEntries);
  const status = useAppSelector(selectGratitudeStatus);

  const [gratitude1, setGratitude1] = useState('');
  const [gratitude2, setGratitude2] = useState('');
  const [gratitude3, setGratitude3] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchGratitudeEntries(30));
  }, [dispatch]);

  useEffect(() => {
    if (todayEntry) {
      setGratitude1(todayEntry.entries[0] || '');
      setGratitude2(todayEntry.entries[1] || '');
      setGratitude3(todayEntry.entries[2] || '');
    }
  }, [todayEntry]);

  const handleSave = async () => {
    const entries = [gratitude1, gratitude2, gratitude3].filter(e => e.trim());
    if (entries.length === 0) {
      Alert.alert('Error', 'Please enter at least one gratitude.');
      return;
    }
    setSaving(true);
    try {
      await dispatch(saveGratitudeEntry(entries)).unwrap();
      Alert.alert('Saved', 'Your gratitudes have been saved!');
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const pastEntries = allEntries.filter(e => e.date !== today);

  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={pastEntries}
        keyExtractor={item => item.date}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Today's Gratitudes</Text>
            <Text style={styles.dateLabel}>
              {new Date(today).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <TextInput
              style={styles.input}
              value={gratitude1}
              onChangeText={setGratitude1}
              placeholder="I am grateful for..."
              multiline
              maxLength={200}
            />
            <TextInput
              style={styles.input}
              value={gratitude2}
              onChangeText={setGratitude2}
              placeholder="I appreciate..."
              multiline
              maxLength={200}
            />
            <TextInput
              style={styles.input}
              value={gratitude3}
              onChangeText={setGratitude3}
              placeholder="Something good today..."
              multiline
              maxLength={200}
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && {opacity: 0.6}]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving...' : 'Save Gratitudes'}
              </Text>
            </TouchableOpacity>
            {pastEntries.length > 0 && (
              <Text style={styles.pastHeading}>Past Entries</Text>
            )}
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.pastCard}>
            <Text style={styles.pastDate}>
              {new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            {item.entries.map((e, i) => (
              <Text key={i} style={styles.pastEntry}>
                • {e}
              </Text>
            ))}
          </View>
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <ActivityIndicator style={{marginTop: 20}} />
          ) : null
        }
        contentContainerStyle={{padding: 16}}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  header: {marginBottom: 8},
  heading: {fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 4},
  dateLabel: {fontSize: 14, color: '#888', marginBottom: 16},
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  saveBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  pastHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  pastCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  pastDate: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  pastEntry: {fontSize: 14, color: '#333', marginBottom: 2},
});

export default GratitudeJournalScreen;
