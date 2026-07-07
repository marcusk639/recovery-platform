import React from "react";
/**
 * HousesOverview - Migrated to React Query + Redux Toolkit
 *
 * Changes from original:
 * - Class component → Functional component with hooks
 * - Redux connect → React Query + useAppSelector
 * - Manual loading state → Automatic from React Query
 * - Simplified data flow and state management
 */

// Phase 3.3: Migrated from withPopover HOC to useNotification hook
import { useNotification } from "../../context";
import { StyleSheet, View } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

// Hooks
import { useHousesByAdmin } from "../../state/queries";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { selectHouseById } from "../../state/slices/housesSlice";

// Components
import RatsLoadingIndicator from "../../components/rats-loading-indicator/rats-loading-indicator";
import RatsScrollView from "../../components/rats-scroll-view";
import ScreenHeader from "../../components/screen-header";
import Section from "../../components/rats-interactable-section";
import HelpIcon from "../../components/help-icon";
import { RatsText } from "../../components/rats-text";
import {
  WithPopoverProps,
  withPopover,
} from "../../components/rats-hoc/withPopover";

// Types & Entities
import Admin from "../../entities/Admin";
import { User } from "../../entities/User";

// Utils
import { getHouseActionItems, countHouseActionItems } from "../../util/house";
import { getAddressDisplay } from "../../util/address";
import { ANDROID } from "../../util/platform";
import { color, normalize, fontFamily } from "../../styles/theme";

// Styles
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    backgroundColor: color.light_grey,
  },
});

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * HousesOverview - Displays list of houses managed by the admin
 *
 * Uses React Query to fetch house data with:
 * - Automatic loading states
 * - Automatic error handling
 * - Automatic caching and background refetching
 */
const HousesOverview: React.FC<Props> = ({ navigation }) => {
  // Context hook
  const { showPopover, setPopoverRef } = useNotification();
  const dispatch = useAppDispatch();

  // Get current user/admin from Redux
  const user = useAppSelector((state: any) => state.user.user);
  const admin = useAppSelector((state: any) => state.admin);

  // Fetch houses for this admin using React Query
  // Automatically handles loading, error, caching
  const {
    data: housesData,
    isLoading,
    isError,
    error,
  } = useHousesByAdmin(user?.uid || "", !!user?.uid);

  // Convert houses object to array for rendering
  const houses = housesData ? Object.values(housesData) : [];

  // Handle house selection
  const selectHouse = (houseId: string) => {
    if (!housesData) return;

    // Hardened 2026-07-06: this used to dispatch a raw {type: 'SELECT_HOUSE'}
    // action that no reducer handled — a real dispatch, but a complete no-op
    // for changing the selected house. useSelectedHouse() reads
    // state.houses.selectedHouseId, which only the real selectHouseById
    // reducer sets (same pattern HouseSearchScreen.tsx already uses
    // correctly).
    dispatch(selectHouseById(houseId));
    navigation.pop();
  };

  // Render help popover
  const handleSetPopover = () => {
    showPopover(
      "HOUSE LIST",
      "Select one of your houses to view and manage that house."
    );
  };

  // Render individual house sections
  const renderHouseSections = () => {
    if (!housesData) return null;

    return houses.map((house) => {
      const itemCount = countHouseActionItems(house);
      return (
        <Section
          testID={`house-option-${house.id}`}
          forceAvatar
          key={house.id}
          avatar={house.avatar}
          name={house.name}
          description={getAddressDisplay(
            house.street,
            house.city,
            house.state,
            undefined
          )}
          iconBackgroundColor={color.green_blue}
          onPress={() => selectHouse(house.id)}
          icon={
            itemCount ? (
              <View
                style={{
                  backgroundColor: color.red,
                  height: normalize(25),
                  width: normalize(25),
                  borderRadius: normalize(12.5),
                  borderColor: color.red,
                  borderWidth: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  marginLeft: "auto",
                  paddingBottom: ANDROID ? normalize(2) : 0,
                }}
              >
                <RatsText
                  text={itemCount}
                  style={{ color: color.white, fontFamily: fontFamily.bold }}
                />
              </View>
            ) : null
          }
        />
      );
    });
  };

  // Loading state - React Query handles this automatically
  if (isLoading || !user) {
    return <RatsLoadingIndicator />;
  }

  // Error state - React Query handles this automatically
  if (isError) {
    return (
      <RatsScrollView contentContainerStyle={styles.container}>
        <ScreenHeader
          renderBackButton
          icon={<HelpIcon helpFn={handleSetPopover} setRef={setPopoverRef} />}
          header="My Houses"
        />
        <View style={{ marginTop: 20 }}>
          <RatsText text="Failed to load houses" style={{ color: color.red }} />
          {/* Could add retry button here */}
        </View>
      </RatsScrollView>
    );
  }

  // Main render
  return (
    <RatsScrollView
      testID="house-list-modal"
      contentContainerStyle={styles.container}
      behavior="height"
    >
      {/******************************* HEADER *******************************/}
      <ScreenHeader
        renderBackButton
        icon={<HelpIcon helpFn={handleSetPopover} setRef={setPopoverRef} />}
        header="My Houses"
      />

      {/******************************* HOUSE LIST *******************************/}
      {renderHouseSections()}
    </RatsScrollView>
  );
};

export default HousesOverview;
