import React, {useEffect, useRef, useCallback, useState} from 'react';
import {
  NavigationContainer,
  LinkingOptions,
  NavigationContainerRef,
} from '@react-navigation/native';
import {Provider} from 'react-redux';
import store, {useAppDispatch} from './src/store';
import {
  checkAuthState,
  selectIsAuthenticated,
  setUser,
  fetchUserData,
  updateFcmToken,
} from './src/store/slices/authSlice';
import AppNavigator from './src/navigation/AppNavigator';
import {Linking, Alert, Text, Platform} from 'react-native';
import functions from '@react-native-firebase/functions';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import crashlytics from '@react-native-firebase/crashlytics';
import {RootStackParamList} from './src/types/navigation';
import {initStripe, StripeProvider} from '@stripe/stripe-react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {parseDeepLinkUrl} from './src/utils/url';
import {
  NotificationService,
  NotificationHandler,
} from './src/services/notifications';

require('react-native').LogBox.ignoreLogs(['`GCanvasReady` with no listeners']);

// Define the structure of expected deep link params - Simplified
type LinkingParams = RootStackParamList & {
  // Define only the routes handled by custom logic or needing specific paths
  JoinGroupFlow: {code: string};
  // Let React Navigation infer types for Main/Home/GroupOverview etc.
};

const linking: LinkingOptions<LinkingParams> = {
  prefixes: ['homegroups-app://', 'https://homegroups-app.com'],
  config: {
    screens: {
      JoinGroupFlow: 'join',
      Main: {
        screens: {
          Home: {
            screens: {
              GroupOverview: {
                path: 'group-overview',
                parse: {
                  groupId: (groupId: string) => {
                    return groupId;
                  },
                },
                stringify: {
                  groupId: (groupId: string) => {
                    return groupId;
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    console.log('Initial URL:', url);
    return url;
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({url}) => {
      console.log('Deep link URL received:', url);
      listener(url);
    });

    // Also listen for universal links
    const universalLinkSubscription = Linking.addEventListener(
      'url',
      ({url}) => {
        console.log('Universal link received:', url);
        if (url.startsWith('https://homegroups-app.com')) {
          listener(url);
        }
      },
    );

    return () => {
      subscription.remove();
      universalLinkSubscription.remove();
    };
  },
};

// NEW: Create a component for the main app content
const AppContent: React.FC = () => {
  const navigationRef = useRef<NavigationContainerRef<LinkingParams>>(null);
  const dispatch = useAppDispatch();
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  // Called when NavigationContainer is ready
  const onNavigationReady = useCallback(() => {
    setIsNavigationReady(true);
    if (navigationRef.current) {
      NotificationHandler.setNavigationRef(navigationRef.current);
    }
  }, []);

  // --- Set up notification handlers (once navigation is ready) ---
  useEffect(() => {
    if (!isNavigationReady) return;

    // Set up foreground notification handler
    const unsubscribeForeground = NotificationHandler.setupForegroundHandler();

    // Set up notification opened handler (background state)
    const unsubscribeOpened =
      NotificationHandler.setupNotificationOpenedHandler();

    // Check if app was opened from a notification (quit state)
    NotificationHandler.checkInitialNotification();

    return () => {
      unsubscribeForeground();
      unsubscribeOpened();
      NotificationHandler.cleanup();
    };
  }, [isNavigationReady]);

  // --- Authentication and Notification Initialization ---
  useEffect(() => {
    // Auth Listener
    const unsubscribeAuth = auth().onAuthStateChanged(
      async (user: FirebaseAuthTypes.User | null) => {
        dispatch(setUser(user)); // Update user in Redux store
        if (user) {
          await dispatch(fetchUserData(user.uid)); // Fetch user data

          // Initialize notification service after user is authenticated
          await NotificationService.initialize();
        } else {
          // User signed out - clean up notification service
          NotificationService.cleanup();
        }
      },
    );

    // Clean up listeners on unmount
    return () => {
      unsubscribeAuth();
      NotificationService.cleanup();
    };
  }, [dispatch]);

  // --- Deep Link Handling Logic ---
  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (!url) return;
      console.log('Handling deep link:', url);

      try {
        const {path, params} = parseDeepLinkUrl(url);

        // Handle Stripe redirect
        if (path === 'stripe-redirect') {
          const status = params['redirect_status'];
          if (status === 'succeeded') {
            console.log('Stripe payment completed successfully');
            // The payment sheet will handle the success state
            return;
          } else {
            console.log('Stripe payment failed or was cancelled');
            return;
          }
        }

        // Handle subscription payment results from WebView
        if (path === 'payment-success') {
          const subscriptionId = params['subscriptionId'];
          const groupId = params['groupId'];
          console.log('Subscription payment successful:', subscriptionId);

          // Show success alert
          setTimeout(() => {
            Alert.alert(
              '🎉 Subscription Active!',
              'You are now an admin of this group.',
              [
                {
                  text: 'View Group',
                  onPress: () => {
                    if (groupId && navigationRef.current) {
                      navigationRef.current.navigate('Main', {
                        screen: 'Home',
                        params: {
                          screen: 'GroupOverview',
                          params: {groupId, groupName: 'Group'},
                        },
                      });
                    }
                  },
                },
              ],
            );
          }, 300);
          return;
        }

        if (path === 'payment-cancelled') {
          const groupId = params['groupId'];
          console.log('Subscription payment cancelled');
          // Navigate back to group overview
          if (groupId && navigationRef.current) {
            navigationRef.current.navigate('Main', {
              screen: 'Home',
              params: {
                screen: 'GroupOverview',
                params: {groupId, groupName: 'Group'},
              },
            });
          }
          return;
        }

        if (path === 'payment-error') {
          const error = params['error'];
          const groupId = params['groupId'];
          console.log('Subscription payment error:', error);
          setTimeout(() => {
            Alert.alert(
              'Payment Failed',
              decodeURIComponent(error || 'An error occurred during payment.'),
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (groupId && navigationRef.current) {
                      navigationRef.current.navigate('Main', {
                        screen: 'Home',
                        params: {
                          screen: 'GroupOverview',
                          params: {groupId, groupName: 'Group'},
                        },
                      });
                    }
                  },
                },
              ],
            );
          }, 300);
          return;
        }

        // Handle group overview
        if (path === 'group-overview') {
          const groupId = params['groupId'];
          const stripeStatus = params['stripeStatus'];

          // Show success toast if returning from Stripe setup
          if (stripeStatus === 'return') {
            setTimeout(() => {
              Alert.alert(
                '🎉 Donations Enabled!',
                'Your group can now accept donations from members.',
                [{text: 'Great!', style: 'default'}],
              );
            }, 500);
          } else if (stripeStatus === 'refresh') {
            setTimeout(() => {
              Alert.alert(
                'Setup Incomplete',
                'Please complete the donation setup to start accepting donations.',
                [{text: 'OK', style: 'default'}],
              );
            }, 500);
          }

          if (groupId) {
            console.log('Navigating to group:', groupId);
            if (navigationRef.current) {
              navigationRef.current.navigate('Main', {
                screen: 'Home',
                params: {
                  screen: 'GroupOverview',
                  params: {groupId, groupName: 'Group'},
                },
              });
            }
          }
          return;
        }

        // Handle group join flow
        if (path === 'join') {
          const code = params['code'];
          if (code) {
            console.log('Extracted invite code:', code);
            const state = store.getState();
            if (!state.auth.isAuthenticated || !state.auth.user) {
              Alert.alert(
                'Please Sign In',
                'You need to be signed in to join a group.',
                [
                  {
                    text: 'OK',
                    onPress: () =>
                      navigationRef.current?.navigate('Auth' as any),
                  },
                ],
              );
              return;
            }
            try {
              console.log(`Calling joinGroupByInviteCode with code: ${code}`);
              const joinGroupFunction = functions().httpsCallable(
                'joinGroupByInviteCode',
              );
              const result = await joinGroupFunction({code});
              const {success, groupId, message} = result.data as {
                success: boolean;
                groupId: string;
                message: string;
              };

              if (success && groupId) {
                console.log(`Successfully joined group ${groupId}`);
                if (navigationRef.current) {
                  navigationRef.current.navigate('Main', {
                    screen: 'Home',
                    params: {
                      screen: 'GroupOverview',
                      params: {groupId: groupId, groupName: 'Group'},
                    },
                  });
                }
              } else {
                console.error('Failed to join group:', message);
                Alert.alert(
                  'Join Failed',
                  message || 'Could not join the group using this code.',
                );
              }
            } catch (error: any) {
              console.error('Error calling joinGroupByInviteCode:', error);
              Alert.alert(
                'Error',
                error.message ||
                  'An error occurred while trying to join the group.',
              );
            }
          }
          return;
        }
      } catch (e) {
        console.error('Error handling deep link:', url, e);
      }
    },
    [dispatch],
  );

  // Initial URL Handling
  useEffect(() => {
    Linking.getInitialURL().then(url => handleDeepLink(url));
  }, [handleDeepLink]);

  // Subsequent URL Handling
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({url}) => {
      handleDeepLink(url);
    });
    return () => subscription.remove();
  }, [handleDeepLink]);

  // Render the Navigation Container inside AppContent
  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={onNavigationReady}
      fallback={<Text>Loading...</Text>}>
      <AppNavigator />
    </NavigationContainer>
  );
};

// Root App component wraps everything in Providers
const App = () => {
  const [isOffline, setIsOffline] = useState(false);

  // Initialize Crashlytics
  useEffect(() => {
    const initCrashlytics = async () => {
      try {
        // Enable Crashlytics collection (can be disabled for debugging)
        await crashlytics().setCrashlyticsCollectionEnabled(true);

        // Log app start
        crashlytics().log('App started');

        console.log('Crashlytics initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Crashlytics:', error);
      }
    };

    initCrashlytics();
  }, []);

  // Set user identifier for crash reports when authenticated
  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged(async user => {
      if (user) {
        try {
          // Set user identifier for crash reports (helps identify affected users)
          await crashlytics().setUserId(user.uid);

          // Set custom attributes for better crash context. Do NOT send email
          // (PII) to Crashlytics — setUserId(uid) above already correlates
          // crashes to a user without exposing personal data.
          await crashlytics().setAttributes({
            signInMethod: user.providerData[0]?.providerId || 'unknown',
          });

          crashlytics().log(`User signed in: ${user.uid}`);
        } catch (error) {
          console.error('Failed to set Crashlytics user:', error);
        }
      } else {
        // Clear user data on sign out
        try {
          await crashlytics().setUserId('');
          crashlytics().log('User signed out');
        } catch (error) {
          console.error('Failed to clear Crashlytics user:', error);
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (!state.isConnected) {
        setIsOffline(true);
      } else {
        setIsOffline(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOffline) {
      Alert.alert(
        'No internet connection',
        'Please check your connection and try again.',
      );
    }
  }, [isOffline]);

  useEffect(() => {
    initStripe({
      publishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY as string,
    });
  }, []);
  // !! REPLACE WITH YOUR ACTUAL STRIPE PUBLISHABLE KEY !!
  // Consider using react-native-dotenv for better key management
  const stripePublishableKey = process.env
    .STRIPE_TEST_PUBLISHABLE_KEY as string;
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <StripeProvider
          publishableKey={stripePublishableKey}
          // merchantIdentifier="merchant.com.your-app-identifier" // Required for Apple Pay
          // urlScheme="your-url-scheme" // Required for some payment methods
        >
          <AppContent />
        </StripeProvider>
      </Provider>
    </SafeAreaProvider>
  );
};

export default App;
