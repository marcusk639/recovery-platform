//@ts-nocheck
// Phase 3.3: Migrated from withFormModal + withLoadingModal HOCs to useModal hook
// Removed: withFormModal, withLoadingModal HOCs
// Added: useModal hook for modal and loading state functionality
import React, { useCallback, useMemo, useEffect } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useModal } from "../../context";
import { houseKeys, useUpdateHouse } from "../../state/queries/houseQueries";
import ScreenHeader from "../../components/screen-header";
import Section from "../../components/rats-interactable-section";
import { House } from "../../entities/House";

import { color, CARD_STYLE, SAVE_BUTTON, normalize } from "../../styles/theme";
import { HouseSetup } from "../SetupWizards/HouseSetup";
import {
  updateHouseData as updateSetupHouse,
  startHouseSetup,
} from "../../state/slices/setupSlice";
import map from "lodash/map";
import cloneDeep from "lodash/cloneDeep";
import ChoreSetup from "../SetupWizards/ChoreSetup";
import ManagerSettings from "./ManagerSettings";
import AdminManagement from "./AdminManagement";
import { ContainerizedButton } from "../../components/containerized-button";
import RatsButton from "../../components/rats-button/rats-button";
import { SafeAreaView } from "react-native-safe-area-context";
import { PhaseConfigSetup } from "../SetupWizards/PhaseSetup/PhaseConfigSetup";
import ManagerSetupProps from "../SetupWizards/ManagerSetupEntity";
import { Guests, Admins } from "../../types";
import GuestSetup from "../SetupWizards/GuestSetup";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { useGuests } from "../../state/queries/guestQueries";
import { Routes, RootStackParamList } from "../../navigation/types";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * House Settings Screen
 *
 * Allows managers to configure house details, chores, phases, and manager permissions.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * @migrated Phase 3.3 - Replaced HOCs with useModal hook
 * Changes:
 * - Removed old Redux action imports (houseActions, setupActions)
 * - Added RTK imports from housesSlice and setupSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 7 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 3 dispatch calls with RTK thunks (.unwrap() for error handling)
 * - Removed withFormModal and withLoadingModal HOCs
 * - Added useModal hook for modal state management
 */
const HouseSettings: React.FC<Props> = (props) => {
  // Context hooks
  const { showFormModal, dismissFormModal, setLoadingModalState } = useModal();

  const { navigation } = props;

  const dispatch = useAppDispatch();
  const { house, houseId } = useSelectedHouse();
  const queryClient = useQueryClient();

  // Refetch on focus so returning from a sub-screen that mutated settings
  // shows fresh data instead of the RQ-cached pre-edit value.
  useFocusEffect(
    useCallback(() => {
      if (houseId) {
        queryClient.invalidateQueries({ queryKey: houseKeys.detail(houseId) });
      }
    }, [houseId, queryClient])
  );

  const selectedHouse = useAppSelector(
    (state) => state.setup?.selectedHouse || house
  );
  const selectedPhase = useAppSelector((state) => state.setup?.selectedPhase);
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? "");
  const admins = useAppSelector((state) => state.admin.selectedAdmins);
  const updateHouseMutation = useUpdateHouse();
  // Hardened 2026-07-05: this previously read `updateHouseSettings` from
  // housesSlice, which does not export any such thunk — dispatching it threw
  // `TypeError: updateHouseSettings is not a function` on every House
  // Details/Chores/Phases/Guests/Managers save, masked by the file's
  // `@ts-nocheck`. useUpdateHouse is the real, already-wired React Query
  // mutation for houseService.updateHouse (the same Firestore write houses
  // already use elsewhere post-guests-migration).
  const updatingHouse = updateHouseMutation.isPending;
  const updatingHouseSuccessful = updateHouseMutation.isSuccess;
  const updatingHouseFailed = updateHouseMutation.isError;
  const error = updateHouseMutation.error;

  const initializeHouseSetup = useCallback(() => {
    dispatch(startHouseSetup({ house, guests, admins }));
  }, [house, guests, admins, dispatch]);

  const handleHouseSubmission = useCallback(
    async (values: House) => {
      dismissFormModal();
      dispatch(updateSetupHouse(values));
      await updateHouseMutation.mutateAsync({
        houseId: values.id,
        values,
      });
      initializeHouseSetup();
    },
    [dismissFormModal, dispatch, updateHouseMutation, initializeHouseSetup]
  );

  const handlePhaseSubmit = useCallback(async () => {
    dismissFormModal();
    await updateHouseMutation.mutateAsync({
      houseId: selectedHouse.id,
      values: { phases: selectedHouse.phases },
    });
    initializeHouseSetup();
  }, [
    dismissFormModal,
    selectedHouse,
    updateHouseMutation,
    initializeHouseSetup,
  ]);

  const handleGuestSubmission = useCallback(
    async (values: House) => {
      const houseClone = cloneDeep(selectedHouse);
      const guestEmails = values.guestEmails.slice();
      if (guestEmails && guestEmails.length) {
        houseClone.pendingGuestInvites = houseClone.pendingGuestInvites
          ? [...houseClone.pendingGuestInvites, ...guestEmails]
          : guestEmails;
        houseClone.pendingGuestInvites = Array.from(
          new Set(houseClone.pendingGuestInvites)
        );
      }
      return handleHouseSubmission({ ...houseClone });
    },
    [selectedHouse, handleHouseSubmission]
  );

  const cancel = useCallback(() => {
    initializeHouseSetup();
    dismissFormModal();
  }, [initializeHouseSetup, dismissFormModal]);

  const setupProps = useCallback(() => {
    return {
      selectedHouse: house,
      handleSubmit: handleHouseSubmission,
      onSubmit: handleGuestSubmission,
      forSettings: true,
      onPrevPress: cancel,
      handlePhaseSubmit: handlePhaseSubmit,
      handleChoreSubmit: handleHouseSubmission,
      initializeHouseSetup: initializeHouseSetup,
    };
  }, [
    house,
    handleHouseSubmission,
    handleGuestSubmission,
    cancel,
    handlePhaseSubmit,
    initializeHouseSetup,
  ]);

  const startChoreSetup = useCallback(() => {
    showFormModal(<ChoreSetup {...setupProps()} />, null, true);
  }, [showFormModal, setupProps]);

  const startPhaseSetup = useCallback(() => {
    showFormModal(<PhaseConfigSetup {...setupProps()} />, null, true);
  }, [showFormModal, setupProps]);

  const startHouseSetupModal = useCallback(() => {
    showFormModal(<HouseSetup {...setupProps()} />, null, true);
  }, [showFormModal, setupProps]);

  const SETTINGS = useMemo(
    () => ({
      details: {
        action: startHouseSetupModal,
        label: "Details",
        description: "Update basic info about your house",
        iconName: "cog",
        color: color.medium_grey,
      },
      chores: {
        action: startChoreSetup,
        label: "Chores",
        description: "Add, update, or remove chores",
        iconName: "dolly",
        color: color.medium_grey,
      },
      manager: {
        action: () =>
          showFormModal(<ManagerSettings {...setupProps()} />, null, true),
        label: "Managers",
        description: "Add or remove managers",
        iconName: "gavel",
        color: color.medium_grey,
      },
      adminManagement: {
        action: () =>
          showFormModal(
            <AdminManagement navigation={navigation} />,
            null,
            true
          ),
        label: "Admin Management",
        description: "View, invite, and remove admins",
        iconName: "user-shield",
        color: color.medium_grey,
      },
      phases: {
        action: startPhaseSetup,
        label: "Phases",
        description: "Add, update, or remove phases",
        iconName: "wrench",
        color: color.medium_grey,
      },
      guests: {
        action: () =>
          showFormModal(<GuestSetup {...setupProps()} />, null, true),
        label: "Guests",
        description: "Invite new guests",
        iconName: "user",
        color: color.medium_grey,
      },
      payments: {
        action: () => navigation.navigate(Routes.StripeSettings),
        label: "Payments",
        description: "Connect Stripe to accept rent payments",
        iconName: "credit-card",
        color: color.medium_grey,
      },
      paymentDashboard: {
        action: () => navigation.navigate(Routes.PaymentDashboard),
        label: "Payment Dashboard",
        description: "View all resident payment activity",
        iconName: "chart-bar",
        color: color.medium_grey,
      },
      reports: {
        action: () => navigation.navigate(Routes.AdminReport),
        label: "Reports",
        description: "View occupancy, compliance trends, and discharge summary",
        iconName: "chart-line",
        color: color.medium_grey,
      },
      shiftLog: {
        action: () =>
          navigation.navigate(Routes.StaffNotes, {
            houseId: house!.id,
            type: "shift_log",
          }),
        label: "Shift Log",
        description: "Private notes between staff shifts",
        iconName: "clipboard-list",
        color: color.medium_grey,
      },
    }),
    [
      startHouseSetupModal,
      startChoreSetup,
      startPhaseSetup,
      showFormModal,
      setupProps,
      navigation,
    ]
  );

  useEffect(() => {
    initializeHouseSetup();
  }, []);

  useEffect(() => {
    setLoadingModalState(
      updatingHouse,
      updatingHouseSuccessful,
      "Processing...",
      error ? "Something went wrong" : null
    );
  }, [
    updatingHouse,
    updatingHouseSuccessful,
    updatingHouseFailed,
    error,
    setLoadingModalState,
  ]);

  useEffect(() => {
    if (house) {
      initializeHouseSetup();
    }
  }, [house?.id]);

  return (
    <View
      style={{ flex: 1, backgroundColor: color.light_grey }}
      testID="house-settings-screen"
    >
      <ScreenHeader header="House Settings" />
      {map(SETTINGS, (setting, key) => {
        return (
          <Section
            key={setting.label}
            boxedIconColor={color.dark_grey}
            boxedIconName={setting.iconName}
            name={setting.label}
            description={setting.description}
            iconBackgroundColor={setting.color}
            onPress={setting.action}
            testID={
              key === "manager"
                ? "managers-section"
                : key === "guests"
                ? "manage-guests-button"
                : undefined
            }
          />
        );
      })}
      <View
        style={[
          CARD_STYLE,
          { marginTop: "auto", paddingVertical: normalize(30) },
        ]}
      >
        <RatsButton
          onPress={navigation.goBack}
          title="Done"
          containerStyle={SAVE_BUTTON}
        />
      </View>
    </View>
  );
};

export default HouseSettings;
