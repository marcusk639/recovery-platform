import React, {useEffect, useState, useRef} from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {AppState, AppStateStatus} from 'react-native';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import types
import {RootStackParamList} from '../types/navigation';

// Import screens and navigators
import SplashScreen from '../screens/SplashScreen';
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import {OnboardingScreen} from '../screens/onboarding';
import IntergroupNavigator from './IntergroupNavigator';

// Redux
import {
  setUser,
  checkOnboardingStatus,
  setOnboardingComplete,
  selectOnboardingData,
} from '../store/slices/authSlice';
import {useAppDispatch, useAppSelector} from '../store';

// Activity tracking
import {trackLogin} from '../services/activityTracker';

// Auth utilities
import {refreshAuthToken} from '../services/firebase/auth';
import {FEATURE_FLAGS} from '../config/featureFlags';

// Local storage key for anonymous/seeker onboarding completion
const ANONYMOUS_ONBOARDING_KEY = '@onboarding_complete_anonymous';

// Minimum time between token refreshes (5 minutes)
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const Stack = createStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const dispatch = useAppDispatch();
  const {isAuthenticated, onboardingComplete} = useAppSelector(
    state => state.auth,
  );
  const onboardingData = useAppSelector(selectOnboardingData);
  const [isInitializing, setIsInitializing] = useState(true);

  // Track last token refresh time to avoid excessive refreshes
  const lastTokenRefresh = useRef<number>(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Handle app foreground/background state changes
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // App came to foreground from background
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        const currentUser = auth().currentUser;
        const now = Date.now();

        // Only refresh if user is authenticated and enough time has passed
        if (
          currentUser &&
          now - lastTokenRefresh.current > MIN_REFRESH_INTERVAL_MS
        ) {
          console.log('App came to foreground, refreshing auth token...');
          try {
            await refreshAuthToken();
            lastTokenRefresh.current = now;
            console.log('Auth token refreshed on app foreground');
          } catch (error) {
            console.warn('Failed to refresh token on foreground:', error);
          }
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Check if the user is logged in
    const unsubscribe = auth().onAuthStateChanged(async user => {
      dispatch(setUser(user));

      if (user) {
        // User is authenticated, check onboarding from Firestore (with cache fallback)
        try {
          await dispatch(checkOnboardingStatus(user.uid)).unwrap();
          // Track user login for admin activity detection
          trackLogin();
          // Record initial token refresh time
          lastTokenRefresh.current = Date.now();
        } catch (error) {
          console.error('Error checking onboarding status:', error);
        }
      } else {
        // User is not authenticated - check local storage for anonymous onboarding
        try {
          const anonymousOnboarding = await AsyncStorage.getItem(
            ANONYMOUS_ONBOARDING_KEY,
          );
          if (anonymousOnboarding === 'true') {
            // User completed onboarding as seeker (anonymous mode)
            dispatch(setOnboardingComplete(true));
          } else {
            // New user, needs onboarding
            dispatch(setOnboardingComplete(false));
          }
        } catch (error) {
          console.error('Error checking anonymous onboarding:', error);
          dispatch(setOnboardingComplete(false));
        }
      }
      setIsInitializing(false);
    });

    // Clean up the auth listener
    return unsubscribe;
  }, [dispatch]);

  // Show splash screen while loading
  if (isInitializing || onboardingComplete === null) {
    return <SplashScreen />;
  }

  // Navigation logic:
  // 1. If onboarding not complete -> Show Onboarding
  // 2. If onboarding complete -> Show Main (works for both auth and anon users)
  //    - MainTabNavigator will handle limited mode for unauthenticated users
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}>
      {!onboardingComplete ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      )}
      {/* V4.4: Intergroup stack — hidden (entire enterprise tier; premature) */}
      {FEATURE_FLAGS.SHOW_V4_ENTERPRISE_INTERGROUP && (
        <Stack.Screen
          name="Intergroup"
          component={IntergroupNavigator}
          options={{presentation: 'modal', headerShown: false}}
        />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
