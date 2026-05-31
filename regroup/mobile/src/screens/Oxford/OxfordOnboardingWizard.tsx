import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePicker from 'react-native-date-picker';
import { format } from 'date-fns';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Routes } from '../../navigation/types';
import { RatsText } from '../../components/rats-text';
import RatsWizardProgress from '../../components/rats-wizard-progress';
import RatsWizardSlide from '../../components/rats-wizard-slide';
import SetupHeader from '../../components/setup-header';
import SetupButtons from '../../components/setup-buttons';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { color, fontSize, fontFamily, normalize } from '../../styles/theme';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useCompleteOxfordOnboarding } from '../../state/mutations/oxfordOnboardingMutations';
import { logException } from '../../util/logging';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

interface WizardState {
  presidentName: string;
  treasurerName: string;
  secretaryName: string;
  firstMeetingDate: Date | null;
  firstMeetingTime: string;
  eesMonthlyAmount: string;
}

const STEPS = [
  { label: 'Welcome', icon: 'house-user', bg: color.light_purple },
  { label: 'Officers', icon: 'users', bg: color.baby_blue },
  { label: 'First Meeting', icon: 'calendar-day', bg: color.green_blue },
  { label: 'EES', icon: 'dollar-sign', bg: color.main },
  { label: 'Done', icon: 'check-circle', bg: color.main },
];
const TOTAL_STEPS = STEPS.length;

const OxfordOnboardingWizard: React.FC<Props> = ({ navigation }) => {
  const [step, setStep] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { house } = useSelectedHouse();
  const completeOnboarding = useCompleteOxfordOnboarding();
  const keyboardVisible = useKeyboardVisible();
  const [state, setState] = useState<WizardState>({
    presidentName: '',
    treasurerName: '',
    secretaryName: '',
    firstMeetingDate: null,
    firstMeetingTime: '',
    eesMonthlyAmount: '',
  });

  const houseId = house?.id ?? '';

  const eesAmountValid = useMemo(() => {
    const n = parseFloat(state.eesMonthlyAmount);
    return state.eesMonthlyAmount.trim() !== '' && !isNaN(n) && n > 0;
  }, [state.eesMonthlyAmount]);

  const nextDisabled = useMemo(() => {
    switch (step) {
      case 2:
        return state.firstMeetingDate == null;
      case 3:
        return !eesAmountValid;
      case 4:
        return completeOnboarding.isPending;
      default:
        return false;
    }
  }, [
    step,
    state.firstMeetingDate,
    eesAmountValid,
    completeOnboarding.isPending,
  ]);

  const goNext = () => {
    if (step === TOTAL_STEPS - 1) {
      handleFinish();
    } else {
      setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
    }
  };

  const goBack = () => {
    if (step === 0) navigation.goBack();
    else setStep(s => s - 1);
  };

  const handleFinish = async () => {
    if (!houseId || !state.firstMeetingDate || !eesAmountValid) {
      return;
    }

    const officers = [
      { role: 'president' as const, name: state.presidentName },
      { role: 'treasurer' as const, name: state.treasurerName },
      { role: 'secretary' as const, name: state.secretaryName },
    ].filter(o => o.name.trim() !== '');

    try {
      await completeOnboarding.mutateAsync({
        houseId,
        officers,
        firstMeeting: {
          scheduledDate: `${format(state.firstMeetingDate, 'yyyy-MM-dd')}T${
            state.firstMeetingTime || '19:00'
          }:00`,
        },
        eesMonthlyAmount: parseFloat(state.eesMonthlyAmount),
      });
    } catch (error) {
      logException(error);
      return;
    }

    navigation.replace(Routes.OxfordDashboard);
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: color.light_grey }}>
      {!keyboardVisible && (
        <RatsWizardProgress
          stepCount={TOTAL_STEPS}
          currentStep={step}
          currentLabel={STEPS[step].label}
          testID="oxford-wizard-progress"
        />
      )}
      <RatsWizardSlide currentStep={step} testID="oxford-wizard-slide">
        {/* Step 0: Welcome */}
        <ScrollView
          contentContainerStyle={styles.content}
          testID="wizard-step-1">
          <SetupHeader
            header="Welcome to Oxford House Management"
            description="This quick setup takes 2 minutes. We'll configure your officers, first meeting, and equity distribution settings."
            icon={STEPS[0].icon}
            iconBackgroundColor={STEPS[0].bg}
          />
        </ScrollView>

        {/* Step 1: Officers */}
        <ScrollView
          contentContainerStyle={styles.content}
          testID="wizard-step-2">
          <SetupHeader
            header="Officers"
            description="Assign your house's current leadership. All fields are optional."
            icon={STEPS[1].icon}
            iconBackgroundColor={STEPS[1].bg}
          />
          {(['president', 'treasurer', 'secretary'] as const).map(role => {
            const key = `${role}Name` as
              | 'presidentName'
              | 'treasurerName'
              | 'secretaryName';
            return (
              <View key={role} style={styles.fieldRow}>
                <RatsText
                  text={role.charAt(0).toUpperCase() + role.slice(1)}
                  style={styles.label}
                  translate={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder={`${
                    role.charAt(0).toUpperCase() + role.slice(1)
                  } name (optional)`}
                  value={state[key]}
                  onChangeText={v => setState(s => ({ ...s, [key]: v }))}
                />
              </View>
            );
          })}
        </ScrollView>

        {/* Step 2: First Meeting */}
        <ScrollView
          contentContainerStyle={styles.content}
          testID="wizard-step-3">
          <SetupHeader
            header="First business meeting"
            description="Schedule your first business meeting. You can change this later."
            icon={STEPS[2].icon}
            iconBackgroundColor={STEPS[2].bg}
          />
          <View style={styles.fieldRow}>
            <RatsText
              text="Meeting date"
              style={styles.label}
              translate={false}
            />
            <TouchableOpacity
              testID="wizard-date-display"
              accessibilityLabel="Select meeting date"
              accessibilityRole="button"
              style={styles.input}
              onPress={() => setShowDatePicker(true)}>
              <RatsText
                text={
                  state.firstMeetingDate
                    ? format(state.firstMeetingDate, 'yyyy-MM-dd')
                    : 'Select a date'
                }
                style={{ fontSize: fontSize.regular, color: color.black }}
                translate={false}
              />
            </TouchableOpacity>
            <DatePicker
              modal
              mode="date"
              open={showDatePicker}
              date={state.firstMeetingDate ?? new Date()}
              onConfirm={(d: Date) => {
                setShowDatePicker(false);
                setState(s => ({ ...s, firstMeetingDate: d }));
              }}
              onCancel={() => setShowDatePicker(false)}
            />
          </View>
          <View style={styles.fieldRow}>
            <RatsText
              text="Time (HH:MM, 24h)"
              style={styles.label}
              translate={false}
            />
            <TextInput
              style={styles.input}
              placeholder="19:00"
              value={state.firstMeetingTime}
              onChangeText={v => setState(s => ({ ...s, firstMeetingTime: v }))}
            />
          </View>
        </ScrollView>

        {/* Step 3: EES */}
        <ScrollView
          contentContainerStyle={styles.content}
          testID="wizard-step-4">
          <SetupHeader
            header="Oxford House Equity"
            description="The Equity Expense Share (EES) is the monthly amount each resident contributes to house expenses."
            icon={STEPS[3].icon}
            iconBackgroundColor={STEPS[3].bg}
          />
          <View style={styles.fieldRow}>
            <RatsText
              text="Monthly EES Amount ($)"
              style={styles.label}
              translate={false}
            />
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="numeric"
              value={state.eesMonthlyAmount}
              onChangeText={v => setState(s => ({ ...s, eesMonthlyAmount: v }))}
            />
          </View>
          <RatsText
            text="You can change this at any time from the Oxford settings."
            style={styles.hint}
            translate={false}
          />
        </ScrollView>

        {/* Step 4: Done */}
        <ScrollView
          contentContainerStyle={styles.content}
          testID="wizard-step-5">
          <SetupHeader
            header="You're all set!"
            description="Your Oxford House is configured. You can update any of these settings from the Oxford Dashboard."
            icon={STEPS[4].icon}
            iconBackgroundColor={STEPS[4].bg}
          />
          {completeOnboarding.isError && (
            <RatsText
              text="Setup failed. Please try again."
              style={styles.errorText}
              translate={false}
            />
          )}
        </ScrollView>
      </RatsWizardSlide>

      <SetupButtons
        onBackPress={goBack}
        onNextPress={goNext}
        nextLabel={step === TOTAL_STEPS - 1 ? 'Finish' : 'Next'}
        nextDisabled={nextDisabled}
        isLoading={step === TOTAL_STEPS - 1 && completeOnboarding.isPending}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: { padding: normalize(24), gap: normalize(16) },
  body: { fontSize: fontSize.regular, color: color.dark_grey },
  hint: { fontSize: fontSize.small, color: color.dark_grey },
  label: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.black,
    marginBottom: normalize(4),
  },
  input: {
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(8),
    padding: normalize(12),
    fontSize: fontSize.regular,
    backgroundColor: color.white,
  },
  fieldRow: { marginBottom: normalize(16) },
  errorText: {
    color: color.red,
    fontSize: fontSize.regular,
    marginTop: normalize(8),
  },
});

export default OxfordOnboardingWizard;
