/**
 * GuestWorkSummary - Migrated to Redux Toolkit
 */

import React, { useState } from "react";
import { View, Alert } from "react-native";
import * as uuid from "uuid";

// Hooks
import { useStatSummary } from "../../../hooks/useStatSummary";

// Components
import StatSummaryScreen, {
  ActionButtons,
} from "../../../components/StatSummaryScreen";
import { RatsStatCard } from "../../../components/rats-stat-card";
import { RatsText } from "../../../components/rats-text";
import RatsTextInput from "../../../components/rats-text-input/rats-text-input";
import RatsPicker from "../../../components/rats-picker/rats-picker";
import RatsNumericInput from "../../../components/rats-numeric-input";
import RatsButton from "../../../components/rats-button/rats-button";
// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withStatUpdateModal, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from "../../../context";

// Types
import Job, { jobItems } from "../../../entities/Job";
import {
  ActivityType,
  ActivityDataFactory,
} from "../../../entities/ActivityModel";

// Services & queries
import { auth } from "../../../../firebase-setup";
import { useLogNewActivity } from "../../../state/queries/activityQueries";
import { useUpdateGuest } from "../../../state/queries/guestQueries";
import { logException } from "../../../util/logging";

// Utils
import { renderGuestJobs } from "../../../util/guest";
import { getAddressDisplay } from "../../../util/address";
import {
  fontSize,
  normalize,
  CARD_STYLE,
  fontFamily,
} from "../../../styles/theme";

// Navigation
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../navigation/types";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

// Hardened 2026-07-06: both modals used to render bare Formik <Field .../>
// elements (via renderWorkHoursInput and inline Field components) with no
// <Formik> provider anywhere in the tree — ModalContext renders form-modal
// content directly, so Formik's useField() threw the moment either modal was
// opened, crashing to the top-level ErrorBoundary. Neither had a working
// submit path either way (no onSubmit was ever wired up). Standalone
// local-state components, matching GuestMedicationSummary's MedicationForm —
// required (not just convenient) because showFormModal stores whatever
// element it's given as a frozen snapshot in ModalContext; the outer
// screen's state updates don't re-render that snapshot.
interface AddHoursFormProps {
  onSubmit: (hours: number) => Promise<void>;
}

const AddHoursForm: React.FC<AddHoursFormProps> = ({ onSubmit }) => {
  const [hours, setHours] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(hours);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      <RatsNumericInput
        label="Hours"
        maximumValue={80}
        field={{ name: "hours", value: hours }}
        customHandleChange={setHours}
      />
      <RatsButton
        testID="submit-hours-button"
        title="SUBMIT"
        onPress={handlePress}
        disabled={isSubmitting}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

interface AddJobFormProps {
  onSubmit: (job: {
    employer: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    type: Job["type"];
  }) => Promise<void>;
}

const AddJobForm: React.FC<AddJobFormProps> = ({ onSubmit }) => {
  const [employer, setEmployer] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [type, setType] = useState<Job["type"]>("work");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({ employer, street, city, state, zip, type });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      <RatsTextInput
        testID="job-employer-input"
        placeholder="Employer"
        label="Employer"
        field={{ name: "employer", value: employer }}
        customHandleChange={setEmployer}
      />
      <RatsTextInput
        testID="job-street-input"
        placeholder="Street"
        label="Street"
        field={{ name: "street", value: street }}
        customHandleChange={setStreet}
      />
      <RatsTextInput
        testID="job-city-input"
        placeholder="City"
        label="City"
        field={{ name: "city", value: city }}
        customHandleChange={setCity}
      />
      <RatsTextInput
        testID="job-state-input"
        placeholder="State"
        label="State"
        field={{ name: "state", value: state }}
        customHandleChange={setState}
      />
      <RatsTextInput
        testID="job-zip-input"
        placeholder="Zip"
        label="Zip"
        field={{ name: "zip", value: zip }}
        customHandleChange={setZip}
      />
      <View testID="job-type-picker">
        <RatsPicker
          field={{ name: "type", value: type }}
          form={{}}
          handleValueChange={setType}
          label="Type"
          pickerItems={jobItems}
          getPickerItems={(items: Record<string, string>) =>
            Object.keys(items).map((key) => ({
              key,
              label: key,
              value: items[key],
            }))
          }
        />
      </View>
      <RatsButton
        testID="submit-job-button"
        title="SUBMIT"
        onPress={handlePress}
        disabled={isSubmitting || !employer.trim()}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

const GuestWorkSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 2 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const logActivity = useLogNewActivity();
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
  } = useStatSummary("hoursWorked");

  const renderHelp = () => {
    showPopover(
      "WORK",
      "Here you can view this resident's workplaces and requirements."
    );
  };

  const submitAddHours = async (hours: number) => {
    if (!guest || !house || !selectedJob || !hours) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      await logActivity.mutateAsync({
        guestId: guest.id,
        houseId: house.id,
        type: ActivityType.WORK,
        data: ActivityDataFactory.work(
          selectedJob.employer,
          hours,
          selectedJob.id
        ),
        loggedBy: currentUser.uid,
      });
      dismissFormModal();
      Alert.alert("Done", "Hours logged!");
    } catch (error) {
      logException(error, "Failed to log work hours activity");
      Alert.alert("Error", "Could not log hours. Please try again.");
    }
  };

  const showAddHoursModal = () => {
    if (!selectedJob) return;

    showFormModal(
      <View>
        <View
          style={{
            ...CARD_STYLE,
            paddingVertical: normalize(20),
            paddingHorizontal: normalize(10),
            marginBottom: 2,
          }}
        >
          <RatsText
            translate={false}
            text={selectedJob.employer}
            style={{
              fontSize: fontSize.medium,
              fontFamily: fontFamily.bold,
              marginBottom: normalize(5),
            }}
          />
          <RatsText
            translate={false}
            text={getAddressDisplay(selectedJob.street || "")}
            style={{ fontSize: fontSize.medium }}
          />
          <RatsText
            translate={false}
            text={getAddressDisplay(
              selectedJob.street || "",
              selectedJob.city || "",
              selectedJob.state || "",
              selectedJob.zip || ""
            )}
            style={{ fontSize: fontSize.medium }}
          />
        </View>
        <AddHoursForm onSubmit={submitAddHours} />
      </View>,
      "work.modal.title",
      true
    );
  };

  const submitAddJob = async (job: {
    employer: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    type: Job["type"];
  }) => {
    if (!guest || !job.employer.trim()) return;

    try {
      const newJob = new Job();
      newJob.id = uuid.v4() as string;
      newJob.employer = job.employer.trim();
      newJob.street = job.street.trim();
      newJob.city = job.city.trim();
      newJob.state = job.state.trim();
      newJob.zip = job.zip.trim();
      newJob.type = job.type;

      await updateGuestMutation.mutateAsync({
        guest,
        updatedGuest: {
          id: guest.id,
          jobs: [...(guest.jobs ?? []), newJob],
        },
      });
      dismissFormModal();
      Alert.alert("Done", "Job added!");
    } catch (error) {
      logException(error, "Failed to add guest job");
      Alert.alert("Error", "Could not add job. Please try again.");
    }
  };

  const showAddJobModal = () => {
    if (!guest) return;

    showFormModal(<AddJobForm onSubmit={submitAddJob} />, "add.new.job", true);
  };

  const renderStatDetails = () => {
    if (!guest || !house) return <></>;

    const buttonDisabled = selectedJob === null;

    return (
      <RatsStatCard
        contentContainerStyle={{
          alignItems: "center",
          justifyContent: "center",
        }}
        headerItems={[
          <RatsText
            key="1"
            translate={false}
            text="Work"
            style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
          />,
        ]}
      >
        <View style={{ width: "100%" }}>
          <View style={{ paddingVertical: normalize(10), width: "100%" }}>
            {renderGuestJobs(guest, setSelectedJob, selectedJob || new Job())}
          </View>
          <ActionButtons
            leftButtonLabel="ADD HOURS"
            rightButtonLabel="ADD JOB"
            leftButtonOnPress={showAddHoursModal}
            rightButtonOnPress={showAddJobModal}
            user={user}
            house={house}
            guestUserId={guest.userId}
            leftButtonProps={{ disabled: buttonDisabled }}
            leftButtonTestID="add-hours-button"
            rightButtonTestID="add-job-button"
          />
        </View>
      </RatsStatCard>
    );
  };

  return (
    <StatSummaryScreen
      testID="work-summary-screen"
      stat="hoursWorked"
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
export default GuestWorkSummary;
