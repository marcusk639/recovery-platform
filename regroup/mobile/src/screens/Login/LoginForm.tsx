import React from 'react';
import { withFormik } from 'formik';
import * as yup from 'yup';
import LoginFormView from './LoginFormView';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { login } from '../../state/slices/userSlice';
import { useQueryClient } from '@tanstack/react-query';
import { houseKeys } from '../../state/queries/houseQueries';
import { adminKeys } from '../../state/queries/adminQueries';
import SchemaConstants from '../../entities/SchemaConstants';
import { User } from '../../entities/User';
import { Routes, AuthScreenNavigationProp } from '../../navigation/types';
import { Alert } from 'react-native';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import analytics from '@react-native-firebase/analytics';
import improvedNavigationService from '../../navigation/improved-navigation-service';
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../../navigation/service';
import { logException } from '../../util/logging';

const loginSchema = yup.object().shape({
  email: yup
    .string()
    .email(SchemaConstants.EMAIL)
    .max(50, SchemaConstants.stringMax(50))
    .required(SchemaConstants.REQUIRED),
  password: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(8, SchemaConstants.stringMin(8)),
});

export interface LoginProps {
  user: User;
  login: (credentials: { email: string; password: string }) => any;
  getAdminHouses: (attribute: string, value: string) => any;
  getAdmin: (params: { adminId: string; isCurrentUser?: boolean }) => any;
  setModalVisible: () => void;
  navigation: AuthScreenNavigationProp;
}

export interface LoginFormValues {
  email: string;
  password: string;
}

export function determineInitialRoute(user: User & FirebaseAuthTypes.User) {
  if (
    (user.isSuperAdmin || user.potentialSuperAdmin) &&
    !user.orgSetupCompleted
  ) {
    return Routes.Setup;
  }
  if (user.isAdmin) {
    return Routes.Main;
  } else if (user.isGuest) {
    return Routes.Main;
  } else {
    // Email verification removed - no longer needed
    return Routes.Main;
  }
}

const LoginForm = withFormik<
  LoginProps & { email: string; setEmail: (email: string) => void },
  LoginFormValues
>({
  mapPropsToValues: ({ email }) => ({ email, password: '' }),
  enableReinitialize: true,
  handleSubmit: async (
    values,
    { props, setStatus, setSubmitting, setFieldValue },
  ) => {
    const { email, password } = values;
    const { login: loginAction, setEmail, dispatch } = props as any;
    setStatus({});
    setSubmitting(true);
    try {
      // RTK login returns a promise that resolves with the payload
      const result = await dispatch(
        loginAction({ email: email.toLowerCase(), password }),
      ).unwrap();
      const user = result.user;
      // Log a non-PII role signal only — never the email. Firebase Analytics
      // retains custom params in BigQuery exports; email as a param creates
      // a persistent PII record that is not covered by Auth-side deletion.
      analytics().logEvent('signin', {
        role: user?.isAdmin ? 'admin' : user?.isGuest ? 'guest' : 'unknown',
      });

      // Use improved navigation service to get the correct route
      const navigationConfig =
        improvedNavigationService.getInitialNavigation(user);

      // Navigate after login - use setTimeout to ensure Redux state is updated
      setTimeout(() => {
        if (navigationRef.current) {
          if (navigationConfig.initialRoute === Routes.Setup) {
            // Reset to Setup stack
            navigationRef.current.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: Routes.Setup }],
              }),
            );
          } else if (navigationConfig.initialRoute === Routes.Main) {
            // Reset to Main stack with nested tab route
            const mainRoute =
              navigationConfig.initialMainRoute ||
              (user?.isGuest ? Routes.Guest : Routes.House);
            navigationRef.current.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [
                  {
                    name: Routes.Main,
                    state: {
                      routes: [{ name: mainRoute }],
                      index: 0,
                    },
                  },
                ],
              }),
            );
          }
        } else {
          logException(
            new Error('LoginForm: navigationRef.current is null on signin'),
          );
        }
        setSubmitting(false);
      }, 300);
    } catch (error) {
      logException(error);
      setSubmitting(false);
      setEmail(values.email);
      setStatus({ failed: true });
    }
  },
  validationSchema: loginSchema,
  //@ts-ignore
})(LoginFormView);

/**
 * Login Form Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (adminActions)
 * - Added RTK imports: login, getAdmin, getHouses
 * - Updated Props interface to use generic function types
 * - Removed spread of old actions, now passes RTK thunks directly
 */
const LoginFormWrapper: React.FC<any> = props => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.user);
  const loggedIn = useAppSelector(state => state.user.loggedIn);
  const queryClient = useQueryClient();

  return (
    <LoginForm
      {...props}
      user={user}
      loggedIn={loggedIn}
      login={(credentials: { email: string; password: string }) =>
        dispatch(login(credentials))
      }
      getAdminHouses={(attribute: string, value: string) =>
        queryClient.fetchQuery({
          queryKey: houseKeys.list({ attribute, value }),
          queryFn: () =>
            import('../../services/house').then(m =>
              m.getHouses(attribute, 'array-contains', value),
            ),
        })
      }
      getAdmin={(params: { adminId: string; isCurrentUser?: boolean }) =>
        queryClient.fetchQuery({
          queryKey: adminKeys.detail(params.adminId),
          queryFn: () =>
            import('../../services/admin').then(m =>
              m.getAdmin(params.adminId),
            ),
        })
      }
      dispatch={dispatch}
    />
  );
};

export default LoginFormWrapper;
