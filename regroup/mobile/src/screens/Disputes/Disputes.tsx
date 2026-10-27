// Phase 3.3: Migrated from 4 HOC layers to Context hooks
// Removed: withNotifier, withLoadingModal, withFormModal, withPopover
// Added: useModal, useNotification hooks
// Phase 1.2: Migrated to Activity system - uses useActivities hook
import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
import { color } from '../../styles/theme';
import { useModal, useNotification } from '../../context';
import { useAppSelector } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests } from '../../state/queries/guestQueries';
import { useBaseActivityScreen } from '../../hooks/useBaseActivityScreen';
import {
  RenderSearch,
  RenderModal,
  RenderActivities,
} from '../Activity/BaseActivityScreen';
import { ActivityFilterForm } from '../Activity/ActivityFilterForm';
import { ActivityStatus, isLegacyUpheld } from '../../entities/ActivityModel';
import { useLiveHouseDisputes } from '../../hooks/useLiveHouseDisputes';
import { User } from '../../entities/User';
import { useActivities, useCurrentWeek } from '../../hooks/activity';

const Disputes: React.FC = () => {
  // Context hooks (replaces 4 HOC layers)
  const { showFormModal, dismissFormModal, setLoadingModalState } = useModal();
  const { notify, showPopover, setPopoverRef } = useNotification();

  // Redux selectors (RTK)
  const { guest: selectedGuest } = useSelectedGuest();
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const user = useAppSelector(state => state.user.user);
  const userAsAdmin = useAppSelector(state => state.admin.userAsAdmin);
  const admins = useAppSelector(state => state.admin.admins);

  // Get current and previous week dates for activity queries
  const { startDate, endDate } = useCurrentWeek();
  const previousWeekStart = useMemo(() => {
    const date = new Date(startDate + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - 7);
    return date.toISOString().split('T')[0];
  }, [startDate]);

  // Fetch DISPUTED activities from new Activity system (current + previous week)
  const {
    activities: disputedActivitySystemActivities,
    loading: activitiesLoading,
  } = useActivities({
    houseId: house?.id,
    startDate: previousWeekStart, // Start from previous week
    endDate, // End at current week
    status: ActivityStatus.DISPUTED, // Only disputed activities
    limit: 500,
  });
  // ...and the decided ones in the same window, so an admin can undo a
  // decision (UNDO DECISION reopens it; APPROVE / REJECT then show again).
  const { activities: decidedActivities } = useActivities({
    houseId: house?.id,
    startDate: previousWeekStart,
    endDate,
    status: ActivityStatus.RESOLVED,
    limit: 500,
  });

  // ...and older builds' "delete" resolutions (deleted, resolved at
  // loggedAt), which an admin can undo too.
  const { activities: deletedActivities } = useActivities({
    houseId: house?.id,
    startDate: previousWeekStart,
    endDate,
    status: ActivityStatus.DELETED,
    limit: 500,
  });

  const activities = useMemo(
    () => [
      ...disputedActivitySystemActivities,
      ...decidedActivities,
      ...deletedActivities.filter(isLegacyUpheld),
    ],
    [disputedActivitySystemActivities, decidedActivities, deletedActivities],
  );

  // The server-owned live list (house-disputes/{houseId}); house.disputes is
  // an untrusted legacy mirror.
  const disputes = useLiveHouseDisputes(house?.id);

  // All hooks must be called unconditionally (Rules of Hooks).
  // Pass safe defaults when required state is missing.
  const activityScreen = useBaseActivityScreen({
    guest: selectedGuest || undefined,
    house: house || ({} as any),
    user: (user as User) || ({} as any),
    guests,
    activities,
    disputes,
    userAsAdmin: userAsAdmin || undefined,
    admins,
  });

  // Guard return AFTER all hooks
  if (!house || !user?.id) {
    return null;
  }

  const renderHelp = useCallback(() => {
    showPopover(
      'DISPUTES',
      'Here you can view current disputes and recent decisions. Owners, managers and peer leaders can approve a dispute (the activity is marked as not done) or reject it (the activity stands), and undo a decision to reopen the dispute.',
    );
  }, [showPopover]);

  const openFilters = useCallback(() => {
    showFormModal(
      <ActivityFilterForm
        dismissModal={dismissFormModal}
        guests={guests}
        setSearchFilters={activityScreen.setSearchFilters}
        filters={activityScreen.filters}
      />,
    );
  }, [
    showFormModal,
    dismissFormModal,
    guests,
    activityScreen.setSearchFilters,
    activityScreen.filters,
  ]);

  const filteredActivities = activityScreen.filterActivitiesByType('all', true);

  return (
    <View
      style={{ flex: 1, backgroundColor: color.light_grey }}
      testID="disputes-screen">
      <RenderModal
        modalVisible={activityScreen.modalVisible}
        modalType={activityScreen.modalType}
        selectedActivity={activityScreen.selectedActivity}
        guests={guests}
        getIconForActivity={activityScreen.getIconForActivity}
        dismissModal={activityScreen.dismissModal}
        handleDisputeSubmission={async values => {
          const success = await activityScreen.handleDisputeSubmission(values);
          if (success) {
            if (activityScreen.modalType === 'confirm') {
              notify(
                'Dispute Challenged',
                'Successfully challenged dispute',
                [],
                'succeed',
              );
            } else {
              notify(
                'Activity Disputed',
                'Successfully disputed activity',
                [],
                'succeed',
              );
            }
          }
          return success;
        }}
        setModalShowing={showing => {
          if (showing) {
            setLoadingModalState(true, false, 'Loading...');
          } else {
            setLoadingModalState(false, false, '');
          }
        }}
      />
      <ScreenHeader
        container={{ marginBottom: 1 }}
        renderBackButton
        icon={<HelpIcon helpFn={renderHelp} setRef={setPopoverRef} />}
        header="Disputes"
      />
      <RenderSearch
        searchTerm={activityScreen.searchTerm}
        setSearchTerm={activityScreen.setSearchTerm}
        onFilter={openFilters}
        placeholder="Search disputes..."
      />
      <RenderActivities
        activities={filteredActivities}
        disputesOnly={true}
        guests={guests}
        admins={admins}
        disputes={disputes}
        houseId={house?.id || ''}
        userIsAdmin={user?.isAdmin || false}
        getIconForActivity={activityScreen.getIconForActivity}
        getLeftButtonProps={activityScreen.getLeftButtonProps}
        getRightButtonProps={activityScreen.getRightButtonProps}
      />
    </View>
  );
};

export default Disputes;
