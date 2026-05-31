// mobile/src/screens/profile/ContributeLiteratureScreen.tsx
import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/Ionicons';

type LiteratureType =
  | 'article'
  | 'guide'
  | 'pamphlet'
  | 'meditation'
  | 'prayer'
  | 'external_link';

const TYPE_OPTIONS: {label: string; value: LiteratureType}[] = [
  {label: 'Article', value: 'article'},
  {label: 'Guide', value: 'guide'},
  {label: 'Pamphlet', value: 'pamphlet'},
  {label: 'Meditation', value: 'meditation'},
  {label: 'Prayer', value: 'prayer'},
  {label: 'External Link', value: 'external_link'},
];

const SUMMARY_MAX = 500;

const ContributeLiteratureScreen: React.FC = () => {
  const navigation = useNavigation();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [type, setType] = useState<LiteratureType>('article');
  const [summary, setSummary] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [program, setProgram] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid =
    title.trim().length > 0 &&
    summary.trim().length > 0 &&
    summary.trim().length <= SUMMARY_MAX &&
    (type !== 'external_link' || externalUrl.trim().length > 0);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const tags = tagsText
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const payload: Record<string, any> = {
        title: title.trim(),
        type,
        summary: summary.trim(),
        tags,
      };
      if (author.trim()) payload.author = author.trim();
      if (externalUrl.trim()) payload.externalUrl = externalUrl.trim();
      if (program.trim()) payload.program = program.trim();

      await functions().httpsCallable('contributeLiterature')(payload);
      Alert.alert(
        'Submitted',
        'Thank you for your contribution! It will be reviewed by a moderator before appearing in the library.',
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit contribution.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.infoCard}>
            <Icon name="information-circle-outline" size={18} color="#1565C0" />
            <Text style={styles.infoText}>
              Contributions are reviewed before being added to the shared
              library. Do not submit copyrighted content.
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Resource title"
            placeholderTextColor="#9E9E9E"
            maxLength={120}
            returnKeyType="next"
          />

          {/* Author */}
          <Text style={styles.label}>Author (optional)</Text>
          <TextInput
            style={styles.input}
            value={author}
            onChangeText={setAuthor}
            placeholder="Author name"
            placeholderTextColor="#9E9E9E"
            maxLength={80}
            returnKeyType="next"
          />

          {/* Type */}
          <Text style={styles.label}>Type *</Text>
          <View style={styles.typeGrid}>
            {TYPE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.typeChip,
                  type === opt.value && styles.typeChipActive,
                ]}
                onPress={() => setType(opt.value)}>
                <Text
                  style={[
                    styles.typeChipText,
                    type === opt.value && styles.typeChipTextActive,
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Summary *</Text>
            <Text
              style={[
                styles.charCount,
                summary.length > SUMMARY_MAX && styles.charCountOver,
              ]}>
              {summary.length}/{SUMMARY_MAX}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.summaryInput]}
            value={summary}
            onChangeText={setSummary}
            placeholder="Brief description of this resource (max 500 characters)"
            placeholderTextColor="#9E9E9E"
            multiline
            maxLength={SUMMARY_MAX + 10}
          />

          {/* External URL — only shown for external_link type */}
          {type === 'external_link' && (
            <>
              <Text style={styles.label}>External URL *</Text>
              <TextInput
                style={styles.input}
                value={externalUrl}
                onChangeText={setExternalUrl}
                placeholder="https://..."
                placeholderTextColor="#9E9E9E"
                keyboardType="url"
                autoCapitalize="none"
                returnKeyType="next"
              />
            </>
          )}

          {/* Program */}
          <Text style={styles.label}>Program (optional)</Text>
          <TextInput
            style={styles.input}
            value={program}
            onChangeText={setProgram}
            placeholder="e.g. AA, NA, Al-Anon, general"
            placeholderTextColor="#9E9E9E"
            maxLength={40}
            returnKeyType="next"
          />

          {/* Tags */}
          <Text style={styles.label}>Tags (optional, comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="e.g. step-work, gratitude, prayer"
            placeholderTextColor="#9E9E9E"
            autoCapitalize="none"
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || submitting}>
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Contribution</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: {flex: 1},
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  scrollContent: {padding: 16, paddingBottom: 40},
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 20,
  },
  infoText: {flex: 1, fontSize: 13, color: '#1565C0', lineHeight: 18},
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 6,
    marginTop: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  charCount: {fontSize: 12, color: '#9E9E9E'},
  charCountOver: {color: '#C62828'},
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212121',
  },
  summaryInput: {minHeight: 90, textAlignVertical: 'top'},
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  typeChipActive: {
    backgroundColor: '#6A1B9A',
    borderColor: '#6A1B9A',
  },
  typeChipText: {fontSize: 13, color: '#616161', fontWeight: '500'},
  typeChipTextActive: {color: '#fff'},
  submitButton: {
    backgroundColor: '#6A1B9A',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {backgroundColor: '#CE93D8'},
  submitButtonText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});

export default ContributeLiteratureScreen;
