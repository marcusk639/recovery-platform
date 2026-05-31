import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import functions from '@react-native-firebase/functions';
import {GroupStackParamList} from '../../types/navigation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type CreateConscienceVoteRouteProp = RouteProp<
  GroupStackParamList,
  'CreateConscienceVote'
>;
type CreateConscienceVoteNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const DEFAULT_OPTIONS = ['Yes', 'No', 'Abstain'];

const CreateConscienceVoteScreen: React.FC = () => {
  const route = useRoute<CreateConscienceVoteRouteProp>();
  const navigation = useNavigation<CreateConscienceVoteNavigationProp>();
  const {groupId, groupName} = route.params;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>([...DEFAULT_OPTIONS]);
  const [quorumRequired, setQuorumRequired] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOptionChange = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Error', 'Please enter a title for the vote.');
      return;
    }

    const validOptions = options.map(o => o.trim()).filter(o => o.length > 0);
    if (validOptions.length < 2) {
      Alert.alert('Error', 'Please provide at least 2 vote options.');
      return;
    }

    const quorumValue = quorumRequired.trim()
      ? parseInt(quorumRequired.trim(), 10)
      : undefined;

    if (quorumRequired.trim() && (isNaN(quorumValue!) || quorumValue! < 1)) {
      Alert.alert('Error', 'Quorum must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      const createVoteFn = functions().httpsCallable('createConscienceVote');
      const payload: Record<string, any> = {
        groupId,
        title: trimmedTitle,
        options: validOptions,
      };

      if (description.trim()) {
        payload.description = description.trim();
      }
      if (quorumValue !== undefined) {
        payload.quorumRequired = quorumValue;
      }

      await createVoteFn(payload);

      Alert.alert(
        'Vote Created',
        'Your group conscience vote has been opened and members have been notified.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error: any) {
      console.error('Error creating vote:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to create vote. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        testID="create-conscience-vote-screen">
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Icon
            name="vote-outline"
            size={20}
            color="#1565C0"
            style={{marginRight: 8}}
          />
          <Text style={styles.infoBannerText}>
            Create a motion for {groupName} members to vote on.
          </Text>
        </View>

        {/* Title */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>
            Motion / Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Should we change the meeting day?"
            placeholderTextColor="#9E9E9E"
            maxLength={200}
            testID="vote-title-input"
          />
        </View>

        {/* Description */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textInputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Provide additional context or background for this motion..."
            placeholderTextColor="#9E9E9E"
            multiline
            numberOfLines={3}
            maxLength={1000}
            testID="vote-description-input"
          />
        </View>

        {/* Options */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Vote Options</Text>
          <Text style={styles.fieldSubtitle}>
            Edit the options members can choose from:
          </Text>
          {options.map((option, index) => (
            <View key={index} style={styles.optionRow}>
              <View style={styles.optionNumber}>
                <Text style={styles.optionNumberText}>{index + 1}</Text>
              </View>
              <TextInput
                style={[styles.textInput, styles.optionInput]}
                value={option}
                onChangeText={text => handleOptionChange(index, text)}
                placeholder={`Option ${index + 1}`}
                placeholderTextColor="#9E9E9E"
                maxLength={50}
                testID={`vote-option-${index}-input`}
              />
            </View>
          ))}
        </View>

        {/* Quorum */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Quorum Required (optional)</Text>
          <Text style={styles.fieldSubtitle}>
            Minimum number of votes needed for the result to be valid. Leave
            blank for no quorum requirement.
          </Text>
          <TextInput
            style={[styles.textInput, styles.quorumInput]}
            value={quorumRequired}
            onChangeText={setQuorumRequired}
            placeholder="e.g., 5"
            placeholderTextColor="#9E9E9E"
            keyboardType="numeric"
            maxLength={4}
            testID="vote-quorum-input"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!title.trim() || submitting) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!title.trim() || submitting}
          testID="create-vote-submit-button">
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon
                name="vote"
                size={18}
                color="#FFFFFF"
                style={{marginRight: 8}}
              />
              <Text style={styles.submitButtonText}>Open Vote</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.noticeText}>
          All group members will be notified when you open this vote.
        </Text>

        <View style={{height: 32}} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
  fieldContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  fieldSubtitle: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 10,
    lineHeight: 16,
  },
  required: {
    color: '#F44336',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#FAFAFA',
  },
  textInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  optionNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565C0',
  },
  optionInput: {
    flex: 1,
  },
  quorumInput: {
    width: 120,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  noticeText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});

export default CreateConscienceVoteScreen;
