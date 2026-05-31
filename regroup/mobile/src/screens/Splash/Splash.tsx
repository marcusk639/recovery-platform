import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import { normalize } from '../../styles/theme';
import { RatsLogo } from '../../components/rats-logo';
import {
  getInitialLink,
  onLink,
  getLinkType,
  createInvitationFromLink,
} from '../../services/native-deep-links';
import {
  initializeInvitation,
  anonymouslyLogin,
  autoLogin,
  loginFailedAction,
} from '../../state/slices/userSlice';
import { logException } from '../../util/logging';
import { subscriptionStatus } from '../../util/subscription';
import { User } from '../../entities/User';
import { NativeDeepLink } from '../../services/native-deep-links';
import isNil from 'lodash/isNil';
import notifee from '@notifee/react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { DeepLinkTester } from '../../components/DeepLinkTester';
import { logDebug, logError, logWarn } from '../../util/simple-debug-logger';
import { wait } from '../../util/display';
import { useAppSelector, useAppDispatch } from '../../state/store';

export const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: normalize(10),
    justifyContent: 'center',
  },
});

interface SplashProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Splash Screen (HOC)
 *
 * Handles app initialization, authentication, and deep linking.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (import * as userActions)
 * - Updated imports to use RTK thunks from userSlice
 * - Updated selector to use state.user (removed 'as any' cast)
 * - Replaced 6 dispatch calls with RTK thunks (.unwrap() for error handling)
 * - Added comments for missing thunks (updateUser, setSubscriptionStatus)
 */
export const withSplash = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
) => {
  /**
   * Shows Splash screen then navigates
   */
  const Splash: React.FC<SplashProps> = props => {
    const dispatch = useAppDispatch();
    const userState = useAppSelector(state => state.user);

    const [appIsReady, setAppIsReady] = useState(false);
    const [secondsWithoutTransition, setSecondsWithoutTransition] = useState(0);
    const [subscriptionChecked, setSubscriptionChecked] = useState(false);
    const [permissions, setPermissions] = useState<any>(null);

    const authFlag = useRef(true);
    const authSubscriptionRef = useRef<(() => void) | null>(null);
    const onTokenRefreshListenerRef = useRef<(() => any) | null>(null);
    const linkSubscriptionRef = useRef<(() => void) | null>(null);

    const onMessage = messaging().onMessage(async message => {
      if (message?.data?.notifee) {
        const res = await notifee.displayNotification(
          JSON.parse(message.data.notifee as string),
        );
      }
    });

    const initBackgroundMessageHandler = useCallback(() => {
      messaging().setBackgroundMessageHandler(async _message => {
        // Background handler runs in headless JS context — keep it a
        // no-op here. If app-level handling is needed, dispatch a
        // structured action rather than logging the full payload
        // (FCM data may contain PII).
      });
    }, []);

    const handleMessagingToken = useCallback(async () => {
      await messaging().requestPermission();
      const messagingToken = await messaging().getToken();
      updateTokenIfNecessary(messagingToken);
    }, []);

    const listenToLink = useCallback(() => {
      linkSubscriptionRef.current = onLink((link: NativeDeepLink) => {
        logDebug('Splash - Deep link received:', link);
        const type = getLinkType(link);
        logDebug('Splash - Link type:', type);
        if (type === 'invitation') {
          logDebug('Splash - Initializing invitation from link');
          const invitation = createInvitationFromLink(link);
          dispatch(initializeInvitation(invitation));
        }
      });
    }, [dispatch]);

    const authUser = useCallback((): Promise<any> => {
      return new Promise((resolve, reject) => {
        authSubscriptionRef.current = auth().onAuthStateChanged(async _user => {
          if (_user) {
            resolve(_user);
          } else {
            reject('Could not log in');
          }
        });
      });
    }, []);

    const registerMessageTokenListener = useCallback(() => {
      const user = userState.user;
      onTokenRefreshListenerRef.current = messaging().onTokenRefresh(
        async fcmToken => {
          // Do NOT mutate the Redux store's user entity in place. Build
          // an immutable next value here. The actual persistence path
          // (dispatch(updateUser(...))) is still pending a slice-level
          // updateUser action — for now this is a no-op that at least
          // doesn't corrupt store invariants.
          if (!user || userState.updating) {
            return;
          }
          const _nextTokens = user.messagingToken
            ? [...user.messagingToken, fcmToken]
            : [fcmToken];
          // TODO(messaging): dispatch updateUser once the slice action
          // is restored: dispatch(updateUser({ user, updates: { messagingToken: _nextTokens } }))
        },
      );
    }, [userState, dispatch]);

    const anonymouslyLoginHandler = useCallback(async () => {
      try {
        await dispatch(anonymouslyLogin()).unwrap();
      } catch (error) {
        // do nothing
      }
    }, [dispatch]);

    const updateTokenIfNecessary = useCallback(
      async (fcmToken: string) => {
        const user = userState.user;
        const { updating } = userState;
        const token = user?.messagingToken;
        if (!updating && (isNil(token) || !token.length)) {
          // Note: updateUser should be imported from userSlice if available
          // return dispatch(updateUser({ user, updates: { messagingToken: [fcmToken] } })).unwrap();
        } else if (!updating && !user?.messagingToken!.includes(fcmToken)) {
          // Note: updateUser should be imported from userSlice if available
          // return dispatch(updateUser({ user, updates: { messagingToken: [...user.messagingToken!, fcmToken] } })).unwrap();
        }
      },
      [userState, dispatch],
    );

    const checkSubscriptionStatus = useCallback(() => {
      const { user } = userState;
      if (user && !subscriptionChecked) {
        // Note: setSubscriptionStatus should be imported from userSlice if available
        // dispatch(setSubscriptionStatus(subscriptionStatus(user as User) as string));
        setSubscriptionChecked(true);
      }
    }, [userState, subscriptionChecked, dispatch]);

    const loginIfNecessary = useCallback(async () => {
      const {
        user,
        anonLoggingIn,
        loggingIn,
        loginFailed: userLoginFailed,
      } = userState;
      if (!anonLoggingIn && !loggingIn && userLoginFailed && !user) {
        await anonymouslyLoginHandler();
      }
    }, [userState, anonymouslyLoginHandler]);

    const appIsReadyCheck = useCallback(() => {
      const user = userState.user;
      const invitation = userState.invitation;

      if (user || invitation) {
        return true;
      } else {
        return false;
      }
    }, [userState]);

    // componentDidMount
    useEffect(() => {
      const initialize = async () => {
        const { invitation } = userState;
        logDebug('Splash - componentDidMount called');
        logDebug('Splash - invitation:', invitation);

        // Check for initial deep link FIRST, before authentication
        // This ensures invitation is in Redux state before initial route is determined
        if (!invitation) {
          logDebug(
            'Splash - No invitation in state, checking for initial deep link',
          );
          const initialLink = await getInitialLink();
          if (initialLink) {
            logDebug(
              'Splash - Found initial link, initializing invitation:',
              initialLink,
            );
            const linkType = getLinkType(initialLink);
            if (linkType === 'invitation') {
              logDebug('Splash - Initializing invitation from initial link');
              const invitation = createInvitationFromLink(initialLink);
              dispatch(initializeInvitation(invitation));
              // Wait a moment for Redux state to update
              await wait(100);
            }
          }
        }

        registerMessageTokenListener();
        initBackgroundMessageHandler();
        listenToLink();

        try {
          logDebug('Splash - Starting authentication flow');
          const authenticatedUser = await authUser();
          logDebug('Splash - Authenticated user:', authenticatedUser);
          await dispatch(autoLogin(authenticatedUser)).unwrap();
          logDebug('Splash - Auto login completed');
        } catch (error) {
          logError('Splash - Authentication failed:', error);
          dispatch(loginFailedAction());
        }
      };

      initialize();

      // Cleanup
      return () => {
        if (authSubscriptionRef.current) {
          authSubscriptionRef.current();
        }
        if (onTokenRefreshListenerRef.current) {
          onTokenRefreshListenerRef.current();
        }
        if (linkSubscriptionRef.current) {
          linkSubscriptionRef.current();
        }
      };
    }, []); // Empty dependency array - only run once on mount

    // componentDidUpdate equivalent
    useEffect(() => {
      loginIfNecessary();
      checkSubscriptionStatus();
    }, [loginIfNecessary, checkSubscriptionStatus]);

    useEffect(() => {
      if (userState.user) {
        handleMessagingToken();
      }
    }, [userState.user, handleMessagingToken]);

    useEffect(() => {
      const checkResult = appIsReadyCheck();
      if (!appIsReady && checkResult) {
        setAppIsReady(true);
      }
    }, [appIsReady, appIsReadyCheck]);

    useEffect(() => {
      if (secondsWithoutTransition === 10 && !appIsReady) {
        logException(new Error('App took longer than 10 seconds to load.'));
      }
    }, [secondsWithoutTransition, appIsReady]);

    if (!appIsReady) {
      return (
        <View style={splashStyles.container}>
          <RatsLogo />
          <DeepLinkTester visible={__DEV__} />
        </View>
      );
    } else {
      return <WrappedComponent {...(props as unknown as P)} />;
    }
  };

  return Splash;
};

export default withSplash;
