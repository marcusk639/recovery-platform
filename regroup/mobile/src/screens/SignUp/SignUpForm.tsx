import React from 'react';
import { withFormik } from 'formik';
import * as yup from 'yup';
import { cloneDeep } from 'lodash';
import { useAppSelector, useAppDispatch } from '../../state/store';
import {
  createUser as createUserRTK,
  updateUser as updateUserRTK,
} from '../../state/slices/userSlice';
import { useCreateGuest } from '../../state/queries/guestQueries';
import { useCreateAdmin } from '../../state/queries/adminQueries';
import SignUpFormView from './SignUpFormView';
import { User } from '../../entities/User';
import {
  AuthScreenNavigationProp,
  AuthStackParamList,
  Routes,
} from '../../navigation/types';
import { navigateAuthStackRoute } from '../../navigation/authNavigation';
import { Invitation } from '../../entities/Invite';
import { Guest } from '../../entities/Guest';
import { mapUserToGuest } from '../../util/guest';
import { Role } from '../../entities/Roles';
import { mapValuesToUser } from '../../util/user';
import { mapUserToAdmin } from '../../util/admin';
import Admin from '../../entities/Admin';
import { checkPasswordReqs } from '../../services/password';
import { logException } from '../../util/logging';
import {
  addAdminAuthorization,
  addGuestAuthorization,
} from '../../services/setup-wizard';
import { redeemInvitation } from '../../services/invitations';
import { updateSubscriptionGuests } from '../../services/subscription';

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

export type SignUpFormValues = Partial<User> & { password: string };

const handleUserInvitation = (
  newUser: Partial<User>,
  invitation: Invitation,
) => {
  if (invitation) {
    // we don't need to verify user email if this is an invitation
    newUser.email = invitation.email;
    if (invitation.type === 'guest' || invitation.type === 'senior-peer') {
      newUser.houseId = invitation.houseId;
      newUser.isGuest = true;
    }
    if (invitation.type === 'admin' || invitation.type === 'senior-peer') {
      newUser.isAdmin = true;
    }
  }
};

const SignUpForm = withFormik<
  SignUpFormProps,
  Partial<User> & { password: string }
>({
  mapPropsToValues: props => ({
    email: props.invitation && props.invitation.email,
    password: '',
    confirmPassword: '',
    termsOfService: false,
    firstName: '',
    lastName: '',
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
        error?.message || error?.nativeErrorMessage || 'Failed to create user',
      );
      setSubmittingForm(false);
      return;
    }
    if (
      invitation &&
      (invitation.type === 'guest' || invitation.type === 'senior-peer')
    ) {
      const newGuest = mapUserToGuest(createdUser, new Guest());
      newGuest.isAdmin = invitation.type === 'senior-peer';
      newGuest.phase = invitation.initialPhase;
      try {
        if (invitation.token) {
          // New token-based flow — redeemInvitation grants the claim
          // server-side after validating the email match.
          await redeemInvitation(invitation.token);
        } else {
          // Legacy URL-payload flow — kept until Phase F.
          await addGuestAuthorization(newGuest);
        }

        // Add a small delay to ensure custom claims are propagated
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Refresh the auth token to ensure we have the latest claims
        const { getAuthUser } = require('../../services/users');
        await getAuthUser(true);
      } catch (error: any) {
        logException(error);
        props.setError(
          error?.message ||
            error?.nativeErrorMessage ||
            'Failed to add guest authorization',
        );
        setSubmittingForm(false);
        return; // Don't proceed with guest creation if authorization failed
      }

      try {
        await Promise.all([
          createGuest(newGuest),
          updateUser(createdUser, {
            isGuest: true,
            guestId: newGuest.id,
            email: createdUser.email,
          }),
          updateSubscriptionGuests({
            houseIds: [invitation.houseId],
            ownerUserId: invitation.ownerId,
            action: 'add',
          }),
        ]);
        props.navigation.navigate(Routes.NewAccount);
        setSubmitting(false);
        setSubmittingForm(false);
        return;
      } catch (error: any) {
        logException(error);
        props.setError(
          error?.message ||
            error?.nativeErrorMessage ||
            'Failed to create guest account',
        );
        setSubmittingForm(false);
        return;
      }
    }
    if (invitation && invitation.type === 'admin') {
      const mappedAdmin = mapUserToAdmin(
        createdUser,
        new Admin(createdUser.email),
      );
      // Immutable add — avoid mutating the object returned by mapUserToAdmin
      // in case that result is ever memoized / cached.
      const newAdmin = {
        ...mappedAdmin,
        houseIds: [...mappedAdmin.houseIds, invitation.houseId],
      };
      try {
        if (invitation.token) {
          // New token-based flow — redeemInvitation grants the admin
          // claim server-side after validating the email match.
          await redeemInvitation(invitation.token);
        } else {
          // Legacy URL-payload flow — kept until Phase F.
          await addAdminAuthorization(newAdmin);
        }

        // Add a small delay to ensure custom claims are propagated
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Refresh the auth token to ensure we have the latest claims
        const { getAuthUser } = require('../../services/users');
        await getAuthUser(true);
      } catch (error: any) {
        logException(error);
        props.setError(
          error?.message ||
            error?.nativeErrorMessage ||
            'Failed to add admin authorization',
        );
        setSubmittingForm(false);
        return; // Don't proceed with admin creation if authorization failed
      }

      try {
        await Promise.all([
          createAdmin(newAdmin),
          updateUser(createdUser, { isAdmin: true, adminId: newAdmin.id }),
        ]);
        setSubmitting(false);
        setSubmittingForm(false);
        props.navigation.navigate(Routes.NewAccount);
        return;
      } catch (error: any) {
        logException(error);
        props.setError(
          error?.message ||
            error?.nativeErrorMessage ||
            'Failed to create admin account',
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
    if (props.signUpRole === 'admin') {
      if (!values.firstName || values.firstName.length === 0) {
        errors.firstName = 'Required';
      }
      if (!values.lastName || values.lastName.length === 0) {
        errors.lastName = 'Required';
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
const SignUpFormWrapper: React.FC<any> = props => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.user);
  const invitation = useAppSelector(state => state.user.invitation);
  const signUpRole = useAppSelector(state => state.user.signUpRole);
  const { mutateAsync: createGuest } = useCreateGuest();
  const { mutateAsync: createAdmin } = useCreateAdmin();

  return (
    <SignUpForm
      {...props}
      user={user}
      invitation={invitation}
      signUpRole={signUpRole}
      createUser={(user: User) => dispatch(createUserRTK(user))}
      createGuest={(guest: Guest) => createGuest(guest)}
      updateUser={(user: User, values: Partial<User>) =>
        dispatch(updateUserRTK({ user, updates: values }))
      }
      createAdmin={(admin: Admin) => createAdmin(admin)}
    />
  );
};

export default SignUpFormWrapper;
