import React, { useCallback, useMemo } from "react";
import { FlatList, ListRenderItemInfo, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
/**
 * GuestList - Migrated to React Query + Redux Toolkit
 *
 * Changes from original:
 * - Class component → Functional component
 * - Redux connect → React Query hooks
 * - Manual loading state → Automatic from React Query
 * - mapStateToProps → useAppSelector hook
 * - Action creators → React Query mutations
 */

// Phase 3.3: Migrated from withPopover HOC to useNotification hook
import { useNotification } from "../../context";
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

// Compliance
import { GuestComplianceDot } from "../../components/compliance-indicator";
import { useCurrentWeek } from "../../hooks/activity/useCurrentWeek";

// Hooks
import { useGuests } from "../../state/queries";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { selectGuestById } from "../../state/slices/guestsSlice";

// Types & Entities
import { House } from "../../entities/House";
import { User } from "../../entities/User";
import Admin from "../../entities/Admin";
import { Guest } from "../../entities/Guest";

// Components
import Section from "../../components/rats-interactable-section";
import RatsScrollView from "../../components/rats-scroll-view";
import ScreenHeader from "../../components/screen-header";
import HelpIcon from "../../components/help-icon";
import { RatsText } from "../../components/rats-text";

// Utils
import { getTodaysDate, getDateAndTime } from "../../util/display";
import {
  getHealthByPercentage,
  getOverallPercentage,
  HEALTH_ICON_MAP,
  HEALTH_COLOR_MAP,
} from "../../util/guest";
import { color } from "../../styles/theme";

// Styles
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    backgroundColor: color.light_grey,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: color.dark_grey,
    textAlign: "center",
    marginBottom: 16,
  },
  retryText: {
    color: color.baby_blue,
    fontWeight: "bold",
  },
  emptyText: {
    color: color.dark_grey,
    textAlign: "center",
    marginTop: 40,
  },
  activityIndicator: {
    marginTop: 40,
  },
});

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * GuestList Component - Displays list of guests in a house
 *
 * Uses React Query to fetch guest data automatically with:
 * - Automatic loading states
 * - Automatic error handling
 * - Automatic caching and refetching
 * - Optimistic updates support
 */
const GuestList: React.FC<Props> = ({ navigation }) => {
  // Context hook
  const { showPopover, setPopoverRef } = useNotification();
  const dispatch = useAppDispatch();

  // Get data from Redux (for selected house)
  const { house } = useSelectedHouse();

  // Current week start date — used to query compliance for each guest row
  const { startDate: weekStart } = useCurrentWeek();

  // Fetch guests using React Query
  // This automatically handles loading, error, and data states
  const {
    data: guestsData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useGuests(house?.id || "", !!house?.id);

  // Refetch on focus — the screen is a nav target reached from the
  // bottom tab, and RN has no window-focus bridge for RQ.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Memoize the derived array so children with React.memo can skip
  // re-renders when the underlying data is unchanged. Discharged residents
  // are excluded — they've completed/left the program and no longer belong
  // in the active-resident list (their record is retained, not deleted).
  const guests = useMemo(
    () =>
      guestsData
        ? Object.values(guestsData).filter(
            (guest) => guest.status !== "discharged",
          )
        : [],
    [guestsData],
  );

  // Handle guest selection — stable reference so Section rows memoize.
  const handleGuestSelect = useCallback(
    (guestId: string) => {
      dispatch(selectGuestById(guestId));
      navigation.goBack();
    },
    [dispatch, navigation],
  );

  // Render help popover
  const renderHelp = () => {
    showPopover(
      "RESIDENT LIST",
      "Here you can view and select any residents within the house.",
    );
  };

  // Render an individual guest row for the virtualized list
  const renderGuestItem = useCallback(
    ({ item: guest }: ListRenderItemInfo<Guest>) => {
      if (!house) return null;

      const healthScore = getHealthByPercentage(
        getOverallPercentage(guest, house, getTodaysDate()),
      );
      return (
        <Section
          testID="guest-list-item"
          forceAvatar
          avatar={guest.avatar}
          name={guest.firstName + " " + guest.lastName}
          description={getDateAndTime(
            guest.createdAt ?? guest.createdDate ?? new Date(),
            false,
          )}
          iconBackgroundColor={color.green_blue}
          onPress={() => handleGuestSelect(guest.id)}
          iconName={HEALTH_ICON_MAP[healthScore]}
          iconColor={HEALTH_COLOR_MAP[healthScore]}
          icon={
            house ? (
              <GuestComplianceDot
                guest={guest}
                house={house}
                weekStart={weekStart}
                testID={`compliance-dot-${guest.id}`}
              />
            ) : null
          }
        />
      );
    },
    [house, weekStart, handleGuestSelect],
  );

  const keyExtractor = useCallback((guest: Guest) => guest.id, []);

  // Loading state - React Query handles this automatically
  if (isLoading) {
    return (
      <RatsScrollView
        contentContainerStyle={styles.loadingContainer}
        testID="guest-list-loading"
      >
        <ScreenHeader
          renderBackButton
          icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
          header={house ? `${house.name} Guests` : "Loading..."}
        />
        <ActivityIndicator
          size="large"
          color={color.baby_blue}
          style={styles.activityIndicator}
        />
      </RatsScrollView>
    );
  }

  // Error state - React Query handles this automatically
  if (isError) {
    return (
      <RatsScrollView
        contentContainerStyle={styles.errorContainer}
        testID="guest-list-error"
      >
        <ScreenHeader
          renderBackButton
          icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
          header={house ? `${house.name} Guests` : "Error"}
        />
        <RatsText
          translate={false}
          text="Unable to load residents. Tap to retry."
          style={styles.errorText}
        />
        <TouchableOpacity onPress={() => refetch()}>
          <RatsText translate={false} text="Retry" style={styles.retryText} />
        </TouchableOpacity>
      </RatsScrollView>
    );
  }

  // Main render
  return (
    <FlatList
      testID="guest-list-screen"
      data={guests}
      renderItem={renderGuestItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
        />
      }
      ListHeaderComponent={
        /******************************* HEADER *******************************/
        <ScreenHeader
          renderBackButton
          icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
          header={house ? `${house.name} Guests` : "Guests"}
        />
      }
      ListEmptyComponent={
        <RatsText
          translate={false}
          text="No residents in this house yet."
          style={styles.emptyText}
        />
      }
    />
  );
};

export default GuestList;
