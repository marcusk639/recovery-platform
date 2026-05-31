/**
 * GuestMedicationSummary - Migrated to Redux Toolkit
 */

import React from 'react';
import { View } from 'react-native';

// Hooks
import { useStatSummary } from '../../../hooks/useStatSummary';

// Components
import StatSummaryScreen, {
  ActionButtons,
} from '../../../components/StatSummaryScreen';
import { RatsStatCard } from '../../../components/rats-stat-card';
import { RatsText } from '../../../components/rats-text';
// Phase 3.3: Migrated from 1 HOC layer to Context hooks
// Removed: withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../../context';

// Utils
import { getPhaseRule } from '../../../util/guest';
import { fontSize, normalize, fontFamily } from '../../../styles/theme';

// Navigation
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../navigation/types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const GuestMedicationSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 1 HOC layer)
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
  } = useStatSummary('medication');

  const renderHelp = () => {
    showPopover(
      'MEDICATION',
      "Here you can view this resident's medication tracking.",
    );
  };

  const showLogMedicationModal = () => {
    showFormModal(<View />, 'Log Medication', true);
  };

  const showChangeMedicationModal = () => {
    showFormModal(<View />, 'Update Medication Info', true);
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
        ]}>
        <View style={{ width: '100%' }}>
          <RatsText
            text={
              getPhaseRule(house, guest, 'medication') > 0
                ? 'You must take your prescribed medications daily as required.'
                : 'No medication requirements set for your current phase.'
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
