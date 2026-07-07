/**
 * GuestMedicationSummary - Migrated to Redux Toolkit
 */

import React, { useState } from "react";
import { View, Alert } from "react-native";

// Hooks
import { useStatSummary } from "../../../hooks/useStatSummary";

// Components
import StatSummaryScreen, {
  ActionButtons,
} from "../../../components/StatSummaryScreen";
import { RatsStatCard } from "../../../components/rats-stat-card";
import { RatsText } from "../../../components/rats-text";
import RatsTextInput from "../../../components/rats-text-input/rats-text-input";
import RatsButton from "../../../components/rats-button/rats-button";
// Phase 3.3: Migrated from 1 HOC layer to Context hooks
// Removed: withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from "../../../context";

// Services & queries
import { useLogNewActivity } from "../../../state/queries/activityQueries";
import { ActivityType } from "../../../entities/ActivityModel";
import { auth } from "../../../../firebase-setup";
import { logException } from "../../../util/logging";

// Utils
import { getPhaseRule } from "../../../util/guest";
import { fontSize, normalize, fontFamily } from "../../../styles/theme";

// Navigation
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../navigation/types";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

// A standalone, independently-mounted component so its own text input state
// re-renders correctly inside the frozen showFormModal snapshot. Passing
// inline JSX built from the outer screen's useState (the original version of
// this fix) doesn't work: showFormModal stores whatever element it's given
// as a frozen snapshot in ModalContext, and the outer screen re-rendering
// doesn't re-render ModalProvider, so a controlled input driven by the outer
// screen's state would never reflect keystrokes. See FinancialRecordDetail's
// RejectRecordForm for the same pattern.
interface MedicationFormProps {
  onSubmit: (medicationName: string, dosage: string) => Promise<void>;
}

const MedicationForm: React.FC<MedicationFormProps> = ({ onSubmit }) => {
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(medicationName, dosage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      <RatsTextInput
        testID="medication-name-input"
        placeholder="Medication name"
        label="Medication name"
        field={{ name: "medicationName", value: medicationName }}
        customHandleChange={setMedicationName}
      />
      <RatsTextInput
        testID="medication-dosage-input"
        placeholder="Dosage"
        label="Dosage"
        field={{ name: "dosage", value: dosage }}
        customHandleChange={setDosage}
      />
      <RatsButton
        testID="submit-medication-button"
        title="SUBMIT"
        onPress={handlePress}
        disabled={isSubmitting}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

const GuestMedicationSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 1 HOC layer)
  const { showFormModal, dismissFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();
  const logActivity = useLogNewActivity();

  // Get stat summary data (hook provides guest, house, user from RTK slices).
  // statSum and graphData are sourced exclusively from the 'week-summaries'
  // Firestore collection — no legacy 'guest-reports' reads.
  const {
    guest,
    house,
    user,
    statSum,
    phaseRule,
    percentage,
    disputes,
    daysRemaining,
    graphData,
    getBarFillColor,
    isLoading,
  } = useStatSummary("medication");

  const renderHelp = () => {
    showPopover(
      "MEDICATION",
      "Here you can view this resident's medication tracking."
    );
  };

  // Hardened 2026-07-05: both buttons previously opened a blank modal
  // (showFormModal(<View />, ...)) — there was no way to actually log or
  // update medication through this screen. There's no per-guest medication
  // registry field on the Guest entity (unlike jobs/chores), so both actions
  // log a real MEDICATION activity via the same activity system the
  // chore/work screens use — this one asks for name/dosage since neither is
  // implied by any existing field.
  const submitMedicationActivity = async (
    medicationName: string,
    dosage: string
  ) => {
    if (!guest || !house) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      await logActivity.mutateAsync({
        guestId: guest.id,
        houseId: house.id,
        type: ActivityType.MEDICATION,
        data: {
          type: "medication",
          medicationName: medicationName || undefined,
          dosage: dosage || undefined,
        },
        loggedBy: currentUser.uid,
      });
      dismissFormModal();
      Alert.alert("Done", "Medication logged!");
    } catch (error) {
      logException(error, "Failed to log medication activity");
      Alert.alert("Error", "Could not log medication. Please try again.");
    }
  };

  const showLogMedicationModal = () => {
    showFormModal(
      <MedicationForm onSubmit={submitMedicationActivity} />,
      "Log Medication",
      true
    );
  };

  const showChangeMedicationModal = () => {
    showFormModal(
      <MedicationForm onSubmit={submitMedicationActivity} />,
      "Update Medication Info",
      true
    );
  };

  const renderStatDetails = () => {
    if (!house || !guest) return <></>;

    return (
      <RatsStatCard
        headerItems={[
          <RatsText
            key="1"
            translate={false}
            text="Medication"
            style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
          />,
        ]}
      >
        <View style={{ width: "100%" }}>
          <RatsText
            text={
              getPhaseRule(house, guest, "medication") > 0
                ? "You must take your prescribed medications daily as required."
                : "No medication requirements set for your current phase."
            }
            translate={false}
            style={{
              fontSize: fontSize.medium,
              paddingVertical: normalize(15),
            }}
          />
          <ActionButtons
            leftButtonLabel="UPDATE MEDICATION"
            rightButtonLabel="LOG MEDICATION"
            leftButtonOnPress={showChangeMedicationModal}
            rightButtonOnPress={showLogMedicationModal}
            user={user}
            house={house}
            guestUserId={guest.userId}
            leftButtonTestID="update-medication-button"
            rightButtonTestID="log-medication-button"
          />
        </View>
      </RatsStatCard>
    );
  };

  return (
    <StatSummaryScreen
      testID="medication-summary-screen"
      stat="medication"
      statSum={statSum}
      phaseRule={phaseRule}
      percentage={percentage}
      disputes={disputes}
      daysRemaining={daysRemaining}
      graphData={graphData}
      getBarFillColor={getBarFillColor}
      isLoading={isLoading}
      house={house}
      user={user}
      navigation={navigation}
      setRef={setPopoverRef}
      renderStatDetails={renderStatDetails}
      renderHelp={renderHelp}
    />
  );
};

/**
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * @migrated Activity hard-cutover - Bar graph now reads from 'week-summaries' collection
 * @migrated Phase 3.3 - Added full renderStatDetails with ActionButtons (Log Medication)
 * Changes:
 * - Removed legacy getGuestReports dispatch (was reading from 'guest-reports' collection)
 * - Bar graph data now sourced from useWeekSummaryHistory inside useStatSummary
 * - Replaced placeholder text with proper RatsStatCard + ActionButtons matching GuestWorkOverview
 * - Added testID="medication-summary-screen"
 * - Added useModal hook for Log Medication and Update Medication modals
 */
export default GuestMedicationSummary;
