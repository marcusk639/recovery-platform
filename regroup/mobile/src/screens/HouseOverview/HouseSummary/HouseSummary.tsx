/**
 * HouseSummary - Migrated to Functional Component
 *
 * Phase 3.3: Migrated from withRats + withAdminResolver + withPopover HOCs to Context hooks
 * - Removed: withRats, withAdminResolver, withPopover HOCs
 * - Added: useNotification hook for popover functionality
 * - Data resolution now handled via Redux state only (resolver logic unnecessary)
 *
 * Previous changes:
 * - Class component -> Functional component
 * - Uses useAppSelector for Redux state
 * - Uses React Query hooks for additional data fetching where beneficial
 */

import React from 'react';
import { size } from 'lodash';
import { View } from 'react-native';

// Hooks
import { useGuests } from '../../../state/queries';
import { useHouseApplications } from '../../../state/queries/applicationQueries';
import { useAppSelector } from '../../../state/store';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useNotification } from '../../../context';
import { useAutoAdvanceRotation } from '../../../hooks/useAutoAdvanceRotation';

// Components
import RatsScrollView from '../../../components/rats-scroll-view';
import { RatsText } from '../../../components/rats-text';
import RatsLoadingIndicator from '../../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../../components/screen-header';
import { RatsIcon, ClickableIcon } from '../../../components/rats-icon';
import WeekStatSummary from '../../../components/week-stat-summary';
import Section from '../../../components/rats-interactable-section';
import { Can } from '../../../components/auth';

// Types & Entities
import { House } from '../../../entities/House';
import { User } from '../../../entities/User';
import { Guests } from '../../../types';
import { Health } from '../../../constants/health';

// Utils
import { normalize, fontSize, color, ROW } from '../../../styles/theme';
import { HEALTH_ICON_MAP, HEALTH_STATUS_MAP } from '../../../util/guest';
import {
  getHousePercentage,
  countOpenIssues,
  countOpenDisputes,
  countBeds,
} from '../../../util/house';
import { isDemo } from '../../../util/user';

// Navigation
import { Routes, RootStackParamList } from '../../../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Context
import { AuthConsumer } from '../../../context/auth';

// Styles
import styles from '../../Profile/ProfileStyles';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Render health description row
 */
const HealthDescription: React.FC<{ health: Health }> = ({ health }) => {
  return (
    <View style={{ ...ROW, alignItems: 'center' }}>
      <RatsIcon
        name={HEALTH_ICON_MAP[health]}
        solid
        size={normalize(15)}
        style={{ color: color.dark_grey, marginRight: normalize(20) }}
      />
      <RatsText
        text={HEALTH_STATUS_MAP[health]}
        style={{ fontSize: fontSize.regular, color: color.dark_grey }}
      />
    </View>
  );
};

/**
 * HouseSummary Component - House overview with health score and quick actions
 *
 * Uses Redux state and React Query hooks for data:
 * - Redux state provides house, user, and loading states
 * - React Query hooks provide cached guest data with automatic refetch
 * - useNotification hook provides popover functionality
 */
const HouseSummary: React.FC<Props> = ({ navigation }) => {
  // Context hooks
  const { showPopover } = useNotification();

  // Get data from Redux
  const { house } = useSelectedHouse();
  const user = useAppSelector((state: any) => state.user.user) as User | null;
  const requestingHouses = useAppSelector(
    (state: any) => state.houses.requestingHouses,
  ) as boolean;
  const requestingAdmin = useAppSelector(
    (state: any) => state.admin.requestingAdmin,
  ) as boolean;
  // Auto-advance chore rotation if a new week has started
  useAutoAdvanceRotation(house?.id ?? '');

  // React Query is the sole source of truth for guests; the Redux
  // state.guests.guests slot was a dead fallback (cacheGuests was never
  // dispatched). See .full-review/01-quality-architecture.md [A2].
  const { data: queryGuests } = useGuests(house?.id || '', !!house?.id);

  // Fetch pending application count for operator badge
  const { data: appList } = useHouseApplications(house?.id || '', !!house?.id);
  const pendingCount = (appList ?? []).filter(
    (a: { status: string }) => a.status === 'pending',
  ).length;

  const selectedGuests: Guests = queryGuests || {};

  // Show popover for demo mode
  const showDemoPopover = () => {
    showPopover(
      'House Settings',
      'House details and operations can be modified in house settings.\n\nThis feature is disabled in demo mode.',
    );
  };

  // Loading state
  if (requestingHouses || requestingAdmin || !house) {
    return <RatsLoadingIndicator />;
  }

  // Calculate house stats
  const disputeNumber = countOpenDisputes(house);
  const issuesNumber = countOpenIssues(house);
  const beds = countBeds(house.rooms);

  return (
    <RatsScrollView
      testID="main-app-screen"
      contentContainerStyle={styles.container}>
      {/******************************* HEADER *******************************/}
      <ScreenHeader
        renderHouseButton
        clickableHouseButton={!!(user && user.isAdmin)}
        icon={
          <AuthConsumer>
            {({ token }) => (
              <Can
                role={token.role[house.id]}
                action="house:full-edit"
                yes={() => (
                  <ClickableIcon
                    containerProps={{
                      testID: 'house-settings-button',
                      onPress: () =>
                        user && isDemo(user.email)
                          ? showDemoPopover()
                          : navigation.navigate(Routes.HouseSettings),
                    }}
                    iconProps={{
                      size: normalize(25),
                      name: 'cog',
                      style: { color: color.baby_blue },
                    }}
                  />
                )}
                no={() => null}
              />
            )}
          </AuthConsumer>
        }
        header={house.name}
      />

      {/******************************* HEALTH SCORE ********************************/}
      <WeekStatSummary
        percentage={getHousePercentage(house, selectedGuests)}
        header="HEALTH SCORE"
        rightSideContainer={{
          justifyContent: 'flex-start',
          alignItems: 'center',
        }}
        rightSideContent={
          <View style={{ flex: 1, justifyContent: 'space-between' }}>
            <HealthDescription health="super happy" />
            <HealthDescription health="happy" />
            <HealthDescription health="neutral" />
            <HealthDescription health="sad" />
          </View>
        }
      />

      {/******************************* SECTIONS *********************************/}
      <Section
        name="Beds"
        description={`${beds.used} of ${beds.max} beds filled`}
        boxedIconName="bed"
        iconBackgroundColor={color.green_blue}
        onPress={() => navigation.navigate(Routes.Beds)}
      />
      <Section
        testID="house-disputes-button"
        name="Disputes"
        description={`${disputeNumber} open ${
          disputeNumber === 1 ? 'dispute' : 'disputes'
        }`}
        boxedIconName="exclamation-triangle"
        iconBackgroundColor={color.red}
        onPress={() => navigation.navigate(Routes.HouseDisputes)}
        notifications={disputeNumber}
      />
      <Section
        name="Issues"
        description={`${issuesNumber} open ${
          issuesNumber === 1 ? 'issue' : 'issues'
        }`}
        boxedIconName="wrench"
        iconBackgroundColor={color.dark_blue}
        onPress={() => navigation.navigate(Routes.Issues)}
        notifications={issuesNumber}
      />
      <Section
        name="Complaints"
        description={`${size(house.complaints)} ${
          size(house.complaints) === 1 ? 'complaint' : 'complaints'
        }`}
        boxedIconName="thumbs-down"
        iconBackgroundColor={color.light_purple}
        onPress={() => navigation.navigate(Routes.Complaints)}
        notifications={size(house.complaints)}
      />
      <Section
        name="Meetings"
        description="Meeting finder"
        boxedIconName="user-friends"
        iconBackgroundColor={color.cobalt}
        onPress={() => navigation.navigate(Routes.MeetingSearch)}
      />
      <Section
        name="Drug Testing"
        description="Log and review drug test results"
        boxedIconName="vial"
        iconBackgroundColor={color.dark_blue}
        onPress={() => navigation.navigate(Routes.DrugTesting)}
      />
      <Section
        name="Resident Intake"
        description="Onboard a new resident"
        boxedIconName="clipboard-list"
        iconBackgroundColor={color.green}
        onPress={() =>
          navigation.navigate(Routes.ResidentIntake, { houseId: house.id })
        }
      />
      <Section
        name="Applications"
        description="Review resident applications"
        boxedIconName="file-alt"
        iconBackgroundColor={color.cobalt}
        notifications={pendingCount}
        onPress={() => navigation.navigate(Routes.ApplicationList)}
      />
      {house.houseType === 'oxford' && (
        <>
          <Section
            name="Oxford House Hub"
            description="Dashboard — officers, meetings, elections, EES"
            boxedIconName="home"
            iconBackgroundColor={color.main}
            onPress={() => navigation.navigate(Routes.OxfordDashboard)}
          />
          <Section
            name="Officers"
            description="Manage elected officers"
            boxedIconName="star"
            iconBackgroundColor={color.yellow}
            onPress={() => navigation.navigate(Routes.OfficerManagement)}
          />
          <Section
            name="Equal Expense Share"
            description="Track weekly expense share"
            boxedIconName="dollar-sign"
            iconBackgroundColor={color.green}
            onPress={() => navigation.navigate(Routes.EESTracker)}
          />
          <Section
            name="Business Meetings"
            description="Schedule and manage meetings"
            boxedIconName="calendar-alt"
            iconBackgroundColor={color.cobalt}
            onPress={() => navigation.navigate(Routes.BusinessMeetings)}
          />
          <Section
            name="Voting"
            description="Democratic voting (80% threshold)"
            boxedIconName="vote-yea"
            iconBackgroundColor={color.purple}
            onPress={() => navigation.navigate(Routes.OxfordVoting)}
          />
        </>
      )}
      <AuthConsumer>
        {({ token }) => (
          <Can
            role={token.role[house.id]}
            action="house:full-edit"
            yes={() => (
              <Section
                testID="manage-guests-button"
                name="Manage Guests"
                description="View and manage residents"
                boxedIconName="users"
                iconBackgroundColor={color.green_blue}
                onPress={() => navigation.navigate(Routes.GuestList)}
              />
            )}
            no={() => null}
          />
        )}
      </AuthConsumer>
    </RatsScrollView>
  );
};

export default HouseSummary;
