import React from "react";
import { withFormik } from "formik";
import * as yup from "yup";
import { cloneDeep } from "lodash";
import { useAppSelector, useAppDispatch } from "../../state/store";
import {
  createUser as createUserRTK,
  updateUser as updateUserRTK,
} from "../../state/slices/userSlice";
import { useCreateGuest } from "../../state/queries/guestQueries";
import { useCreateAdmin } from "../../state/queries/adminQueries";
import SignUpFormView from "./SignUpFormView";
import { User } from "../../entities/User";
import {
  AuthScreenNavigationProp,
  AuthStackParamList,
  Routes,
} from "../../navigation/types";
import { navigateAuthStackRoute } from "../../navigation/authNavigation";
import { Invitation } from "../../entities/Invite";
import { Guest } from "../../entities/Guest";
import { Role } from "../../entities/Roles";
import { mapValuesToUser } from "../../util/user";
import Admin from "../../entities/Admin";
import { checkPasswordReqs } from "../../services/password";
import { logException } from "../../util/logging";
import {
  addAdminAuthorization,
  addGuestAuthorization,
} from "../../services/setup-wizard";
import { redeemInvitation } from "../../services/invitations";
import {
  buildInvitationMembership,
  refreshInvitationClaims,
  writeInvitationMembership,
} from "../../services/invitationMembership";

export interface SignUpFormProps {
  createUser: (user: User) => any;
  createGuest: (guest: Guest) => any;
  updateUser: (user: User, values: Partial<User>) => any;
  createAdmin: (admin: Admin) => any;
  user: Partial<User>;
  invitation: Invitation;
  route?: keyof AuthStackParamList;
  // promptEmailVerification removed - no longer needed
  signUpRole?: Role;
  renderNameFields?: boolean;
  error: any;
  setError: (message: string) => void;
  navigation: AuthScreenNavigationProp;
  setSubmittingForm: (submitting: boolean) => void;
}

export type SignUpFormValues = Partial<User> & {
  password: string;
  confirmPassword: string;
  termsOfService: boolean;
};

const handleUserInvitation = (
  newUser: Partial<User>,
  invitation: Invitation
) => {
  if (invitation) {
    // we don't need to verify user email if this is an invitation
    newUser.email = invitation.email;
    if (invitation.type === "guest" || invitation.type === "senior-peer") {
      newUser.houseId = invitation.houseId;
      newUser.isGuest = true;
    }
    if (invitation.type === "admin" || invitation.type === "senior-peer") {
      newUser.isAdmin = true;
    }
  }
};

const SignUpForm = withFormik<SignUpFormProps, SignUpFormValues>({
  mapPropsToValues: (props) => ({
    email: props.invitation && props.invitation.email,
    password: "",
    confirmPassword: "",
    termsOfService: false,
    firstName: "",
    lastName: "",
  }),
  handleSubmit: async (values, { props, setSubmitting }) => {
    const {
      createUser,
      user,
      invitation,
      createGuest,
      // promptEmailVerification removed
      signUpRole,
      createAdmin,
      updateUser,
      setSubmittingForm,
    } = props;
    setSubmittingForm(true);
    const newUser = user ? cloneDeep(user) : new User();
    mapValuesToUser(values, newUser, signUpRole);
    handleUserInvitation(newUser, invitation);
    let createdUser: User;
    try {
      createdUser = await createUser(newUser as User);
    } catch (error: any) {
      logException(error);
      props.setError(
        error?.message || error?.nativeErrorMessage || "Failed to create user"
      );
      setSubmittingForm(false);
      return;
    }
    // An invitation's role: grant it, then write the records that make the
    // account a member (services/invitationMembership, shared with "Accept as
    // this account").
    const membership = invitation
      ? buildInvitationMembership(createdUser, invitation)
      : null;
    if (membership) {
      const label = membership.kind === "guest" ? "guest" : "admin";
      try {
        if (invitation.token) {
          // New token-based flow — redeemInvitation grants the claim
          // server-side after validating the email match.
          await redeemInvitation(invitation.token);
        } else if (membership.kind === "guest") {
          // Legacy URL-payload flow — kept until Phase F.
          await addGuestAuthorization(membership.guest);
        } else {
          await addAdminAuthorization(membership.admin);
        }
        await refreshInvitationClaims();
      } catch (error: any) {
        logException(error);
        props.setError(
          error?.message ||
            error?.nativeErrorMessage ||
            `Failed to add ${label} authorization`
        );
        setSubmittingForm(false);
        return; // Don't create the records if authorization failed
      }

      try {
        // Occupancy is recorded server-side by redeemInvitation.
        await writeInvitationMembership(membership, createdUser, {
          createGuest,
          createAdmin,
          updateUser,
        });
        setSubmitting(false);
        props.navigation.navigate(Routes.NewAccount);
        setSubmittingForm(false);
        return;
      } catch (error: any) {
        logException(error);
        props.setError(
          error?.message ||
            error?.nativeErrorMessage ||
            `Failed to create ${label} account`
        );
        setSubmittingForm(false);
        return;
      }
    }
    setSubmittingForm(false);
    setSubmitting(false);

    if (props.route) {
      navigateAuthStackRoute(props.navigation, props.route);
    } else {
      // Covers admin, guest, and fallback (no-role) paths — all land on NewAccount.
      props.navigation.navigate(Routes.NewAccount);
    }
  },
  validate: (values, props) => {
    let errors: Record<string, string> = {};
    checkPasswordReqs(values.password, errors);
    // Hardened 2026-07-05: confirmPassword and termsOfService were seeded in
    // form state and rendered (confirmPassword field, ToS checkbox) but
    // never validated — signup could submit with a mismatched confirmation
    // or with no affirmative terms acceptance at all.
    if (values.password !== values.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    if (!values.termsOfService) {
      errors.termsOfService = "You must agree to the Terms of Service";
    }
    if (props.signUpRole === "admin") {
      if (!values.firstName || values.firstName.length === 0) {
        errors.firstName = "Required";
      }
      if (!values.lastName || values.lastName.length === 0) {
        errors.lastName = "Required";
      }
    }
    return errors;
  },
  //@ts-ignore
})(SignUpFormView);

/**
 * Sign Up Form Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (guestActions, adminActions)
 * - Added RTK imports: createUser, updateUser, addGuest, createAdmin
 * - Updated Props interface to use generic function types
 * - Removed spread of old actions, now passes RTK thunks directly
 */
const SignUpFormWrapper: React.FC<any> = (props) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);
  const invitation = useAppSelector((state) => state.user.invitation);
  const signUpRole = useAppSelector((state) => state.user.signUpRole);
  const { mutateAsync: createGuest } = useCreateGuest();
  const { mutateAsync: createAdmin } = useCreateAdmin();

  return (
    <SignUpForm
      {...props}
      user={user}
      invitation={invitation}
      signUpRole={signUpRole}
      // .unwrap(): dispatch(thunk) resolves to the action envelope, not the
      // User, and never rejects, so the uid was undefined downstream and a
      // failed create looked like a success.
      createUser={(user: User) => dispatch(createUserRTK(user)).unwrap()}
      createGuest={(guest: Guest) => createGuest(guest)}
      updateUser={(user: User, values: Partial<User>) =>
        // Hardened 2026-07-05: without .unwrap(), dispatch(thunk) always
        // resolves (even on failure, to a "rejected" action object) instead
        // of rejecting — so a failed user update inside the surrounding
        // Promise.all/try-catch was silently swallowed and the signup flow
        // proceeded to navigate as if it had succeeded.
        dispatch(updateUserRTK({ user, updates: values })).unwrap()
      }
      createAdmin={(admin: Admin) => createAdmin(admin)}
    />
  );
};

export default SignUpFormWrapper;
