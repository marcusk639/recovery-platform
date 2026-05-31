/**
 * GuestWorkSummary - Migrated to Redux Toolkit
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Field } from 'formik';

// Hooks
import { useStatSummary } from '../../../hooks/useStatSummary';

// Components
import StatSummaryScreen, {
  ActionButtons,
} from '../../../components/StatSummaryScreen';
import { RatsStatCard } from '../../../components/rats-stat-card';
import { RatsText } from '../../../components/rats-text';
import RatsTextInput from '../../../components/rats-text-input/rats-text-input';
import RatsPicker from '../../../components/rats-picker/rats-picker';
// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withStatUpdateModal, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../../context';

// Types
import Job, { jobItems } from '../../../entities/Job';

// Utils
import { renderGuestJobs, renderWorkHoursInput } from '../../../util/guest';
import { getPickerItems } from '../../../util/display';
import { getAddressDisplay } from '../../../util/address';
import {
  fontSize,
  normalize,
  CARD_STYLE,
  fontFamily,
} from '../../../styles/theme';

// Navigation
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../navigation/types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const GuestWorkSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 2 HOC layers)
  const { showFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

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
  } = useStatSummary('hoursWorked');

  const renderHelp = () => {
    showPopover(
      'WORK',
      "Here you can view this resident's workplaces and requirements.",
    );
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
          }}>
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
            text={getAddressDisplay(selectedJob.street || '')}
            style={{ fontSize: fontSize.medium }}
          />
          <RatsText
            translate={false}
            text={getAddressDisplay(
              selectedJob.street || '',
              selectedJob.city || '',
              selectedJob.state || '',
              selectedJob.zip || '',
            )}
            style={{ fontSize: fontSize.medium }}
          />
        </View>
        {renderWorkHoursInput(selectedJob)}
      </View>,
      'work.modal.title',
      true,
    );
  };

  const showAddJobModal = () => {
    if (!guest) return;
    const jobsLength = (guest.jobs && guest.jobs.length) || 0;

    showFormModal(
      <View>
        <Field
          address={false}
          styleType="secondary"
          component={RatsTextInput}
          placeholder="Employer"
          name={`jobs[${jobsLength}].employer`}
          label="Employer"
          keyboardType="default"
        />
        <Field
          address={true}
          styleType="secondary"
          component={RatsTextInput}
          placeholder="Address"
          currentLocation={false}
          name={`jobs[${jobsLength}]`}
          label="Address"
          keyboardType="default"
          pathToAddress={`jobs[${jobsLength}].`}
        />
        <Field
          component={RatsPicker}
          name="type"
          label="Type"
          items={getPickerItems(jobItems, undefined, true)}
        />
      </View>,
      'add.new.job',
      true,
    );
  };

  const renderStatDetails = () => {
    if (!guest || !house) return <></>;

    const buttonDisabled = selectedJob === null;

    return (
      <RatsStatCard
        contentContainerStyle={{
          alignItems: 'center',
          justifyContent: 'center',
        }}
        headerItems={[
          <RatsText
            key="1"
            translate={false}
            text="Work"
            style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
          />,
        ]}>
        <View style={{ width: '100%' }}>
          <View style={{ paddingVertical: normalize(10), width: '100%' }}>
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
