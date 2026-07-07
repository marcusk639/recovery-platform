import React from "react";
import { FormikProps, withFormik } from "formik";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { updateUser as updateUserRTK } from "../../state/slices/userSlice";
import { useUpdateGuest } from "../../state/queries/guestQueries";
import { useQueryClient } from "@tanstack/react-query";
import { guestKeys } from "../../state/queries/guestQueries";
import { useSelectedGuest } from "../../hooks/useSelectedGuest";
import { cloneDeep, isEmpty } from "lodash";
import NewAccountFormView from "./NewAccountFormView";
import { User } from "../../entities/User";
import { newAccountSchema } from "./NewAccountSchema";
import { Guest } from "../../entities/Guest";
import { mapUserToGuest } from "../../util/guest";
import { Invitation } from "../../entities/Invite";
import { Alert } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Routes, AuthScreenNavigationProp } from "../../navigation/types";
import { navigateToMainTab } from "../../navigation/authNavigation";
import { logDebug, logError } from "../../util/simple-debug-logger";
import { ComponentType } from "react";

export const initialValues: Partial<User> = {
  firstName: "",
  lastName: "",
  middleInitial: "",
  phoneNumber: "",
  gender: "male",
  ethnicity: "",
  dateOfBirth: "",
  ssn: "",
  maritalStatus: "single",
  housingStatus: "homeowner",
  infoEntered: true,
};

export interface NewAccountFormProps {
  user: User;
  updateUser: (user: User, values: Partial<User>) => any;
  updateGuest: (guest: Guest, clearCache?: boolean) => any;
  getGuest: (guestId: string) => any;
  invitation: Invitation;
  guest: Guest;
  navigation: AuthScreenNavigationProp;
}

const NewAccountForm = withFormik<NewAccountFormProps, Partial<User>>({
  mapPropsToValues: (props: NewAccountFormProps) => {
    return {
      ...initialValues,
      firstName: props.user.firstName,
      lastName: props.user.lastName,
      middleInitial: props.user.middleInitial,
      phoneNumber: props.user.phoneNumber,
      gender: props.user.gender,
      ethnicity: props.user.ethnicity,
      dateOfBirth: props.user.dateOfBirth,
      maritalStatus: props.user.maritalStatus,
      housingStatus: props.user.housingStatus,
    };
  },
  handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
    const { user } = props;
    const { updateUser, updateGuest, guest, invitation, getGuest } = props;
    setStatus({});
    setSubmitting(true);
    try {
      let selectedGuest =
        guest && !isEmpty(guest) ? guest : await getGuest(user.guestId);
      values.guestId = selectedGuest ? selectedGuest.id : "";
      values.infoEntered = true;
      const updatedUser = await updateUser(user, values);
      logDebug("NewAccountForm - updatedUser after updateUser:", updatedUser);
      logDebug("NewAccountForm - updatedUser.isGuest:", updatedUser?.isGuest);
      logDebug(
        "NewAccountForm - updatedUser.infoEntered:",
        updatedUser?.infoEntered
      );
      logDebug("NewAccountForm - updatedUser.guestId:", updatedUser?.guestId);

      if (user.isGuest) {
        const updatedGuest = mapUserToGuest(
          updatedUser as User,
          cloneDeep(selectedGuest as Guest)
        );
        // Await the updateGuest action - it now returns the updated guest
        // This ensures Redux state is fully updated before navigation
        await updateGuest(updatedGuest, false);
      }
      setSubmitting(false);

      // After successful form submission, navigate to the main app
      // This navigation happens after all state updates are complete
      logDebug("NewAccountForm - Form submission completed, user updated:", {
        isGuest: updatedUser!.isGuest,
        isAdmin: updatedUser!.isAdmin,
        infoEntered: updatedUser!.infoEntered,
      });

      // Navigate to the main app - this should happen after state updates
      // to prevent App.tsx from remounting the navigator and resetting navigation
      navigateToMainTab(
        props.navigation,
        updatedUser?.isGuest ? Routes.Guest : Routes.House
      );

      // The navigation will be handled by the App component's re-render
      // when the user state is updated in Redux
    } catch (error) {
      setSubmitting(false);
      setStatus({ failed: true });
      logError("NewAccountForm - error:", error);
      // Alert.alert('Something went wrong. Please try again later.');
    }
  },
  // validationSchema: newAccountSchema
})(NewAccountFormView as any);

/**
 * New Account Form Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (guestActions)
 * - Added RTK imports: updateGuest, getGuest from guestsSlice
 * - Updated Props interface to use generic function types
 * - Removed spread of old actions, now passes RTK thunks directly
 */
const NewAccountFormWrapper: React.FC<any> = (props) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);
  const invitation = useAppSelector((state) => state.user.invitation);
  const { guest } = useSelectedGuest();
  const { mutateAsync: updateGuestMutation } = useUpdateGuest();
  const queryClient = useQueryClient();

  return (
    <NewAccountForm
      {...props}
      user={user}
      invitation={invitation}
      guest={guest}
      updateUser={(user: User, values: Partial<User>) =>
        // Hardened 2026-07-05: without .unwrap(), this resolved to the raw
        // action envelope ({type, payload, meta}), not the User — so every
        // field read off "updatedUser" downstream (isGuest, guestId,
        // infoEntered) was undefined, sending every guest to Routes.House
        // instead of Routes.Guest and corrupting the Firestore guest patch
        // built from the undefined-riddled object.
        dispatch(updateUserRTK({ user, updates: values })).unwrap()
      }
      updateGuest={(updatedGuest: Guest, _clearCache?: boolean) =>
        updateGuestMutation({ guest: updatedGuest, updatedGuest })
      }
      getGuest={(guestId: string) =>
        queryClient.fetchQuery({
          queryKey: guestKeys.detail(guestId),
          queryFn: () =>
            import("../../services/guest").then((m) => m.getGuest(guestId)),
        })
      }
    />
  );
};

export default NewAccountFormWrapper;
