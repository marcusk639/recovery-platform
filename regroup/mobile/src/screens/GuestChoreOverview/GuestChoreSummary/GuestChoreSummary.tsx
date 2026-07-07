/**
 * GuestChoreSummary - Migrated to Redux Toolkit
 *
 * Changes from original:
 * - Class component -> Functional component
 * - Uses custom useStatSummary hook instead of BaseStatSummary class
 * - Uses StatSummaryScreen component for rendering
 * - Uses RTK slices for Redux state
 * - Removed connect() HOC
 */

import React, { useMemo, useState, useCallback } from "react";
import { View, Alert } from "react-native";
import { launchImageLibrary } from "react-native-image-picker";

// Hooks
import { useStatSummary } from "../../../hooks/useStatSummary";

// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withStatUpdateModal, withPopover
// Added: useModal, useNotification hooks

// Components
import StatSummaryScreen, {
  ActionButtons,
} from "../../../components/StatSummaryScreen";
import { RatsStatCard } from "../../../components/rats-stat-card";
import { RatsText } from "../../../components/rats-text";
import RatsPicker from "../../../components/rats-picker/rats-picker";
import RatsButton from "../../../components/rats-button/rats-button";
import { useModal, useNotification } from "../../../context";

// Utils
import { fontSize, normalize, fontFamily } from "../../../styles/theme";

// Services & queries
import { uploadChoreEvidencePhoto } from "../../../services/storage";
import { useLogNewActivity } from "../../../state/queries/activityQueries";
import { useUpdateGuest } from "../../../state/queries/guestQueries";
import { ActivityType } from "../../../entities/ActivityModel";
import { auth } from "../../../../firebase-setup";
import { logException } from "../../../util/logging";

// Navigation
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../navigation/types";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

// Hardened 2026-07-06: this modal used to render a bare Formik <Field
// component={RatsPicker} .../> with no <Formik> provider anywhere in the
// tree (ModalContext renders form-modal content directly) — Formik's
// useField() throws outside Formik context, crashing the whole app to the
// top-level ErrorBoundary the moment CHANGE CHORE was pressed. RatsPicker
// already supports a non-Formik mode via `handleValueChange`, so this is a
// standalone, independently-mounted local-state component instead — the
// same pattern as GuestMedicationSummary's MedicationForm. A standalone
// component (not inline JSX built from the outer screen's useState) is
// required because showFormModal stores whatever element it's given as a
// frozen snapshot in ModalContext; the outer screen re-rendering doesn't
// re-render that snapshot.
interface ChoreSelectFormProps {
  chores: Record<string, unknown>;
  initialChore: string;
  onSubmit: (choreName: string) => Promise<void>;
}

const ChoreSelectForm: React.FC<ChoreSelectFormProps> = ({
  chores,
  initialChore,
  onSubmit,
}) => {
  const [chore, setChore] = useState(initialChore);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(chore);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      <View testID="chore-select-picker">
        <RatsPicker
          field={{ name: "chore", value: chore }}
          form={{}}
          handleValueChange={setChore}
          label="New Chore"
          pickerItems={chores}
          getPickerItems={(items: Record<string, unknown>) =>
            Object.keys(items).map((name) => ({
              key: name,
              label: name,
              value: name,
            }))
          }
        />
      </View>
      <RatsButton
        testID="submit-chore-change-button"
        title="SAVE"
        onPress={handlePress}
        disabled={isSubmitting}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

/**
 * GuestChoreSummary Component
 */
const GuestChoreSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 2 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();

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
  } = useStatSummary("choreCompleted");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const logActivity = useLogNewActivity();
  const updateGuestMutation = useUpdateGuest();

  const choreName = useMemo(() => {
    return guest?.currentChore || "Weekly Chore";
  }, [guest?.currentChore]);

  const choreDescription = useMemo(() => {
    return (
      house?.chores?.[choreName]?.description ||
      "Complete your assigned chore for this week."
    );
  }, [house?.chores, choreName]);

  // Two-step complete flow: optional photo then activity log
  const handleCompleteChore = useCallback(async () => {
    if (!guest || !house) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Step 1: Optional photo
      let photoUrl: string | undefined;

      await new Promise<void>((resolve) => {
        Alert.alert(
          "Attach Photo?",
          "Would you like to attach a photo as evidence?",
          [
            {
              text: "Skip",
              style: "cancel",
              onPress: () => resolve(),
            },
            {
              text: "Add Photo",
              onPress: async () => {
                const result = await launchImageLibrary({
                  mediaType: "photo",
                  quality: 0.7,
                  selectionLimit: 1,
                });

                if (result.assets && result.assets[0]?.uri) {
                  const uri = result.assets[0].uri;
                  const tempId = `${guest.id}_${Date.now()}`;
                  try {
                    photoUrl = await uploadChoreEvidencePhoto(
                      uri,
                      house.id,
                      tempId
                    );
                  } catch (uploadError) {
                    logException(uploadError);
                    // Photo upload failed — continue without photo
                  }
                }
                resolve();
              },
            },
          ]
        );
      });

      // Step 2: Log chore activity
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");

      await logActivity.mutateAsync({
        guestId: guest.id,
        houseId: house.id,
        type: ActivityType.CHORE,
        data: {
          type: "chore",
          choreType: "weekly",
          choreName: choreName,
          ...(photoUrl ? { photoUrl } : {}),
        },
        loggedBy: currentUser.uid,
      });

      Alert.alert("Done", "Chore marked as complete!");
    } catch {
      Alert.alert("Error", "Could not complete chore. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [guest, house, choreName, isSubmitting, logActivity]);

  // Modal handlers
  const showChoreCompletedModal = handleCompleteChore;

  const submitChoreChange = async (newChore: string) => {
    if (!guest || !newChore) return;
    try {
      await updateGuestMutation.mutateAsync({
        guest,
        updatedGuest: { id: guest.id, currentChore: newChore },
      });
      dismissFormModal();
      Alert.alert("Done", "Chore updated!");
    } catch (error) {
      logException(error, "Failed to update guest's chore");
      Alert.alert("Error", "Could not update chore. Please try again.");
    }
  };

  const showChoreChangedModal = () => {
    if (!house) return;
    showFormModal(
      <ChoreSelectForm
        chores={house.chores ?? {}}
        initialChore={choreName}
        onSubmit={submitChoreChange}
      />,
      "change.chore.modal.title",
      true
    );
  };

  // Help popover
  const renderHelp = () => {
    showPopover(
      "CHORE",
      "Here you can view information related to this resident's chore."
    );
  };

  // Stat details content
  const renderStatDetails = () => {
    if (!house || !guest) return <></>;

    return (
      <RatsStatCard
        headerItems={[
          <RatsText
            key={choreName}
            translate={false}
            text={choreName}
            style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
          />,
        ]}
      >
        <View style={{ width: "100%" }}>
          <RatsText
            text={choreDescription}
            translate={false}
            style={{
              fontSize: fontSize.medium,
              paddingVertical: normalize(10),
            }}
          />
          <ActionButtons
            leftButtonLabel="CHANGE CHORE"
            rightButtonLabel="COMPLETE CHORE"
            leftButtonOnPress={showChoreChangedModal}
            rightButtonOnPress={showChoreCompletedModal}
            user={user}
            house={house}
            guestUserId={guest.userId}
            leftButtonTestID="change-chore-button"
            rightButtonTestID="complete-chore-button"
          />
        </View>
      </RatsStatCard>
    );
  };

  return (
    <StatSummaryScreen
      testID="chore-summary-screen"
      stat="choreCompleted"
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
export default GuestChoreSummary;
