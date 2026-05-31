// src/screens/DrugTesting/DrugTestForm.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useData } from '../../context/DataContext';
import { useGuests } from '../../state/queries/guestQueries';
import { useLogDrugTest } from '../../state/queries/drugTestQueries';
import {
  drugTestSchema,
  DrugTestResult,
  DrugTestType,
} from '../../entities/DrugTest';
import RatsText from '../../components/rats-text/rats-text';

const TEST_TYPES: DrugTestType[] = ['urine', 'saliva', 'breathalyzer', 'hair'];
const RESULTS: DrugTestResult[] = [
  'negative',
  'positive',
  'inconclusive',
  'refused',
];

const RESULT_LABELS: Record<DrugTestResult, string> = {
  negative: 'Negative',
  positive: 'Positive',
  inconclusive: 'Inconclusive',
  refused: 'Refused',
};

const TYPE_LABELS: Record<DrugTestType, string> = {
  urine: 'Urine',
  saliva: 'Saliva',
  breathalyzer: 'Breathalyzer',
  hair: 'Hair',
};

const RESULT_COLORS: Record<DrugTestResult, string> = {
  negative: '#4CAF50',
  positive: '#F44336',
  inconclusive: '#FF9800',
  refused: '#9E9E9E',
};

export default function DrugTestForm() {
  const navigation = useNavigation<any>();
  const { currentHouse, currentUser } = useData();
  // React Query is the source of truth for guests; the Redux slot was empty
  // in production (cacheGuests was never dispatched). useGuests already
  // returns guests scoped to the houseId, so the local filter is unnecessary.
  // See .full-review/01-quality-architecture.md [A2].
  const { data: guestsMap = {} } = useGuests(currentHouse?.id ?? '');
  const guests = useMemo(() => Object.values(guestsMap) as any[], [guestsMap]);
  const { mutateAsync, isPending } = useLogDrugTest();

  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [testType, setTestType] = useState<DrugTestType>('urine');
  const [result, setResult] = useState<DrugTestResult | ''>('');
  const [substancesText, setSubstancesText] = useState('');
  const [isRandom, setIsRandom] = useState(false);
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!currentUser?.uid) {
      Alert.alert('Session expired', 'Please log in again to record a test.');
      return;
    }
    if (!selectedGuestId) {
      Alert.alert('Required', 'Please select a guest.');
      return;
    }
    if (!result) {
      Alert.alert('Required', 'Please select a test result.');
      return;
    }
    try {
      const payload = {
        guestId: selectedGuestId,
        houseId: currentHouse?.id ?? '',
        testDate: new Date().toISOString(),
        result: result as DrugTestResult,
        testType,
        substancesDetected:
          result === 'positive'
            ? substancesText
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : [],
        observedBy: currentUser?.uid ?? '',
        observerName: currentUser
          ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
          : '',
        notes,
        isRandom,
      };

      await drugTestSchema.validate(payload);
      await mutateAsync(payload);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to log drug test');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <RatsText translate={false} text="Log Drug Test" style={styles.title} />

      {/* Guest Picker */}
      <RatsText translate={false} text="Select Guest" style={styles.label} />
      <ScrollView
        style={styles.guestList}
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        {guests.map((guest: any) => {
          const name = `${guest.firstName} ${guest.lastName}`.trim();
          const isSelected = guest.id === selectedGuestId;
          return (
            <TouchableOpacity
              key={guest.id}
              style={[styles.guestRow, isSelected && styles.guestRowSelected]}
              onPress={() => setSelectedGuestId(guest.id)}>
              <RatsText
                translate={false}
                text={name}
                style={[
                  styles.guestName,
                  isSelected && styles.guestNameSelected,
                ]}
              />
            </TouchableOpacity>
          );
        })}
        {guests.length === 0 && (
          <RatsText
            translate={false}
            text="No guests found"
            style={styles.emptyText}
          />
        )}
      </ScrollView>

      {/* Test Type */}
      <RatsText translate={false} text="Test Type" style={styles.label} />
      <View style={styles.optionRow}>
        {TEST_TYPES.map(type => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionButton,
              testType === type && styles.optionButtonActive,
            ]}
            onPress={() => setTestType(type)}>
            <RatsText
              translate={false}
              text={TYPE_LABELS[type]}
              style={[
                styles.optionText,
                testType === type && styles.optionTextActive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Result */}
      <RatsText translate={false} text="Result" style={styles.label} />
      <View style={styles.optionRow}>
        {RESULTS.map(r => (
          <TouchableOpacity
            key={r}
            style={[
              styles.optionButton,
              result === r && { backgroundColor: RESULT_COLORS[r] },
            ]}
            onPress={() => setResult(r)}>
            <RatsText
              translate={false}
              text={RESULT_LABELS[r]}
              style={[
                styles.optionText,
                result === r && styles.optionTextActive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Substances Detected — only if positive */}
      {result === 'positive' && (
        <View>
          <RatsText
            translate={false}
            text="Substances Detected (comma-separated)"
            style={styles.label}
          />
          <TextInput
            style={styles.textInput}
            value={substancesText}
            onChangeText={setSubstancesText}
            placeholder="e.g. THC, cocaine"
            placeholderTextColor="#aaa"
          />
        </View>
      )}

      {/* Random Test Toggle */}
      <View style={styles.toggleRow}>
        <RatsText
          translate={false}
          text="Random Test"
          style={styles.toggleLabel}
        />
        <Switch value={isRandom} onValueChange={setIsRandom} />
      </View>

      {/* Notes */}
      <RatsText
        translate={false}
        text="Notes (optional)"
        style={styles.label}
      />
      <TextInput
        style={[styles.textInput, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Additional notes..."
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
      />

      {/* Submit */}
      <TouchableOpacity
        testID="submit-button"
        style={[styles.submitButton, isPending && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isPending}>
        <RatsText
          translate={false}
          text={isPending ? 'Saving...' : 'Log Drug Test'}
          style={styles.submitText}
        />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    color: '#1a1a1a',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 8,
    marginTop: 16,
  },
  guestList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
  },
  guestRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  guestRowSelected: { backgroundColor: '#E3F2FD' },
  guestName: { fontSize: 15, color: '#333' },
  guestNameSelected: { color: '#1976D2', fontWeight: '600' },
  emptyText: { padding: 14, color: '#999', fontSize: 14 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionButtonActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  optionText: { fontSize: 13, color: '#555' },
  optionTextActive: { color: '#fff', fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  notesInput: { height: 80, textAlignVertical: 'top' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 4,
  },
  toggleLabel: { fontSize: 15, color: '#333', fontWeight: '500' },
  submitButton: {
    marginTop: 28,
    backgroundColor: '#1976D2',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#90CAF9' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
