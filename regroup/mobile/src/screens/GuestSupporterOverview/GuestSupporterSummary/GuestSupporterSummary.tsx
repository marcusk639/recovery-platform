/**
 * GuestSupporterSummary - Migrated to Redux Toolkit
 */

import React, { useMemo } from 'react';
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
import RatsNumericInput from '../../../components/rats-numeric-input';
import RatsTextInput from '../../../components/rats-text-input/rats-text-input';
// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withStatUpdateModal, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../../context';

// Utils
import { renderField } from '../../../util/form';
import { normalize, fontSize, color, fontFamily } from '../../../styles/theme';

// Navigation
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../navigation/types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const GuestSupporterSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 2 HOC layers)
  const { showFormModal } = useModal();
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
  } = useStatSummary('metPrimarySupporter');

  const sponsorName = useMemo(() => {
    return guest?.primarySupporterName || 'No Sponsor Assigned';
  }, [guest?.primarySupporterName]);

  const currentStep = guest?.step || 1;

  const renderHelp = () => {
    showPopover(
      'SPONSOR',
      "Here you can view information and requirements related to this resident's sponsor.",
    );
  };

  const showMeetSponsorModal = () => {
    showFormModal(
      <Field
        name="step"
        component={RatsNumericInput}
        minimumValue={1}
        maximumValue={12}
        label="step.question"
      />,
      'sponsor.modal.title',
      true,
    );
  };

  const showChangeSponsorModal = () => {
    showFormModal(
      renderField(
        'primarySupporterName',
        'sponsor name',
        RatsTextInput,
        false,
        'new.sponsor.label',
        'string',
      ),
      'change.sponsor.modal.title',
      true,
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
        ]}>
        <View style={{ width: '100%' }}>
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
