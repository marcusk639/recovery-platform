import React, {useState, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Share,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Local storage key for anonymous/seeker onboarding completion
const ANONYMOUS_ONBOARDING_KEY = '@onboarding_complete_anonymous';
import OnboardingSlide, {OnboardingSlideData} from './OnboardingSlide';
import {useAppDispatch, useAppSelector} from '../../store/index';
import {
  completeOnboarding,
  setOnboardingComplete,
} from '../../store/slices/authSlice';
import {joinGroup} from '../../store/slices/groupsSlice';
import {
  IntentSelectionSlide,
  GroupSearchOnboarding,
  GroupPreviewCard,
  GroupNotFoundModal,
  AuthModal,
  OnboardingIntent,
  NotFoundAction,
} from '../../components/onboarding';
import AdminValuePropSlide from '../../components/onboarding/AdminValuePropSlide';
import {HomeGroup} from '../../types';

// Type for pending actions that require authentication
interface PendingAction {
  type: 'join' | 'claim' | 'create' | 'skip';
  group?: HomeGroup | null;
  intent: OnboardingIntent;
}

const {width} = Dimensions.get('window');

// Step definitions
type OnboardingStep =
  | 'welcome'
  | 'privacy'
  | 'intent'
  | 'admin-value-prop'
  | 'group-search'
  | 'group-preview'
  | 'complete';

// Slide data for welcome and privacy screens
const slides: OnboardingSlideData[] = [
  {
    id: 'welcome',
    title: 'Welcome to Homegroups',
    description:
      'Your recovery journey, supported by community. Connect with your homegroup and stay engaged with your recovery.',
    icon: 'home-heart',
    iconColor: '#4CAF50',
  },
  {
    id: 'privacy',
    title: 'Your Privacy Matters',
    description:
      'We respect your anonymity and protect your information. You control what others can see.',
    icon: 'shield-lock',
    iconColor: '#2196F3',
    bulletPoints: [
      'First names only — no last names required',
      'You control what information is visible',
      'Messages stay within your group',
      'Your data is never sold, ever',
    ],
  },
];

const OnboardingScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);

  // Navigation state
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const flatListRef = useRef<FlatList>(null);

  // Intent and group selection state
  const [selectedIntent, setSelectedIntent] = useState<OnboardingIntent | null>(
    null,
  );
  const [selectedGroup, setSelectedGroup] = useState<HomeGroup | null>(null);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );

  // Determine if we're in the slides phase (welcome, privacy)
  const isInSlidesPhase =
    currentStep === 'welcome' || currentStep === 'privacy';
  const isLastSlide = currentSlideIndex === slides.length - 1;

  // Handle slide scroll
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollPosition = event.nativeEvent.contentOffset.x;
      const index = Math.round(scrollPosition / width);
      setCurrentSlideIndex(index);

      // Update step based on slide index
      if (index === 0) {
        setCurrentStep('welcome');
      } else if (index === 1) {
        setCurrentStep('privacy');
      }
    },
    [],
  );

  // Navigate to next slide
  const goToNextSlide = useCallback(() => {
    if (currentSlideIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentSlideIndex + 1,
        animated: true,
      });
    } else {
      // Move to intent selection
      setCurrentStep('intent');
    }
  }, [currentSlideIndex]);

  // Handle intent selection
  const handleIntentSelect = useCallback((intent: OnboardingIntent) => {
    setSelectedIntent(intent);
  }, []);

  // Continue after intent selection
  const handleIntentContinue = useCallback(() => {
    if (!selectedIntent) return;

    if (selectedIntent === 'seeker') {
      // Skip to main app for meeting seekers
      handleCompleteOnboarding('seeker', null);
    } else if (selectedIntent === 'admin') {
      // Show value prop screen before group search for admins
      setCurrentStep('admin-value-prop');
    } else {
      // Show group search for member flow
      setCurrentStep('group-search');
    }
  }, [selectedIntent]);

  // Handle group selection from search
  const handleGroupSelect = useCallback((group: HomeGroup) => {
    setSelectedGroup(group);
    setCurrentStep('group-preview');
  }, []);

  // Handle "not found" from search
  const handleGroupNotFound = useCallback(() => {
    setShowNotFoundModal(true);
  }, []);

  // Handle action from not found modal
  const handleNotFoundAction = useCallback(
    async (action: NotFoundAction) => {
      setShowNotFoundModal(false);

      switch (action) {
        case 'create':
          // Check if user is authenticated before creating group
          if (!user?.uid) {
            setPendingAction({
              type: 'create',
              group: null,
              intent: selectedIntent || 'admin',
            });
            setShowAuthModal(true);
            return;
          }
          // Complete onboarding and navigate to create group
          await handleCompleteOnboarding(
            selectedIntent || 'admin',
            null,
            'create',
          );
          break;
        case 'invite':
          // Generate and share invite link
          try {
            await Share.share({
              message:
                "Join me on Homegroups! Download the app and let's set up our recovery group together: https://homegroups-app.com/download",
              title: 'Invite to Homegroups',
            });
          } catch (error) {
            console.error('Error sharing:', error);
          }
          break;
        case 'claim':
          // User wants to be admin - go to group search in admin mode
          setSelectedIntent('admin');
          setCurrentStep('group-search');
          break;
        case 'skip':
          // Skip without group - no auth required for seekers
          await handleCompleteOnboarding(selectedIntent || 'member', null);
          break;
      }
    },
    [selectedIntent, user],
  );

  // Handle joining/claiming a group
  const handleJoinGroup = useCallback(async () => {
    if (!selectedGroup) return;

    // Check if user is authenticated
    if (!user?.uid) {
      // Store pending action and show auth modal
      setPendingAction({
        type: selectedIntent === 'admin' ? 'claim' : 'join',
        group: selectedGroup,
        intent: selectedIntent || 'member',
      });
      setShowAuthModal(true);
      return;
    }

    // User is authenticated, proceed with join
    try {
      // Join the group
      await dispatch(joinGroup(selectedGroup.id)).unwrap();

      // Complete onboarding with the group
      await handleCompleteOnboarding(
        selectedIntent || 'member',
        selectedGroup.id,
        selectedIntent === 'admin' ? 'claim' : undefined,
      );
    } catch (error: any) {
      console.error('Error joining group:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to join group. Please try again.',
      );
    }
  }, [selectedGroup, selectedIntent, dispatch, user]);

  // Go back to search from preview
  const handleBackToSearch = useCallback(() => {
    setSelectedGroup(null);
    setCurrentStep('group-search');
  }, []);

  // Handle successful authentication from auth modal
  const handleAuthSuccess = useCallback(async () => {
    setShowAuthModal(false);

    // Process the pending action now that user is authenticated
    if (!pendingAction) return;

    const {type, group, intent} = pendingAction;
    setPendingAction(null);

    try {
      switch (type) {
        case 'join':
        case 'claim':
          if (group) {
            // Join the group
            await dispatch(joinGroup(group.id)).unwrap();
            // Complete onboarding with the group
            await handleCompleteOnboarding(
              intent,
              group.id,
              type === 'claim' ? 'claim' : undefined,
            );
          }
          break;
        case 'create':
          // Complete onboarding and navigate to create group
          await handleCompleteOnboarding(intent, null, 'create');
          break;
        case 'skip':
          // Complete onboarding without a group
          await handleCompleteOnboarding(intent, null);
          break;
      }
    } catch (error: any) {
      console.error('Error completing pending action after auth:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to complete action. Please try again.',
      );
    }
  }, [pendingAction, dispatch]);

  // Complete onboarding - saves to Firestore and AsyncStorage
  // For seekers (unauthenticated users), saves to local AsyncStorage only
  const handleCompleteOnboarding = async (
    intent: OnboardingIntent,
    groupId: string | null,
    action?: 'create' | 'claim',
  ) => {
    try {
      if (!user?.uid) {
        // For seekers who skip auth, save to local AsyncStorage
        // They can browse meetings without an account
        console.log('Completing onboarding without user account (seeker mode)');
        await AsyncStorage.setItem(ANONYMOUS_ONBOARDING_KEY, 'true');
        dispatch(setOnboardingComplete(true));
        return;
      }

      // Use the thunk to save to Firestore + cache
      await dispatch(
        completeOnboarding({
          userId: user.uid,
          intent,
          groupId,
          action,
        }),
      ).unwrap();
    } catch (error) {
      console.error('Error completing onboarding:', error);
      // Still complete even if storage fails - this ensures UX isn't blocked
      await AsyncStorage.setItem(ANONYMOUS_ONBOARDING_KEY, 'true').catch(
        () => {},
      );
      dispatch(setOnboardingComplete(true));
    }
  };

  // Skip onboarding entirely
  const skipOnboarding = useCallback(async () => {
    await handleCompleteOnboarding('seeker', null);
  }, []);

  // Render slide for FlatList
  const renderSlide = useCallback(({item}: {item: OnboardingSlideData}) => {
    return <OnboardingSlide slide={item} />;
  }, []);

  // Render pagination dots
  const renderPagination = () => {
    if (!isInSlidesPhase) return null;

    return (
      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              currentSlideIndex === index && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    );
  };

  // Render content based on current step
  const renderContent = () => {
    switch (currentStep) {
      case 'welcome':
      case 'privacy':
        return (
          <>
            <FlatList
              ref={flatListRef}
              data={slides}
              renderItem={renderSlide}
              keyExtractor={item => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={false}
            />
            {renderPagination()}
            <View style={styles.bottomContainer}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={goToNextSlide}>
                <Text style={styles.primaryButtonText}>
                  {isLastSlide ? 'Continue' : 'Next'}
                </Text>
                <Icon name="arrow-right" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        );

      case 'intent':
        return (
          <>
            <IntentSelectionSlide
              onSelect={handleIntentSelect}
              selectedIntent={selectedIntent}
            />
            <View style={styles.bottomContainer}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  !selectedIntent && styles.primaryButtonDisabled,
                ]}
                onPress={handleIntentContinue}
                disabled={!selectedIntent}>
                <Text style={styles.primaryButtonText}>Continue</Text>
                <Icon name="arrow-right" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        );

      case 'admin-value-prop':
        return (
          <AdminValuePropSlide
            onContinue={() => setCurrentStep('group-search')}
          />
        );

      case 'group-search':
        return (
          <GroupSearchOnboarding
            mode={selectedIntent === 'admin' ? 'admin' : 'member'}
            onSelectGroup={handleGroupSelect}
            onNotFound={handleGroupNotFound}
            title={
              selectedIntent === 'admin'
                ? 'Find Your Group to Manage'
                : 'Find Your Homegroup'
            }
            subtitle={
              selectedIntent === 'admin'
                ? 'Search for your group to claim it'
                : 'Search by group name or location'
            }
          />
        );

      case 'group-preview':
        if (!selectedGroup) {
          setCurrentStep('group-search');
          return null;
        }
        return (
          <GroupPreviewCard
            group={selectedGroup}
            mode={selectedIntent === 'admin' ? 'admin' : 'member'}
            onJoin={handleJoinGroup}
            onGoBack={handleBackToSearch}
          />
        );

      default:
        return null;
    }
  };

  // Determine if skip button should show
  const showSkipButton =
    currentStep === 'welcome' ||
    currentStep === 'privacy' ||
    currentStep === 'intent' ||
    currentStep === 'admin-value-prop';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Skip Button */}
      {showSkipButton && (
        <TouchableOpacity style={styles.skipButton} onPress={skipOnboarding}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Back Button for search/preview steps */}
      {(currentStep === 'group-search' ||
        currentStep === 'admin-value-prop' ||
        currentStep === 'intent') && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (currentStep === 'group-search') {
              // Go back to value prop for admins, intent for members
              setCurrentStep(
                selectedIntent === 'admin' ? 'admin-value-prop' : 'intent',
              );
            } else if (currentStep === 'admin-value-prop') {
              setCurrentStep('intent');
            } else if (currentStep === 'intent') {
              setCurrentStep('privacy');
              flatListRef.current?.scrollToIndex({index: 1, animated: false});
            }
          }}>
          <Icon name="arrow-left" size={24} color="#424242" />
        </TouchableOpacity>
      )}

      {/* Main Content */}
      {renderContent()}

      {/* Not Found Modal */}
      <GroupNotFoundModal
        visible={showNotFoundModal}
        onClose={() => setShowNotFoundModal(false)}
        onSelectAction={handleNotFoundAction}
        mode={selectedIntent === 'admin' ? 'admin' : 'member'}
      />

      {/* Auth Modal - shown when user needs to authenticate */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setPendingAction(null);
        }}
        onAuthSuccess={handleAuthSuccess}
        title={
          pendingAction?.type === 'claim'
            ? 'Create Account to Claim Group'
            : pendingAction?.type === 'create'
            ? 'Create Account to Set Up Group'
            : 'Create Account to Join'
        }
        subtitle={
          pendingAction?.type === 'claim'
            ? 'Sign up to become the admin of this group'
            : pendingAction?.type === 'create'
            ? 'Sign up to create and manage your group'
            : 'Sign up to join this group and connect with members'
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#2196F3',
    width: 24,
  },
  bottomContainer: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default OnboardingScreen;
