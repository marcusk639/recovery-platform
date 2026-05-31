import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../../components/screen-header/screen-header';
import RatsStepIndicator from '../../components/rats-step-indicator';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize, fontFamily } from '../../styles/theme';
import { Guest } from '../../entities/Guest';
import { useCreateGuest } from '../../state/queries/guestQueries';
import { useData } from '../../context/DataContext';
import { logException } from '../../util/logging';

const STEP_LABELS = [
  { label: 'Personal Info', icon: 'user' },
  { label: 'Emergency Contact', icon: 'phone' },
  { label: 'Insurance', icon: 'shield-alt' },
  { label: 'Legal', icon: 'gavel' },
];

interface IntakeFormValues {
  // Step 1 — Personal Info
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  sobrietyDate: string;
  drugOfChoice: string;
  // Step 2 — Emergency Contact
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  // Step 3 — Insurance & Referral
  insuranceProvider: string;
  insurancePolicyNumber: string;
  referringCenterName: string;
  referringCenterContact: string;
  // Step 4 — Legal & Notes
  legalStatus: string;
  probationOfficer: string;
  probationOfficerPhone: string;
  intakeNotes: string;
}

const INITIAL_VALUES: IntakeFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  sobrietyDate: '',
  drugOfChoice: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  insuranceProvider: '',
  insurancePolicyNumber: '',
  referringCenterName: '',
  referringCenterContact: '',
  legalStatus: '',
  probationOfficer: '',
  probationOfficerPhone: '',
  intakeNotes: '',
};

const IntakeFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { currentUser } = useData();
  const { mutateAsync: createGuest, isPending } = useCreateGuest();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<IntakeFormValues>(INITIAL_VALUES);
  const houseId = route.params?.houseId ?? '';

  const updateField = (field: keyof IntakeFormValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  const validateStep1 = () => {
    if (
      !values.firstName.trim() ||
      !values.lastName.trim() ||
      !values.email.trim()
    ) {
      Alert.alert(
        'Required Fields',
        'Please fill in First Name, Last Name, and Email.',
      );
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (step === 0 && !validateStep1()) {
      return;
    }
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step === 0) {
      navigation.goBack();
    } else {
      setStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!houseId) {
      Alert.alert('Error', 'No house selected. Please try again.');
      return;
    }
    try {
      const guest = new Guest();
      guest.houseId = houseId;
      guest.firstName = values.firstName.trim();
      guest.lastName = values.lastName.trim();
      guest.displayName = `${guest.firstName} ${guest.lastName}`;
      guest.email = values.email.trim().toLowerCase();
      guest.phoneNumber = values.phoneNumber.trim();
      guest.sobrietyDate = values.sobrietyDate.trim();
      guest.drugOfChoice = values.drugOfChoice.trim();
      guest.emergencyContactName =
        values.emergencyContactName.trim() || undefined;
      guest.emergencyContactPhone =
        values.emergencyContactPhone.trim() || undefined;
      guest.emergencyContactRelation =
        values.emergencyContactRelation.trim() || undefined;
      guest.insuranceProvider = values.insuranceProvider.trim() || undefined;
      guest.insurancePolicyNumber =
        values.insurancePolicyNumber.trim() || undefined;
      guest.referringCenterName =
        values.referringCenterName.trim() || undefined;
      guest.referringCenterContact =
        values.referringCenterContact.trim() || undefined;
      guest.legalStatus = values.legalStatus.trim() || undefined;
      guest.probationOfficer = values.probationOfficer.trim() || undefined;
      guest.probationOfficerPhone =
        values.probationOfficerPhone.trim() || undefined;
      guest.intakeNotes = values.intakeNotes.trim() || undefined;
      guest.intakeDate = new Date().toISOString();
      guest.intakeCompletedBy = currentUser?.uid;
      guest.moveInDate = new Date().toISOString();
      guest.infoEntered = true;

      await createGuest(guest);
      Alert.alert('Success', `${guest.displayName} has been admitted.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      logException(error);
      Alert.alert('Error', 'Failed to create resident. Please try again.');
    }
  };

  const renderStep1 = () => (
    <View>
      <TextInput
        style={styles.input}
        placeholder="First Name"
        value={values.firstName}
        onChangeText={v => updateField('firstName', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Last Name"
        value={values.lastName}
        onChangeText={v => updateField('lastName', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={values.email}
        onChangeText={v => updateField('email', v)}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        value={values.phoneNumber}
        onChangeText={v => updateField('phoneNumber', v)}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Sobriety Date"
        value={values.sobrietyDate}
        onChangeText={v => updateField('sobrietyDate', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Drug of Choice"
        value={values.drugOfChoice}
        onChangeText={v => updateField('drugOfChoice', v)}
      />
    </View>
  );

  const renderStep2 = () => (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Emergency Contact Name"
        value={values.emergencyContactName}
        onChangeText={v => updateField('emergencyContactName', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Emergency Contact Phone"
        value={values.emergencyContactPhone}
        onChangeText={v => updateField('emergencyContactPhone', v)}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Relationship"
        value={values.emergencyContactRelation}
        onChangeText={v => updateField('emergencyContactRelation', v)}
      />
    </View>
  );

  const renderStep3 = () => (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Insurance Provider"
        value={values.insuranceProvider}
        onChangeText={v => updateField('insuranceProvider', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Insurance Policy Number"
        value={values.insurancePolicyNumber}
        onChangeText={v => updateField('insurancePolicyNumber', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Referring Center Name"
        value={values.referringCenterName}
        onChangeText={v => updateField('referringCenterName', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Referring Center Contact"
        value={values.referringCenterContact}
        onChangeText={v => updateField('referringCenterContact', v)}
      />
    </View>
  );

  const renderStep4 = () => (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Legal Status (e.g. probation / parole / none)"
        value={values.legalStatus}
        onChangeText={v => updateField('legalStatus', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Probation Officer"
        value={values.probationOfficer}
        onChangeText={v => updateField('probationOfficer', v)}
      />
      <TextInput
        style={styles.input}
        placeholder="Probation Officer Phone"
        value={values.probationOfficerPhone}
        onChangeText={v => updateField('probationOfficerPhone', v)}
        keyboardType="phone-pad"
      />
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Intake Notes"
        value={values.intakeNotes}
        onChangeText={v => updateField('intakeNotes', v)}
        multiline
        numberOfLines={4}
      />
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderStep1();
      case 1:
        return renderStep2();
      case 2:
        return renderStep3();
      case 3:
        return renderStep4();
      default:
        return null;
    }
  };

  const isLastStep = step === STEP_LABELS.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader header="Resident Intake" renderBackButton />
      <RatsStepIndicator
        currentPosition={step}
        stepCount={STEP_LABELS.length}
        labels={STEP_LABELS}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderCurrentStep()}
        <View style={styles.buttonRow}>
          {step > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.backButton]}
              onPress={handleBack}>
              <RatsText text="Back" />
            </TouchableOpacity>
          )}
          {isLastStep ? (
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={handleSubmit}
              disabled={isPending}>
              {isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <RatsText text="Submit" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.continueButton]}
              onPress={handleContinue}>
              <RatsText text="Continue" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.off_white,
  },
  scrollContent: {
    padding: normalize(16),
    paddingBottom: normalize(40),
  },
  input: {
    backgroundColor: color.white,
    borderRadius: normalize(8),
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(10),
    marginBottom: normalize(12),
    fontSize: fontSize.medium,
    fontFamily: fontFamily.regular,
    borderWidth: 1,
    borderColor: color.light_grey,
  },
  notesInput: {
    height: normalize(100),
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: normalize(24),
    gap: normalize(12),
  },
  button: {
    paddingHorizontal: normalize(24),
    paddingVertical: normalize(12),
    borderRadius: normalize(8),
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: color.light_grey,
  },
  continueButton: {
    backgroundColor: color.baby_blue,
  },
  submitButton: {
    backgroundColor: color.green,
  },
});

export default IntakeFormScreen;
