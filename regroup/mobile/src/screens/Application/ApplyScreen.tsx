import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { color } from '../../styles/theme';
import { useSubmitApplication } from '../../state/queries/applicationQueries';
import { ProgramType } from '../../entities/Application';

type Step = 'contact' | 'sobriety' | 'review';
const STEPS: Step[] = ['contact', 'sobriety', 'review'];

type FormState = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  sobrietyDate: string;
  programType: ProgramType;
  currentSituation: string;
  references: string;
};

const PROGRAM_TYPES: ProgramType[] = ['AA', 'NA', 'SMART Recovery', 'other'];

export default function ApplyScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { houseId, houseName } = route.params ?? {};

  const [step, setStep] = useState<Step>('contact');
  const [form, setForm] = useState<FormState>({
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    sobrietyDate: '',
    programType: 'AA',
    currentSituation: '',
    references: '',
  });

  const submitMutation = useSubmitApplication();

  const setField = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
    else navigation.goBack();
  };

  const handleSubmit = async () => {
    if (!form.applicantName.trim() || !form.applicantEmail.trim()) {
      Alert.alert('Required', 'Name and email are required.');
      return;
    }
    try {
      await submitMutation.mutateAsync({ houseId, data: form });
      // Routes.ApplicationStatus will be added in Task 9 navigation wiring
      navigation.navigate('applicationStatus', { houseId, houseName });
    } catch {
      Alert.alert('Error', 'Could not submit application. Please try again.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Apply to {houseName ?? 'this house'}</Text>
      <Text style={styles.stepLabel}>
        Step {STEPS.indexOf(step) + 1} of {STEPS.length}
      </Text>

      {step === 'contact' && (
        <View>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={form.applicantName}
            onChangeText={v => setField('applicantName', v)}
            placeholder="Your full name"
            testID="input-name"
          />
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={form.applicantEmail}
            onChangeText={v => setField('applicantEmail', v)}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            testID="input-email"
          />
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={form.applicantPhone}
            onChangeText={v => setField('applicantPhone', v)}
            placeholder="555-0100"
            keyboardType="phone-pad"
          />
        </View>
      )}

      {step === 'sobriety' && (
        <View>
          <Text style={styles.label}>Sobriety Date</Text>
          <TextInput
            style={styles.input}
            value={form.sobrietyDate}
            onChangeText={v => setField('sobrietyDate', v)}
            placeholder="YYYY-MM-DD"
          />
          <Text style={styles.label}>Program</Text>
          {PROGRAM_TYPES.map(pt => (
            <TouchableOpacity
              key={pt}
              onPress={() => setField('programType', pt)}
              style={[
                styles.chip,
                form.programType === pt && styles.chipSelected,
              ]}>
              <Text
                style={
                  form.programType === pt
                    ? styles.chipTextSelected
                    : styles.chipText
                }>
                {pt}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.label}>Current Situation</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.currentSituation}
            onChangeText={v => setField('currentSituation', v)}
            placeholder="Brief description of your housing situation"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.label}>References (sponsor or counselor)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.references}
            onChangeText={v => setField('references', v)}
            placeholder="Name and contact info"
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      {step === 'review' && (
        <View>
          <Text style={styles.sectionTitle}>Review Your Application</Text>
          <Text style={styles.reviewRow}>Name: {form.applicantName}</Text>
          <Text style={styles.reviewRow}>Email: {form.applicantEmail}</Text>
          <Text style={styles.reviewRow}>
            Phone: {form.applicantPhone || '—'}
          </Text>
          <Text style={styles.reviewRow}>
            Sobriety date: {form.sobrietyDate || '—'}
          </Text>
          <Text style={styles.reviewRow}>Program: {form.programType}</Text>
          <Text style={styles.reviewRow}>
            Situation:{' '}
            {form.currentSituation
              ? `${form.currentSituation.slice(0, 80)}...`
              : '—'}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

        {step !== 'review' ? (
          <TouchableOpacity
            onPress={goNext}
            style={styles.nextBtn}
            testID="btn-next">
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSubmit}
            style={[
              styles.nextBtn,
              submitMutation.isPending && styles.btnDisabled,
            ]}
            disabled={submitMutation.isPending}
            testID="btn-submit">
            {submitMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.nextBtnText}>Submit Application</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.white },
  content: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.black,
    marginBottom: 4,
  },
  stepLabel: { fontSize: 13, color: color.grey, marginBottom: 24 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: color.black,
    marginTop: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: color.black,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chip: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: 8,
    padding: 10,
    marginVertical: 3,
  },
  chipSelected: { borderColor: color.blue, backgroundColor: '#EBF5FF' },
  chipText: { color: color.black, fontSize: 14 },
  chipTextSelected: { color: color.blue, fontWeight: '600', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  reviewRow: {
    fontSize: 14,
    color: color.black,
    marginBottom: 8,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
  },
  backBtn: { padding: 14 },
  backBtnText: { color: color.grey, fontSize: 15 },
  nextBtn: {
    backgroundColor: color.blue,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  btnDisabled: { opacity: 0.6 },
  nextBtnText: { color: color.white, fontWeight: '700', fontSize: 15 },
});
