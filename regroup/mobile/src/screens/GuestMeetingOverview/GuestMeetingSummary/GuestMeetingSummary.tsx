/**
 * GuestMeetingSummary - Migrated to Redux Toolkit
 *
 * Changes from original:
 * - Class component -> Functional component
 * - Uses custom useStatSummary hook instead of BaseStatSummary class
 * - Uses StatSummaryScreen component for rendering
 * - Uses RTK slices for Redux state
 * - Removed connect() HOC
 */

import React from 'react';
import { View } from 'react-native';

// Hooks
import { useStatSummary } from '../../../hooks/useStatSummary';

// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withStatUpdateModal, withPopover
// Added: useModal, useNotification hooks

// Components
import StatSummaryScreen, {
  ActionButtons,
} from '../../../components/StatSummaryScreen';
import { RatsStatCard } from '../../../components/rats-stat-card';
import { RatsText } from '../../../components/rats-text';
import { useModal, useNotification } from '../../../context';

// Utils
import { getPhaseRule } from '../../../util/guest';
import { fontSize, normalize, fontFamily } from '../../../styles/theme';

// Navigation
import { Routes, RootStackParamList } from '../../../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * GuestMeetingSummary Component
 */
const GuestMeetingSummary: React.FC<Props> = ({ navigation }) => {
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
  } = useStatSummary('meeting');

  // Help popover
  const renderHelp = () => {
    showPopover(
      'MEETINGS',
      'Here you can view meeting requirements and attendance for this resident.',
    );
  };

  // Stat details content
  const renderStatDetails = () => {
    if (!house || !guest) return <></>;

    return (
      <RatsStatCard
        headerItems={[
          <RatsText
            key="1"
            translate={false}
            text="Meetings"
            style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
          />,
        ]}>
        <View style={{ width: '100%' }}>
          <RatsText
            text={`You must attend at least ${getPhaseRule(
              house,
              guest,
              'meeting',
            )} recovery support meetings each week.`}
            translate={false}
            style={{
              fontSize: fontSize.medium,
              paddingVertical: normalize(15),
            }}
          />
          <ActionButtons
            leftButtonLabel="FIND MEETING"
            rightButtonLabel="CREATE MEETING"
            leftButtonOnPress={() => navigation.navigate(Routes.MeetingSearch)}
            rightButtonOnPress={() => navigation.navigate(Routes.NewMeeting)}
            user={user}
            house={house}
            guestUserId={guest.userId}
            leftButtonTestID="find-meeting-button"
            rightButtonTestID="create-meeting-button"
          />
        </View>
      </RatsStatCard>
    );
  };

  return (
    <StatSummaryScreen
      testID="meeting-summary-screen"
      stat="meeting"
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
export default GuestMeetingSummary;
