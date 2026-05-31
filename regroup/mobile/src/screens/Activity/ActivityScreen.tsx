// Phase 3.3: Migrated from 5 HOC layers to Context hooks
// Removed: withRats, withLoadingModal, withFormModal, withPopover, withNotifier
// Added: useModal, useNotification hooks
// Phase 1.2: Migrated to Activity system - uses useActivities hook
import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { color } from '../../styles/theme';
import ScreenHeader from '../../components/screen-header';
import { RatsIcon } from '../../components/rats-icon';
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
} from './BaseActivityScreen';
import { ActivityFilterForm } from './ActivityFilterForm';
import { filterActivities } from '../../util/guest';
import { useActivities, useCurrentWeek } from '../../hooks/activity';

/**
 * Activity Screen
 *
 * Displays all activities (meetings, work, chores) for guests in the house.
 * Allows filtering, searching, and disputing activities.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * @migrated Phase 3.3 - Replaced 5 HOC layers with Context hooks
 */
const ActivityScreen: React.FC = () => {
  // Context hooks (replaces 5 HOC layers)
  const { showFormModal, dismissFormModal, setLoadingModalState } = useModal();
  const { notify, showPopover, setPopoverRef } = useNotification();

  // Redux selectors
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

  // Fetch activities from new Activity system (current + previous week)
  const { activities: activitySystemActivities, loading: activitiesLoading } =
    useActivities({
      houseId: house?.id,
      startDate: previousWeekStart, // Start from previous week
      endDate, // End at current week
      limit: 500, // Increase limit to get more activities
    });

  const activities = activitySystemActivities;

  const disputes = house?.disputes || {};

  // Use base activity screen hook
  const activityScreen = useBaseActivityScreen({
    guest: selectedGuest ?? undefined,
    house: house as any,
    user: user as any,
    guests,
    activities,
    disputes,
    userAsAdmin: userAsAdmin ?? undefined,
    admins,
  });

  const renderHelp = useCallback(() => {
    showPopover?.(
      'ACTIVITY LOG',
      'Here you can view all activity recent by residents within the house. Any activities related to resident requirements can be disputed.',
    );
  }, [showPopover]);

  const openFilters = useCallback(() => {
    showFormModal?.(
      <ActivityFilterForm
        dismissModal={dismissFormModal || (() => {})}
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

  const filteredActivities = useMemo(() => {
    const filtered = filterActivities(
      activities,
      activityScreen.filters,
      selectedGuest ?? undefined,
      activityScreen.searchTerm,
      'all',
      false,
    );
    filtered.sort((left, right) => {
      return (
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
    });
    return filtered;
  }, [
    activities,
    activityScreen.filters,
    selectedGuest,
    activityScreen.searchTerm,
  ]);

  return (
    <View
      style={{ flex: 1, backgroundColor: color.light_grey }}
      testID="activity-screen">
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
              notify?.(
                'Dispute Challenged',
                'Successfully challenged dispute',
                [],
                'succeed',
              );
            } else {
              notify?.(
                'Activity Disputed',
                'Successfully disputed activity',
                [],
                'succeed',
              );
            }
          }
          return success;
        }}
        setModalShowing={showing =>
          setLoadingModalState(showing, false, showing ? 'Loading...' : '')
        }
      />
      <ScreenHeader
        container={{ marginBottom: 1 }}
        icon={
          <TouchableOpacity
            ref={ref => setPopoverRef?.(ref)}
            onPress={renderHelp}>
            <RatsIcon
              name="question-circle"
              solid
              size={30}
              style={{ color: color.baby_blue }}
            />
          </TouchableOpacity>
        }
        header="Activity Feed"
      />
      <RenderSearch
        searchTerm={activityScreen.searchTerm}
        setSearchTerm={activityScreen.setSearchTerm}
        onFilter={openFilters}
      />
      <View testID="activities-list" style={{ flex: 1 }}>
        <RenderActivities
          activities={filteredActivities}
          disputesOnly={false}
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
    </View>
  );
};

export default ActivityScreen;
