import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RatsText } from '../../components/rats-text';
import styles from './SignUpStyles';
import SignUpForm from './SignUpForm';
import { ViewStyle, View, ActivityIndicator } from 'react-native';
import { auth } from '../../../firebase-setup';
import { logout, updateUser } from '../../state/slices/userSlice';
import { User } from '../../entities/User';
import RatsButton from '../../components/rats-button/rats-button';
import {
  AuthStackParamList,
  RootStackParamList,
  Routes,
} from '../../navigation/types';
import {
  navigateAuthStackRoute,
  navigateToMainTab,
} from '../../navigation/authNavigation';
import { normalize, fontSize, color, ROW } from '../../styles/theme';
import RatsScrollView from '../../components/rats-scroll-view';
import { onLink, getLinkType } from '../../services/native-deep-links';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dayIsAfter, getTodaysDate } from '../../util/display';
import SignUpWebView from './SignUpWebView';
import { Role } from '../../entities/Roles';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { initializeInvitation } from '../../state/slices/userSlice';
import { peekInvitation } from '../../services/invitations';
import { logException } from '../../util/logging';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type SignUpScreenProps = CompositeScreenProps<
  NativeStackScreenProps<AuthStackParamList, Routes.Signup>,
  NativeStackScreenProps<RootStackParamList>
> & {
  renderHeader?: () => JSX.Element;
  containerStyle?: ViewStyle;
  customRoute?: keyof AuthStackParamList;
  renderNameFields?: boolean;
};

/**
 * Sign Up Screen
 *
 * User registration flow for guests and admins.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (userActions)
 * - Added RTK imports: logout, updateUser from userSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 7 selectors to use state.user (removed 'as any' casts)
 * - Replaced 2 dispatch calls with RTK thunks (.unwrap() for error handling)
 */
const SignUpScreen: React.FC<SignUpScreenProps> = props => {
  const {
    renderHeader,
    containerStyle,
    customRoute,
    renderNameFields,
    navigation,
    route,
  } = props;

  const dispatch = useAppDispatch();
  const creatingUser = useAppSelector(state => state.user.creatingUser);
  const error = useAppSelector(state => state.user.error);
  const user = useAppSelector(state => state.user.user);
  const signUpRole = useAppSelector(state => state.user.signUpRole);
  const updating = useAppSelector(state => state.user.updating);
  const invitation = useAppSelector(state => state.user.invitation);
  const logging = useAppSelector(
    state => state.user.loggingOut || state.user.loggingIn,
  );

  const [loggingOut, setLoggingOut] = useState(false);
  const [stateError, setStateError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks whether we are currently exchanging an invitation `token` for
  // metadata via peekInvitation. The form is hidden behind a spinner
  // while this is in flight so we don't render an empty email field.
  const [peekingInvitation, setPeekingInvitation] = useState(false);

  const userSubscriptionRef = useRef<any>(null);
  const linkSubscriptionRef = useRef<(() => void) | undefined>(undefined);

  const setError = useCallback((message: string) => {
    setStateError({ message });
  }, []);

  const setSubmittingForm = useCallback((isSubmitting: boolean) => {
    setSubmitting(isSubmitting);
  }, []);

  const checkInvitationExpiration = useCallback(() => {
    if (
      invitation &&
      invitation.expirationDate &&
      dayIsAfter(getTodaysDate(), invitation.expirationDate)
    ) {
      setStateError({ message: 'This invitation has expired' });
    }
  }, [invitation]);

  const initializeLinkSubscription = useCallback(() => {
    // Email verification removed - no longer needed
  }, []);

  const renderHeaderContent = useCallback(() => {
    if (renderHeader) {
      return renderHeader();
    }
    return <RatsText style={styles.header} text="get.started" />;
  }, [renderHeader]);

  const signOut = useCallback(async () => {
    try {
      await dispatch(logout()).unwrap();
    } catch (error) {
      // do something
    } finally {
    }
  }, [dispatch]);

  const routeToNextScreen = useCallback(() => {
    if (customRoute) {
      navigateAuthStackRoute(navigation, customRoute);
    } else if (user?.isAdmin) {
      navigateToMainTab(navigation, Routes.House);
    } else if (user?.isGuest) {
      navigateToMainTab(navigation, Routes.Guest);
    } else {
      navigation.navigate(Routes.NewAccount);
    }
  }, [customRoute, navigation, user]);

  const resendEmail = useCallback(async () => {
    return Promise.resolve();
  }, []);

  useEffect(() => {
    initializeLinkSubscription();
    checkInvitationExpiration();
    if (invitation === null || invitation === undefined) {
      userSubscriptionRef.current = setInterval(() => {
        if (user && user.email) {
          const currentUser = auth.currentUser;
          if (currentUser && user.email !== currentUser.email && !updating) {
            dispatch(
              updateUser({
                user: user as any,
                updates: { email: currentUser.email! },
              }),
            );
            clearInterval(userSubscriptionRef.current);
          }
        }
      }, 500);
    }

    return () => {
      if (userSubscriptionRef.current) {
        clearInterval(userSubscriptionRef.current);
      }
    };
  }, []);

  // Email verification was removed — no longer automatically route when
  // the user is created. Routing now happens only after successful
  // sign-up form submission. (Effect intentionally left empty so the
  // deps stay wired if someone restores routing logic later.)

  // When the invitation arrives via deep-link with only a `token` (the
  // new opaque-token format from createInvitation), the rest of the
  // metadata (email, houseId, role, initialPhase) is unknown until we
  // ask the server. Exchange the token for metadata once, then dispatch
  // initializeInvitation with the hydrated invitation so the form's
  // mapPropsToValues sees a real email + correct role.
  useEffect(() => {
    if (!invitation?.token) {
      return;
    }
    if (invitation.email) {
      // Already hydrated (peek ran on a previous mount, or invitation
      // arrived via legacy URL-payload path).
      return;
    }
    let cancelled = false;
    setPeekingInvitation(true);
    (async () => {
      try {
        const meta = await peekInvitation(invitation.token!);
        if (cancelled) {
          return;
        }
        dispatch(
          initializeInvitation({
            ...invitation,
            email: meta.invitedEmail,
            houseId: meta.houseId,
            type: meta.role,
            initialPhase: meta.initialPhase ?? '',
          }),
        );
      } catch (err) {
        logException(err);
        if (!cancelled) {
          setStateError({
            message:
              'This invitation link is no longer valid. Ask your house admin to resend it.',
          });
        }
      } finally {
        if (!cancelled) {
          setPeekingInvitation(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitation?.token, invitation?.email, dispatch]);

  if (logging || creatingUser || submitting || peekingInvitation) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={color.baby_blue} />
      </View>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1 }} testID="signup-screen">
      {signUpRole !== 'superAdmin' && (
        <RatsScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}>
          {renderHeaderContent()}
          <View style={{ paddingHorizontal: normalize(10) }}>
            <SignUpForm
              setError={setError}
              error={stateError}
              renderNameFields={true}
              route={customRoute}
              navigation={navigation}
              setSubmittingForm={setSubmittingForm}
            />
          </View>
        </RatsScrollView>
      )}
      {signUpRole === 'superAdmin' && (
        <SignUpWebView user={user as any} navigation={navigation} />
      )}
    </SafeAreaView>
  );
};

export default SignUpScreen;
