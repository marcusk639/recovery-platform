import { withFormik } from "formik";
import { User } from "../../entities/User";
import { Alert } from "react-native";
import React from "react";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { updateUser } from "../../state/slices/userSlice";
import { useUpdateGuest } from "../../state/queries/guestQueries";
import { useUpdateAdmin } from "../../state/queries/adminQueries";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { Guest } from "../../entities/Guest";
import Admin from "../../entities/Admin";
import EditUserInfoFormView, {
  EditUserInfoProps,
} from "./EditUserInfoFormView";

type EditUserInfoValues = Partial<User>;

const stats: string[] = [
  "dateOfBirth",
  "avatar",
  "phoneNumber",
  "maritalStatus",
  "housingStatus",
  "ethnicity",
  "sobrietyDate",
];

const EditUserInfoForm = withFormik<EditUserInfoProps, EditUserInfoValues>({
  mapPropsToValues: (props: EditUserInfoProps) => {
    const values: Partial<User> = {};
    stats.forEach(
      (stat) =>
        ((values as Record<string, any>)[stat] = (
          props.user as Record<string, any>
        )[stat]),
    );
    return values;
  },
  handleSubmit: async (values: Partial<User>, formikBag) => {
    const {
      guest,
      user,
      admin,
      updateUser,
      updateGuest,
      updateAdmin,
      navigation,
    } = formikBag.props;

    try {
      // Update user with new values
      await updateUser(user, values);

      // Update guest if exists
      if (guest && updateGuest) {
        const guestUpdates: Partial<Guest> = {};
        stats.forEach(
          (stat) =>
            ((guestUpdates as Record<string, any>)[stat] = (
              values as Record<string, any>
            )[stat]),
        );
        await updateGuest(guest, guestUpdates);
      }

      // Update admin if exists
      if (admin && updateAdmin) {
        const adminUpdates: Partial<Admin> = {};
        stats.forEach(
          (stat) =>
            ((adminUpdates as Record<string, any>)[stat] = (
              values as Record<string, any>
            )[stat]),
        );
        await updateAdmin(admin, adminUpdates);
      }

      formikBag.setSubmitting(false);
      navigation.goBack();
    } catch (error) {
      // Hardened 2026-07-14: `updateUser` dispatched the RTK thunk without
      // .unwrap(), so dispatch(thunk) resolved to the action envelope
      // (fulfilled OR rejected) instead of rejecting on failure — this
      // catch could never fire, and a failed profile update silently did
      // nothing: no error shown to the user, and the form still navigated
      // away as if the save had succeeded. See updateUser wiring below.
      formikBag.setSubmitting(false);
      formikBag.setStatus({ failed: true });
      Alert.alert(
        "Update Failed",
        "Unable to update your profile. Please check your connection and try again.",
      );
    }
  },
  validationSchema: null,
  //@ts-ignore
})(EditUserInfoFormView);

/**
 * Edit User Info Form Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (userActions, guestActions)
 * - Added RTK import: updateOptionalInfo from userSlice
 * - Updated Props interface to use generic function types
 * - Updated 2 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (removed 'as any' cast)
 */
const EditUserInfoFormWrapper: React.FC<any> = (props) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);
  const guest = useAppSelector((state) => state.guests.userAsGuest);
  const { house } = useSelectedHouse();
  const admin = useAppSelector((state) => state.admin.userAsAdmin);
  const { mutateAsync: updateGuestMutation } = useUpdateGuest();
  const { mutateAsync: updateAdminMutation } = useUpdateAdmin();

  return (
    <EditUserInfoForm
      {...props}
      user={user}
      guest={guest}
      house={house}
      admin={admin}
      updateUser={(user: User, values: Partial<User>) =>
        // Hardened 2026-07-14: without .unwrap(), a rejected updateUser
        // thunk resolved (not rejected) to a "rejected" action envelope, so
        // handleSubmit's try/catch above never saw the failure.
        dispatch(updateUser({ user, updates: values })).unwrap()
      }
      updateGuest={
        guest
          ? (guestArg: Guest, updates: Partial<Guest>) =>
              updateGuestMutation({
                guest: guestArg,
                updatedGuest: { ...guestArg, ...updates },
              })
          : undefined
      }
      updateAdmin={
        admin
          ? (adminArg: Admin, updates: Partial<Admin>) =>
              updateAdminMutation({ adminId: adminArg.id, updates })
          : undefined
      }
    />
  );
};

export default EditUserInfoFormWrapper;
