import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  Platform,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {CommonActions, useNavigation} from '@react-navigation/native';

// Import types
import {MainTabParamList} from '../types/navigation';

// Import screens and navigators
import GroupStackNavigator from './GroupStackNavigator';
// V3.2: Replaced stub MeetingScreen with full MeetingFinderScreen
import MeetingsScreen from '../screens/meetings/MeetingFinderScreen';
import ProfileNavigator from './ProfileNavigator';
import MessagesNavigator from './MessagesNavigator';
import GroupSearchScreen from '../screens/homegroup/GroupSearchScreen';
import AdminPanelScreen from '../screens/admin/AdminPanelScreen';
import {AuthModal} from '../components/onboarding';
import {GroupModel} from '../models/GroupModel';
import {UserModel} from '../models/UserModel';

// Redux
import {useAppSelector, useAppDispatch} from '../store/index';
import {selectOnboardingData} from '../store/slices/authSlice';
import {
  fetchConversations,
  selectTotalUnreadCount,
} from '../store/slices/directMessagesSlice';
import {fetchAllUnreadCounts} from '../store/slices/chatSlice';
import {selectMemberGroupIds} from '../store/slices/groupsSlice';

// Define tab icons
const HomeIcon = ({focused}: {focused: boolean}) => (
  <Icon
    name={focused ? 'home' : 'home-outline'}
    size={28}
    color={focused ? '#2196F3' : '#9E9E9E'}
  />
);

const MeetingsIcon = ({focused}: {focused: boolean}) => (
  <Icon
    name={focused ? 'calendar' : 'calendar-outline'}
    size={28}
    color={focused ? '#2196F3' : '#9E9E9E'}
  />
);

const GroupSearchIcon = ({focused}: {focused: boolean}) => (
  <Icon
    name={focused ? 'account-group' : 'account-group-outline'}
    size={28}
    color={focused ? '#2196F3' : '#9E9E9E'}
  />
);

const ProfileIcon = ({focused}: {focused: boolean}) => (
  <Icon
    name={focused ? 'account-circle' : 'account-circle-outline'}
    size={28}
    color={focused ? '#2196F3' : '#9E9E9E'}
  />
);

const MessagesIcon = ({
  focused,
  unreadCount,
}: {
  focused: boolean;
  unreadCount: number;
}) => (
  <View style={{position: 'relative'}}>
    <Icon
      name={focused ? 'message' : 'message-outline'}
      size={28}
      color={focused ? '#2196F3' : '#9E9E9E'}
    />
    {unreadCount > 0 && (
      <View
        style={{
          position: 'absolute',
          top: -4,
          right: -8,
          backgroundColor: '#F44336',
          borderRadius: 10,
          minWidth: 18,
          height: 18,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 4,
        }}>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: 'bold',
          }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </Text>
      </View>
    )}
  </View>
);

const AdminPanelIcon = ({focused}: {focused: boolean}) => (
  <Icon
    name={focused ? 'shield-account' : 'shield-account-outline'}
    size={28}
    color={focused ? '#2196F3' : '#9E9E9E'}
  />
);

const Tab = createBottomTabNavigator<MainTabParamList>();

// Component for limited mode placeholder screens
const LimitedModeScreen: React.FC<{
  title: string;
  description: string;
  onSignUp: () => void;
}> = ({title, description, onSignUp}) => (
  <SafeAreaView style={limitedStyles.container}>
    <View style={limitedStyles.content}>
      <Icon name="lock-outline" size={64} color="#BDBDBD" />
      <Text style={limitedStyles.title}>{title}</Text>
      <Text style={limitedStyles.description}>{description}</Text>
      <TouchableOpacity style={limitedStyles.signUpButton} onPress={onSignUp}>
        <Icon name="account-plus" size={20} color="#FFFFFF" />
        <Text style={limitedStyles.signUpButtonText}>Create Account</Text>
      </TouchableOpacity>
      <Text style={limitedStyles.signInText}>
        Already have an account?{' '}
        <Text style={limitedStyles.signInLink} onPress={onSignUp}>
          Sign in
        </Text>
      </Text>
    </View>
  </SafeAreaView>
);

const limitedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  signUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  signInText: {
    marginTop: 20,
    fontSize: 14,
    color: '#757575',
  },
  signInLink: {
    color: '#2196F3',
    fontWeight: '600',
  },
});

const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const onboardingData = useAppSelector(selectOnboardingData);
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  const unreadMessageCount = useAppSelector(selectTotalUnreadCount);
  const memberGroupIds = useAppSelector(selectMemberGroupIds);
  const hasHandledOnboarding = useRef(false);

  // Check if user is in limited mode (seeker without account)
  const isLimitedMode = !isAuthenticated;

  // Fetch conversations on mount to get unread counts
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchConversations(undefined));
    }
  }, [isAuthenticated, dispatch]);

  // Fetch group chat unread counts when group memberships load
  useEffect(() => {
    if (isAuthenticated && memberGroupIds.length > 0) {
      dispatch(fetchAllUnreadCounts(memberGroupIds));
    }
  }, [isAuthenticated, memberGroupIds.length, dispatch]);

  useEffect(() => {
    const checkSuperAdmin = async () => {
      // Skip if not authenticated
      if (!isAuthenticated) {
        setIsSuperAdmin(false);
        return;
      }
      try {
        const isSuperAdminUser = await UserModel.isSuperAdmin();
        setIsSuperAdmin(isSuperAdminUser);
      } catch (error) {
        console.error('Error checking super admin status:', error);
        setIsSuperAdmin(false);
      }
    };

    checkSuperAdmin();
  }, [isAuthenticated]);

  // Handler for when auth succeeds
  const handleAuthSuccess = useCallback(() => {
    setShowAuthModal(false);
    // User is now authenticated, navigation will update automatically
  }, []);

  // Handler for triggering auth modal
  const showAuthPrompt = useCallback(() => {
    setShowAuthModal(true);
  }, []);

  // Handle initial navigation based on onboarding intent
  useEffect(() => {
    if (hasHandledOnboarding.current || !onboardingData) {
      return;
    }

    hasHandledOnboarding.current = true;

    const {intent, groupId, action} = onboardingData;

    // Delay navigation slightly to ensure tab navigator is ready
    const timer = setTimeout(() => {
      if (intent === 'seeker') {
        // Navigate to Meetings tab
        navigation.navigate('Meetings');
      } else if (groupId) {
        // Navigate to the specific group
        navigation.navigate('Home', {
          screen: 'GroupOverview',
          params: {
            groupId,
            // Pass action to show claim/setup UI if needed
            showClaimBanner: intent === 'admin' && action === 'claim',
          },
        });
      } else if (action === 'create') {
        // Navigate to create group screen
        navigation.navigate('Home', {
          screen: 'CreateGroup',
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [onboardingData, navigation]);

  // Limited mode wrapper components
  const LimitedHomeScreen = useCallback(
    () => (
      <LimitedModeScreen
        title="Your Groups"
        description="Create an account to join groups, connect with members, and access group features."
        onSignUp={showAuthPrompt}
      />
    ),
    [showAuthPrompt],
  );

  const LimitedProfileScreen = useCallback(
    () => (
      <LimitedModeScreen
        title="Your Profile"
        description="Create an account to set up your profile, track your recovery journey, and connect with others."
        onSignUp={showAuthPrompt}
      />
    ),
    [showAuthPrompt],
  );

  const LimitedMessagesScreen = useCallback(
    () => (
      <LimitedModeScreen
        title="Messages"
        description="Create an account to send and receive private messages with other members in your recovery community."
        onSignUp={showAuthPrompt}
      />
    ),
    [showAuthPrompt],
  );

  return (
    <>
      {/* Sign Up Banner for Limited Mode */}
      {isLimitedMode && (
        <TouchableOpacity
          style={[
            bannerStyles.container,
            {paddingTop: Platform.OS === 'ios' ? insets.top : 8},
          ]}
          onPress={showAuthPrompt}
          activeOpacity={0.9}>
          <View style={bannerStyles.content}>
            <Icon name="account-plus" size={20} color="#FFFFFF" />
            <Text style={bannerStyles.text}>
              Create an account to unlock all features
            </Text>
            <Icon name="chevron-right" size={20} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#2196F3',
          tabBarInactiveTintColor: '#9E9E9E',
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#EEEEEE',
            height: Platform.OS === 'ios' ? 60 + insets.bottom : 60,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8,
            paddingTop: 8,
          },
        }}>
        <Tab.Screen
          name="Home"
          component={isLimitedMode ? LimitedHomeScreen : GroupStackNavigator}
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({focused}) => <HomeIcon focused={focused} />,
            headerShown: false,
          }}
          listeners={
            isLimitedMode
              ? undefined
              : ({navigation: nav}) => ({
                  tabPress: e => {
                    // Prevent default tab press behavior
                    e.preventDefault();

                    // Reset the GroupStackNavigator to GroupsList screen
                    nav.dispatch(
                      CommonActions.reset({
                        index: 0,
                        routes: [
                          {
                            name: 'Home',
                            state: {
                              routes: [{name: 'GroupsList'}],
                            },
                          },
                        ],
                      }),
                    );
                  },
                })
          }
        />
        <Tab.Screen
          name="Meetings"
          component={MeetingsScreen}
          options={{
            tabBarLabel: 'Meetings',
            tabBarIcon: ({focused}) => <MeetingsIcon focused={focused} />,
            headerShown: false,
          }}
        />
        <Tab.Screen
          name="GroupSearch"
          component={GroupSearchScreen}
          options={{
            tabBarLabel: 'Groups',
            headerShown: false,
            tabBarIcon: ({focused}) => <GroupSearchIcon focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Messages"
          component={isLimitedMode ? LimitedMessagesScreen : MessagesNavigator}
          options={{
            tabBarLabel: 'Messages',
            tabBarIcon: ({focused}) => (
              <MessagesIcon
                focused={focused}
                unreadCount={isLimitedMode ? 0 : unreadMessageCount}
              />
            ),
            headerShown: false,
          }}
        />
        <Tab.Screen
          name="Profile"
          component={isLimitedMode ? LimitedProfileScreen : ProfileNavigator}
          options={{
            tabBarLabel: 'Profile',
            tabBarIcon: ({focused}) => <ProfileIcon focused={focused} />,
            headerTitle: 'Profile',
            headerShown: false,
          }}
        />

        {/* Admin Panel Tab - Only visible to super admins */}
        {isSuperAdmin && (
          <Tab.Screen
            name="AdminPanel"
            component={AdminPanelScreen}
            options={{
              tabBarLabel: 'Admin',
              tabBarIcon: ({focused}) => <AdminPanelIcon focused={focused} />,
              headerShown: false,
            }}
          />
        )}
      </Tab.Navigator>

      {/* Auth Modal */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        title="Create Your Account"
        subtitle="Sign up to access all features and connect with your recovery community"
      />
    </>
  );
};

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: '#2196F3',
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});

export default MainTabNavigator;
