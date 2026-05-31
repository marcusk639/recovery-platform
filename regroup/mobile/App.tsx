// App.tsx - Migrated to Redux Toolkit
// Phase 3.2: Added Context providers (ModalProvider, NotificationProvider, DataProvider)
// Provider tree: ErrorBoundary > SafeAreaProvider > StripeProvider > ThemeProvider > DataProvider > NotificationProvider > ModalProvider > Auth
import React, { memo, useState, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-gesture-handler';
import * as Sentry from '@sentry/react-native';
import { StripeProvider } from '@stripe/stripe-react-native';

// TODO: Replace with real publishable key via react-native-config or similar
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder';

import { ThemeProvider, color } from './src/styles/theme';
import { useAppSelector } from './src/state/store';
import { selectAppUserState, selectAppNavigationState } from './src/state/selectors/appSelectors';
import { withSplash } from './src/screens/Splash/Splash';
import Auth from './src/components/auth/auth';
import IOSStatusBar from './src/components/ios-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import {
  ModalProvider,
  NotificationProvider,
  DataProvider,
} from './src/context';
import {
  RootNavigator,
  improvedNavigationService,
  AuthStackParamList,
  RootStackParamList,
  MainTabParamList,
} from './src/navigation';
// Initialize Sentry
Sentry.init({
  dsn: 'https://d785dae671464fc3a3a4464c5e7876cc@sentry.io/4306202',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
});

interface RootNavigatorProps {
  initialRoute: keyof RootStackParamList;
  authInitialRoute?: keyof AuthStackParamList;
  initialMainRoute?: keyof MainTabParamList;
}

const RootNavigatorMemo = memo(
  ({
    initialRoute,
    authInitialRoute,
    initialMainRoute,
  }: RootNavigatorProps) => (
    <RootNavigator
      initialRoute={initialRoute}
      authInitialRoute={authInitialRoute}
      initialMainRoute={initialMainRoute}
    />
  ),
  (prevProps: RootNavigatorProps, nextProps: RootNavigatorProps) => {
    // Always re-render if any of the routes change
    const shouldUpdate =
      prevProps.initialRoute !== nextProps.initialRoute ||
      prevProps.authInitialRoute !== nextProps.authInitialRoute ||
      prevProps.initialMainRoute !== nextProps.initialMainRoute;

    return !shouldUpdate;
  },
);

const App: React.FC = () => {
  // Redux state using memoized selectors (reduces independent subscriptions from 13 to 2)
  const { loggedIn, user, anonymous, invitation } = useAppSelector(selectAppUserState);

  const { theme } = useAppSelector(selectAppNavigationState);

  // Calculate initial routes once on mount
  const initialRoutes = improvedNavigationService.getInitialNavigation(
    user,
    invitation,
  );

  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>(
    initialRoutes.initialRoute as keyof RootStackParamList,
  );
  const [authInitialRoute, setAuthInitialRoute] = useState<
    keyof AuthStackParamList | undefined
  >(initialRoutes.authInitialRoute as keyof AuthStackParamList | undefined);
  const [initialMainRoute, setInitialMainRoute] = useState<
    keyof MainTabParamList | undefined
  >(initialRoutes.initialMainRoute as keyof MainTabParamList | undefined);

  // Recalculate routes on auth state changes
  useEffect(() => {
    // Recalculate routes if there's a significant auth state change
    // (login/logout, user change, or invitation added/removed)
    // We don't recalculate when user info is updated during a flow (like infoEntered)
    // because navigation is handled manually by the screens
    const routes = improvedNavigationService.getInitialNavigation(
      user,
      invitation,
    );
    setInitialRoute(routes.initialRoute as keyof RootStackParamList);
    setAuthInitialRoute(
      routes.authInitialRoute as keyof AuthStackParamList | undefined,
    );
    setInitialMainRoute(
      routes.initialMainRoute as keyof MainTabParamList | undefined,
    );
  }, [
    loggedIn,
    anonymous,
    user?.uid,
    !!invitation, // Only track presence/absence of invitation
  ]);

  // Create a key that changes on significant auth state changes (logged in vs logged out)
  // Include user?.uid so that when a different user logs in, or when logging in again, the key changes
  // This forces remount when logging in/out to ensure proper navigation reset
  // Don't include initialRoute in the key to prevent remounting when user completes forms
  // The navigation should be handled by the screens themselves, not by remounting the navigator
  const navigationKey = `${user?.uid || 'no-user'}-${loggedIn}-${anonymous}`;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
          <ThemeProvider theme={theme}>
            <DataProvider>
              <NotificationProvider>
                <ModalProvider>
                  <Auth>
                    <IOSStatusBar
                      backgroundColor={color.black}
                      barStyle="light-content"
                    />
                    <RootNavigatorMemo
                      key={navigationKey}
                      initialRoute={initialRoute}
                      authInitialRoute={authInitialRoute}
                      initialMainRoute={initialMainRoute}
                    />
                  </Auth>
                </ModalProvider>
              </NotificationProvider>
            </DataProvider>
          </ThemeProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
};

export default withSplash(App);