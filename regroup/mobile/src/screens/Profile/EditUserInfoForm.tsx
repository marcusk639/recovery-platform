import { withFormik } from "formik";
import { User } from "../../entities/User";
import { Alert } from "react-native";
import React from "react";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { updateUser } from "../../state/slices/userSlice";
import { useUpdateGuest } from "../../state/queries/guestQueries";
import { useUpdateAdmin } from "../../state/queries/adminQueries";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { setUserAsGuest } from "../../state/slices/guestsSlice";
import { setUserAsAdmin } from "../../state/slices/adminSlice";
import { Guest } from "../../entities/Guest";
import Admin from "../../entities/Admin";
import EditUserInfoFormView, {
  EditUserInfoProps,
} from "./EditUserInfoFormView";
import { auth } from "../../../firebase-setup";
import { logException } from "../../util/logging";
import {
  avatarForSave,
  deleteRemovedAvatar,
  isRemoteImageUri,
} from "./profileAvatar";
import { isDemo } from "../../util/user";

// `avatarContentType` is the picked photo's type, for the upload only: it is
// never saved.
type EditUserInfoValues = Partial<User> & { avatarContentType?: string | null };

export const AVATAR_UPLOAD_FAILED_TITLE = "Photo Upload Failed";
export const AVATAR_UPLOAD_FAILED_MESSAGE =
  "Couldn't upload your photo, so nothing was saved. Check your connection and try again, or remove the photo to save the rest.";
// storage.rules refuse the demo account every upload: say so, not "check your
// connection".
export const AVATAR_DEMO_TITLE = "Profile Photo";
export const AVATAR_DEMO_MESSAGE =
  "This functionality is disabled in demo mode. Remove the photo to save the rest.";

// The saved fields, as the store copies should now hold them: a field the
// form left undefined is not written (Firestore drops it), so the copy keeps
// its value.
const definedOnly = <T extends object>(updates: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

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
  handleSubmit: async (formValues: EditUserInfoValues, formikBag) => {
    const {
      guest,
      user,
      admin,
      updateUser,
      updateGuest,
      updateAdmin,
      navigation,
    } = formikBag.props;

    // A newly picked photo is uploaded first and saved as its download URL
    // (the picker's file path shows on no other phone). If the upload fails,
    // nothing is saved and the user is told.
    const { avatarContentType, ...values } = formValues;
    const isDemoAccount = isDemo(user?.email || "");
    if (
      isDemoAccount &&
      values.avatar &&
      values.avatar !== user?.avatar &&
      !isRemoteImageUri(values.avatar)
    ) {
      formikBag.setSubmitting(false);
      Alert.alert(AVATAR_DEMO_TITLE, AVATAR_DEMO_MESSAGE);
      return;
    }
    // The photo being replaced or removed: the user doc's, or, when an
    // earlier save stopped after the user doc, the guest/admin copy's.
    const storedPhoto = [user?.avatar, guest?.avatar, admin?.avatar].find(
      isRemoteImageUri,
    );
    try {
      values.avatar =
        (await avatarForSave(
          values.avatar,
          user?.avatar,
          auth.currentUser?.uid ?? "",
          avatarContentType
        )) ?? undefined;
    } catch (uploadError) {
      logException(uploadError, "EditUserInfoForm: avatar upload failed");
      formikBag.setSubmitting(false);
      Alert.alert(AVATAR_UPLOAD_FAILED_TITLE, AVATAR_UPLOAD_FAILED_MESSAGE);
      return;
    }

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

      // Saved: a removed photo's file goes too (best effort, never throws).
      // The rules refuse the demo account the delete as well.
      if (!isDemoAccount) {
        await deleteRemovedAvatar(
          values.avatar,
          storedPhoto,
          auth.currentUser?.uid ?? "",
        );
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
      logException(error, "EditUserInfoForm: profile save failed");
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
          ? async (guestArg: Guest, updates: Partial<Guest>) => {
              await updateGuestMutation({
                // Send only the fields being changed, plus the id updateGuest
                // requires. Spreading the whole guest carried rentOwed/choreFees
                // along at whatever value the screen loaded, and mergeGuestStats
                // max-merges those as accumulators -- so a stale higher balance
                // beat the real post-payment figure and re-billed rent the
                // resident had already paid. mergeGuestStats fills unchanged
                // fields from the stored document anyway.
                guest: guestArg,
                updatedGuest: { ...updates, id: guestArg.id },
              });
              // The mutation refreshes React Query, not this store copy, which
              // the Profile tab reads: a removed photo kept showing from it.
              dispatch(setUserAsGuest({ ...guestArg, ...definedOnly(updates) }));
            }
          : undefined
      }
      updateAdmin={
        admin
          ? async (adminArg: Admin, updates: Partial<Admin>) => {
              await updateAdminMutation({ adminId: adminArg.id, updates });
              // As for the guest copy above.
              dispatch(
                setUserAsAdmin({ ...adminArg, ...definedOnly(updates) } as Admin),
              );
            }
          : undefined
      }
    />
  );
};

export default EditUserInfoFormWrapper;
