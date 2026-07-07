import React, { useEffect, useCallback, useMemo } from "react";
// Phase 3.3: Migrated from 4 HOC layers to Context hooks
// Removed: withNotifier, withLoadingModal, withFormModal, withPopover
// Added: useModal, useNotification hooks
import AvatarItem from "../../components/avatar-item";
import { useModal, useNotification } from "../../context";
import { Guest } from "../../entities/Guest";
import { Guests } from "../../types";
import { House } from "../../entities/House";
import { User } from "../../entities/User";
import Admin from "../../entities/Admin";
import { TouchableOpacity, View } from "react-native";
import {
  ROW,
  normalize,
  color,
  fontSize,
  CARD_STYLE,
  CARD_NO_ELEVATION,
} from "../../styles/theme";
import { RatsIcon } from "../../components/rats-icon";
import { RatsText } from "../../components/rats-text";
import { map } from "lodash";
import RatsButton from "../../components/rats-button/rats-button";
import RatsScrollView from "../../components/rats-scroll-view";
import { Routes, RootStackParamList } from "../../navigation/types";
import { MiscellaneousHouseForm } from "./MiscellaneousHouseForm";
import { logout as logoutThunk } from "../../state/slices/userSlice";
import { useUpdateHouse } from "../../state/queries/houseQueries";
import { setInApp } from "../../state/slices/setupSlice";
import * as uuid from "uuid";
import { Complaint } from "../../entities/Complaint";
import { HouseIssue } from "../../entities/Issue";
import { createBugReport, createFeedback } from "../../services/feedback";
import { BugReport } from "../../entities/BugReport";
import { Feedback } from "../../entities/Feedback";
import { getCurrentTime } from "../../util/display";
import RatsLoadingIndicator from "../../components/rats-loading-indicator/rats-loading-indicator";
import { isDemo } from "../../util/user";
import { logException } from "../../util/logging";
// Import removed - unsubscribeAllChats does not exist in message service
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { useGuests } from "../../state/queries/guestQueries";

interface PersonalProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Personal Screen
 *
 * User profile and settings screen with logout, complaint filing, and feedback.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 15+ 'as any' casts)
 *
 * @migrated Phase 3.3 - Replaced HOCs with Context hooks
 * Changes:
 * - Removed 4 HOC layers (withNotifier, withLoadingModal, withFormModal, withPopover)
 * - Added useModal and useNotification hooks
 */
const PersonalScreen: React.FC<PersonalProps> = ({ navigation }) => {
  // Context hooks (replaces 4 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { notify, showPopover } = useNotification();

  const dispatch = useAppDispatch();

  // RTK Typed Selectors (no more 'as any')
  const guest = useAppSelector((state) => state.guests.userAsGuest);
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? "");
  const user = useAppSelector((state) => state.user.user);
  const admin = useAppSelector((state) => state.admin.userAsAdmin);

  // House updates via React Query mutation (updatingHouse* slice fields
  // were removed in Phase C — reading them here used to silently evaluate
  // to undefined, leaving the update flow's loading/success state broken).
  const updateHouseMutation = useUpdateHouse();
  const userLoading = useAppSelector((state) => state.user.loading);
  const userUpdatingSuccessful = useAppSelector(
    (state) => state.user.updatingSuccessful
  );
  const updating = updateHouseMutation.isPending || userLoading;
  // Hardened 2026-07-05: this only read the legacy Redux error fields, never
  // updateHouseMutation.isError — since house updates moved to this React
  // Query mutation, state.houses.error is never set by it, so this "Action
  // Failed" banner could never fire for a failed complaint/issue update.
  const updatingFailed =
    useAppSelector(
      (state) => state.houses.error !== null || state.user.error !== null
    ) || updateHouseMutation.isError;
  const updatingSuccessful =
    updateHouseMutation.isSuccess || userUpdatingSuccessful;
  const loggingOut = useAppSelector((state) => state.user.loggingOut);
  const loggingIn = useAppSelector((state) => state.user.loading);
  const loggingOutSuccessful = useAppSelector(
    (state) => state.user.loggingOutSuccessful
  );

  const logout = useCallback(async () => {
    return dispatch(logoutThunk());
  }, [dispatch]);

  const updateHouse = useCallback(
    async (houseId: string, updates: any) => {
      return updateHouseMutation.mutateAsync({ houseId, values: updates });
    },
    [updateHouseMutation]
  );

  const initInAppSetup = useCallback(() => {
    return dispatch(setInApp(true));
  }, [dispatch]);

  useEffect(() => {
    if (updatingSuccessful) {
      notify(
        "Action Successful",
        "Action was successfully processed",
        [],
        "succeed"
      );
    }
  }, [updatingSuccessful, notify]);

  useEffect(() => {
    if (updatingFailed) {
      notify("Action Failed", "Something went wrong.", [], "fail");
    }
  }, [updatingFailed, notify]);

  const fileComplaint = useCallback(() => {
    showFormModal(
      <MiscellaneousHouseForm
        house={house || undefined}
        fieldName="complaint"
        dismissModal={dismissFormModal}
        onSubmit={async (values) => {
          let plaintiffType;
          if (guest) {
            plaintiffType = "guest";
          }
          if (admin) {
            plaintiffType = admin.superAdmin ? "superAdmin" : "admin";
          }
          const id = uuid.v4();
          const complaint: Complaint = {
            id,
            plaintiff: guest ? guest.id : admin?.id || "",
            plaintiffType: plaintiffType as
              | "admin"
              | "superAdmin"
              | "guest"
              | "supporter"
              | "anonymous",
            description: values.complaint,
            reply: "",
            houseId: house?.id || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          try {
            await updateHouse(house?.id || "", {
              complaints: { ...house?.complaints, [id]: complaint },
            });
          } catch (error) {
            // The "Action Failed" toast fires via the updatingFailed effect
            // below, which now reflects updateHouseMutation.isError.
            logException(error, "Failed to file complaint");
          }
        }}
        header="File Complaint"
      />,
      "File Complaint",
      true
    );
  }, [showFormModal, house, dismissFormModal, guest, admin, updateHouse]);

  const houseMaintenance = useCallback(() => {
    showFormModal(
      <MiscellaneousHouseForm
        house={house || undefined}
        fieldName="issue"
        dismissModal={dismissFormModal}
        onSubmit={async (values) => {
          const id = uuid.v4();
          const issue = new HouseIssue(
            id,
            values.type || "house",
            values.issue,
            guest ? guest.id : admin?.id || "",
            false
          );
          try {
            await updateHouse(house?.id || "", {
              issues: {
                ...house?.issues,
                [id]: { ...issue, houseId: house?.id || "" },
              },
            });
          } catch (error) {
            // The "Action Failed" toast fires via the updatingFailed effect
            // below, which now reflects updateHouseMutation.isError.
            logException(error, "Failed to log house issue");
          }
        }}
        header="House Issue"
      />,
      "House Issue",
      true
    );
  }, [showFormModal, house, dismissFormModal, guest, admin, updateHouse]);

  const reportBug = useCallback(() => {
    showFormModal(
      <MiscellaneousHouseForm
        house={house || undefined}
        fieldName="description"
        dismissModal={dismissFormModal}
        fieldPlaceholder="Please describe the bug..."
        onSubmit={async (values) => {
          const id = uuid.v4();
          const report: BugReport = {
            id,
            description: values.description,
            reporter: user?.uid || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          try {
            await createBugReport(report);
          } catch (error) {
            logException(error, "Failed to submit bug report");
            notify(
              "Action Failed",
              "Failed to submit the bug report. Please try again later.",
              [],
              "fail"
            );
          }
        }}
        header="Bug Report"
      />,
      "Bug Report",
      true
    );
  }, [showFormModal, house, dismissFormModal, user]);

  const sendFeedback = useCallback(() => {
    showFormModal(
      <MiscellaneousHouseForm
        house={house || undefined}
        fieldName="description"
        dismissModal={dismissFormModal}
        fieldPlaceholder="Please enter your feedback..."
        onSubmit={async (values) => {
          const id = uuid.v4();
          const feedback: Feedback = {
            id,
            description: values.description,
            reviewer: user?.uid || "",
            type: "house",
            houseId: house?.id || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          try {
            await createFeedback(feedback);
          } catch (error) {
            logException(error, "Failed to submit feedback");
            notify(
              "Action Failed",
              "Failed to submit your feedback. Please try again later.",
              [],
              "fail"
            );
          }
        }}
        header="Send Feedback"
      />,
      "Send Feedback",
      true
    );
  }, [showFormModal, house, dismissFormModal, user]);

  const signOut = useCallback(async () => {
    try {
      // Unsubscribe from chat listeners would happen here if available
      navigation.navigate(Routes.PriorAuth);
      await logout();
    } catch (error) {
      logException(error, "Failed to sign out from Personal screen");
    }
  }, [logout, navigation]);

  const OPTIONS = useMemo(
    () => ({
      fileComplaint: {
        icon: "exclamation-triangle",
        action: fileComplaint,
        label: "File complaint",
      },
      houseMaintenance: {
        icon: "wrench",
        action: houseMaintenance,
        label: "Log house issue",
      },
      reportBug: {
        icon: "bug",
        action: reportBug,
        label: "Report bug",
      },
      sendFeedback: {
        icon: "reply",
        action: sendFeedback,
        label: "Send feedback",
      },
      notifications: {
        icon: "bell",
        action: () => navigation.navigate(Routes.Notifications),
        label: "Notifications",
      },
      settings: {
        icon: "user-edit",
        action: () => navigation.navigate(Routes.EditUserInfo),
        label: "My Profile",
      },
      addHouse: {
        icon: "plus",
        action: () => {
          if (isDemo(user?.email || "")) {
            return showPopover(
              "Add Home",
              "This functionality is disabled in demo mode."
            );
          }
          initInAppSetup();
          navigation.navigate(Routes.InAppOrgSetup);
        },
        label: "Add Home",
        disabled: !admin || !admin.superAdmin,
      },
      twoFactorSetup: {
        icon: "shield-alt",
        action: () => navigation.navigate(Routes.TwoFactorSetup),
        label: "Two-Factor Authentication",
        disabled: !admin,
      },
    }),
    [
      fileComplaint,
      houseMaintenance,
      reportBug,
      sendFeedback,
      navigation,
      user,
      admin,
      showPopover,
      initInAppSetup,
    ]
  );

  const renderAvatarHeader = () => {
    const _user = admin || guest;
    return (
      <AvatarItem
        container={CARD_STYLE}
        avatarStyle={{ height: normalize(45), width: normalize(45) }}
        nameStyle={{ fontSize: fontSize.medium_large }}
        subTextStyle={{ fontSize: fontSize.regular_medium }}
        name={_user ? _user.firstName + " " + _user.lastName : " "}
        type={user && user.isAdmin ? "Admin" : "Guest"}
        avatarUrl={_user?.avatar || ""}
      />
    );
  };

  const renderOptions = () => {
    return map(OPTIONS, (option, key) => {
      const { locked, disabled } = option as any;
      if (!disabled) {
        return (
          <TouchableOpacity
            activeOpacity={locked ? 1.0 : 0.2}
            key={option.label}
            onPress={option.action}
            style={[
              ROW,
              CARD_NO_ELEVATION,
              {
                paddingHorizontal: normalize(20),
                paddingVertical: normalize(17),
                alignItems: "center",
                marginBottom: 2,
              },
            ]}
          >
            <RatsIcon
              name={option.icon}
              size={normalize(20)}
              style={{ color: color.black, marginRight: normalize(20) }}
            />
            <RatsText
              text={option.label}
              style={{ fontSize: fontSize.medium }}
            />
            {locked && (
              <RatsIcon
                name="lock"
                size={normalize(20)}
                style={{ color: color.dark_grey, marginLeft: "auto" }}
              />
            )}
          </TouchableOpacity>
        );
      }
    });
  };

  const renderLogoutButton = () => {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <RatsButton
          testID="logout-button"
          onPress={signOut}
          title="LOG OUT"
          containerStyle={{
            backgroundColor: color.red,
            borderColor: color.red,
            width: "90%",
            alignSelf: "center",
          }}
        />
      </View>
    );
  };

  if (loggingIn || loggingOut || loggingOutSuccessful || !user || !house) {
    return <RatsLoadingIndicator />;
  }

  return (
    <RatsScrollView
      testID="profile-screen"
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: color.light_grey,
      }}
      behavior="height"
    >
      {renderAvatarHeader()}
      {renderOptions()}
      {renderLogoutButton()}
    </RatsScrollView>
  );
};

export default PersonalScreen;
