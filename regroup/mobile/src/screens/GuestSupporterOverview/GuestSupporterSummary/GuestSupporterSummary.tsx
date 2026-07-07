/**
 * GuestSupporterSummary - Migrated to Redux Toolkit
 */

import React, { useMemo, useState } from "react";
import { View, Alert } from "react-native";

// Hooks
import { useStatSummary } from "../../../hooks/useStatSummary";

// Components
import StatSummaryScreen, {
  ActionButtons,
} from "../../../components/StatSummaryScreen";
import { RatsStatCard } from "../../../components/rats-stat-card";
import { RatsText } from "../../../components/rats-text";
import RatsNumericInput from "../../../components/rats-numeric-input";
import RatsTextInput from "../../../components/rats-text-input/rats-text-input";
import RatsButton from "../../../components/rats-button/rats-button";
// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withStatUpdateModal, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from "../../../context";

// Services & queries
import { useUpdateGuest } from "../../../state/queries/guestQueries";
import { logException } from "../../../util/logging";

// Utils
import { normalize, fontSize, color, fontFamily } from "../../../styles/theme";

// Navigation
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../navigation/types";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

// Hardened 2026-07-06: both modals used to render bare Formik <Field .../>
// content (directly, and via the shared renderField() util — which is fine
// everywhere ELSE it's used, always inside a real <Formik> tree, just not
// here) with no <Formik> provider — ModalContext renders form-modal content
// directly, so Formik's useField() threw the moment either modal opened,
// crashing to the top-level ErrorBoundary. Neither had a working submit path
// either way. Standalone local-state components, matching
// GuestMedicationSummary's MedicationForm — required (not just convenient)
// because showFormModal stores whatever element it's given as a frozen
// snapshot; the outer screen's state updates don't re-render that snapshot.
interface MeetSponsorFormProps {
  initialStep: number;
  onSubmit: (step: number) => Promise<void>;
}

const MeetSponsorForm: React.FC<MeetSponsorFormProps> = ({
  initialStep,
  onSubmit,
}) => {
  const [step, setStep] = useState(initialStep);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(step);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      <RatsNumericInput
        label="step.question"
        minimumValue={1}
        maximumValue={12}
        field={{ name: "step", value: step }}
        customHandleChange={setStep}
      />
      <RatsButton
        testID="submit-step-button"
        title="SUBMIT"
        onPress={handlePress}
        disabled={isSubmitting}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

interface ChangeSponsorFormProps {
  initialName: string;
  onSubmit: (name: string) => Promise<void>;
}

const ChangeSponsorForm: React.FC<ChangeSponsorFormProps> = ({
  initialName,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(name);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      <RatsTextInput
        testID="sponsor-name-input"
        placeholder="sponsor name"
        label="new.sponsor.label"
        field={{ name: "primarySupporterName", value: name }}
        customHandleChange={setName}
      />
      <RatsButton
        testID="submit-sponsor-name-button"
        title="SUBMIT"
        onPress={handlePress}
        disabled={isSubmitting}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

const GuestSupporterSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 2 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();
  const updateGuestMutation = useUpdateGuest();

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
  } = useStatSummary("metPrimarySupporter");

  const sponsorName = useMemo(() => {
    return guest?.primarySupporterName || "No Sponsor Assigned";
  }, [guest?.primarySupporterName]);

  const currentStep = guest?.step || 1;

  const renderHelp = () => {
    showPopover(
      "SPONSOR",
      "Here you can view information and requirements related to this resident's sponsor."
    );
  };

  const submitMeetSponsor = async (step: number) => {
    if (!guest) return;
    try {
      await updateGuestMutation.mutateAsync({
        guest,
        updatedGuest: { id: guest.id, step },
      });
      dismissFormModal();
      Alert.alert("Done", "Step updated!");
    } catch (error) {
      logException(error, "Failed to update guest's step");
      Alert.alert("Error", "Could not update step. Please try again.");
    }
  };

  const showMeetSponsorModal = () => {
    showFormModal(
      <MeetSponsorForm
        initialStep={currentStep}
        onSubmit={submitMeetSponsor}
      />,
      "sponsor.modal.title",
      true
    );
  };

  const submitChangeSponsor = async (name: string) => {
    if (!guest || !name.trim()) return;
    try {
      await updateGuestMutation.mutateAsync({
        guest,
        updatedGuest: { id: guest.id, primarySupporterName: name.trim() },
      });
      dismissFormModal();
      Alert.alert("Done", "Sponsor updated!");
    } catch (error) {
      logException(error, "Failed to update guest's sponsor");
      Alert.alert("Error", "Could not update sponsor. Please try again.");
    }
  };

  const showChangeSponsorModal = () => {
    showFormModal(
      <ChangeSponsorForm
        initialName={guest?.primarySupporterName || ""}
        onSubmit={submitChangeSponsor}
      />,
      "change.sponsor.modal.title",
      true
    );
  };

  const renderStatDetails = () => {
    if (!guest || !house) return <></>;

    return (
      <RatsStatCard
        headerItems={[
          <View key="1">
            <RatsText
              key="1"
              translate={false}
              text={sponsorName}
              style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
            />
            <RatsText
              key="2"
              translate={false}
              text={`Step ${currentStep}`}
              style={{
                fontSize: fontSize.regular_medium,
                color: color.dark_grey,
              }}
            />
          </View>,
        ]}
      >
        <View style={{ width: "100%" }}>
          <RatsText
            text="You must meet with your sponsor at least once a week for a minimum of 15 minutes or longer."
            translate={false}
            style={{
              fontSize: fontSize.medium,
              paddingVertical: normalize(10),
            }}
          />
          <ActionButtons
            leftButtonLabel="CHANGE SPONSOR"
            rightButtonLabel="MEET SPONSOR"
            leftButtonOnPress={showChangeSponsorModal}
            rightButtonOnPress={showMeetSponsorModal}
            user={user}
            house={house}
            guestUserId={guest.userId}
            leftButtonTestID="change-sponsor-button"
            rightButtonTestID="meet-sponsor-button"
          />
        </View>
      </RatsStatCard>
    );
  };

  return (
    <StatSummaryScreen
      testID="supporter-summary-screen"
      stat="metPrimarySupporter"
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
 * Changes:
 * - Removed legacy getGuestReports dispatch (was reading from 'guest-reports' collection)
 * - Bar graph data now sourced from useWeekSummaryHistory inside useStatSummary
 */
export default GuestSupporterSummary;
