import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppSelector} from '../../store';
import {selectUserData} from '../../store/slices/authSlice';

// Note: In a real implementation, you would install and use these libraries:
// import * as Animatable from 'react-native-animatable';
// import LottieView from 'lottie-react-native';
// import LinearGradient from 'react-native-linear-gradient';

// Component placeholder for Animatable.View
const AnimatedView = ({children, animation, style}: any) => (
  <Animated.View style={style}>{children}</Animated.View>
);

// Component placeholder for LottieView
const LottieViewFallback = ({source, style, loop, ref}: any) => (
  <View style={[style, {backgroundColor: 'transparent'}]}>
    <Text style={{color: '#FFD700', textAlign: 'center', marginTop: 20}}>
      🎉 Celebration Animation 🎉
    </Text>
  </View>
);

// Component placeholder for LinearGradient
const GradientFallback = ({colors, style, children}: any) => (
  <View style={[style, {backgroundColor: '#2196F3'}]}>{children}</View>
);

const WINDOW_WIDTH = Dimensions.get('window').width;

interface MilestoneConfig {
  days: number;
  key: string;
  label: string;
  color: string;
  description: string;
}

// Define milestone data
const MILESTONES: MilestoneConfig[] = [
  {
    days: 1,
    key: '1day',
    label: '24 Hours',
    color: '#CD7F32',
    description: 'The journey of a thousand miles begins with a single step.',
  },
  {
    days: 30,
    key: '30days',
    label: '30 Days',
    color: '#CD7F32',
    description: 'The beginning of a new life. One month at a time.',
  },
  {
    days: 60,
    key: '60days',
    label: '60 Days',
    color: '#C0C0C0',
    description: 'Two months of dedication and growing stronger each day.',
  },
  {
    days: 90,
    key: '90days',
    label: '90 Days',
    color: '#C0C0C0',
    description:
      'A crucial milestone! 90 days of sobriety and new habits forming.',
  },
  {
    days: 180,
    key: '6months',
    label: '6 Months',
    color: '#FFD700',
    description: 'Half a year of transformation and renewed purpose.',
  },
  {
    days: 365,
    key: '1year',
    label: '1 Year',
    color: '#FFD700',
    description:
      'A full year of sobriety! An incredible achievement to celebrate.',
  },
  {
    days: 545,
    key: '18months',
    label: '18 Months',
    color: '#FFD700',
    description: 'Eighteen months of strength, resilience, and growth.',
  },
  {
    days: 730,
    key: '2years',
    label: '2 Years',
    color: '#B9F2FF',
    description: 'Two years of reclaiming your life and inspiring others.',
  },
  {
    days: 1095,
    key: '3years',
    label: '3 Years',
    color: '#B9F2FF',
    description: 'Three years of sobriety and countless moments of clarity.',
  },
  {
    days: 1460,
    key: '4years',
    label: '4 Years',
    color: '#E5E4E2',
    description: 'Four years of building a new life, one day at a time.',
  },
  {
    days: 1825,
    key: '5years',
    label: '5 Years',
    color: '#50C878',
    description: 'Five years of transformation - a remarkable journey.',
  },
];

const SobrietyTrackerScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const userData = useAppSelector(selectUserData);
  const scrollViewRef = useRef<ScrollView>(null);

  const [sobrietyDays, setSobrietyDays] = useState(0);
  const [sobrietyHours, setSobrietyHours] = useState(0);
  const [sobrietyMinutes, setSobrietyMinutes] = useState(0);
  const [currentMilestoneIndex, setCurrentMilestoneIndex] = useState(0);
  const [nextMilestoneIndex, setNextMilestoneIndex] = useState(1);
  const [progress, setProgress] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [newMilestone, setNewMilestone] = useState<MilestoneConfig | null>(
    null,
  );
  const [moneySaved, setMoneySaved] = useState(0);
  const [loading, setLoading] = useState(true);

  // Animation references
  const confettiRef = useRef<any>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (userData?.sobrietyStartDate) {
      // Calculate sobriety time
      const sobrietyDate = new Date(userData.sobrietyStartDate);
      const now = new Date();
      const diffMs = now.getTime() - sobrietyDate.getTime();

      // Calculate days, hours, minutes
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      setSobrietyDays(days);
      setSobrietyHours(hours);
      setSobrietyMinutes(minutes);

      // Calculate savings (roughly $10 per day saved)
      setMoneySaved(days * 10);

      // Find current milestone
      let currentIndex = 0;
      for (let i = MILESTONES.length - 1; i >= 0; i--) {
        if (days >= MILESTONES[i].days) {
          currentIndex = i;
          break;
        }
      }

      // Find next milestone
      const nextIndex =
        currentIndex < MILESTONES.length - 1 ? currentIndex + 1 : currentIndex;

      setCurrentMilestoneIndex(currentIndex);
      setNextMilestoneIndex(nextIndex);

      // Calculate progress to next milestone
      if (currentIndex < MILESTONES.length - 1) {
        const currentMilestoneDays = MILESTONES[currentIndex].days;
        const nextMilestoneDays = MILESTONES[nextIndex].days;
        const progressValue =
          (days - currentMilestoneDays) /
          (nextMilestoneDays - currentMilestoneDays);
        setProgress(Math.min(Math.max(progressValue, 0), 1));

        // Animate progress bar
        Animated.timing(progressAnim, {
          toValue: progressValue,
          duration: 1500,
          useNativeDriver: false,
        }).start();
      } else {
        setProgress(1);
        progressAnim.setValue(1);
      }

      // Check if user just reached a new milestone today
      // In a real app, you'd check this against last login or use a database flag
      const isNewMilestone = days === MILESTONES[currentIndex].days;
      if (isNewMilestone) {
        setNewMilestone(MILESTONES[currentIndex]);
        // Wait a moment before showing celebration
        setTimeout(() => {
          setShowCelebration(true);
          if (confettiRef.current) {
            confettiRef.current.play();
          }
        }, 500);
      }
    }

    setLoading(false);
  }, [userData?.sobrietyStartDate]);

  // Scroll to current milestone
  useEffect(() => {
    if (!loading && scrollViewRef.current) {
      // Give time for the scroll view to render
      setTimeout(() => {
        const xOffset = currentMilestoneIndex * WINDOW_WIDTH * 0.5;
        scrollViewRef.current?.scrollTo({x: xOffset, animated: true});
      }, 300);
    }
  }, [currentMilestoneIndex, loading]);

  const onMilestonePress = (index: number) => {
    // Scroll to the selected milestone
    if (scrollViewRef.current) {
      const xOffset = index * WINDOW_WIDTH * 0.5;
      scrollViewRef.current.scrollTo({x: xOffset, animated: true});
    }
  };

  const renderMedallion = (milestone: MilestoneConfig, index: number) => {
    const isEarned = sobrietyDays >= milestone.days;
    const isCurrentMilestone = index === currentMilestoneIndex;
    const isNewlyEarned = newMilestone?.key === milestone.key;

    // Define chip styles based on milestone color
    const chipStyle = {
      backgroundColor: milestone.color,
      borderColor: isCurrentMilestone ? '#FFFFFF' : '#BDBDBD', // White border for current
      shadowColor: isCurrentMilestone ? '#FFFFFF' : milestone.color, // Glow effect for current
    };

    return (
      <TouchableOpacity
        key={milestone.key}
        style={styles.medallionPressableArea} // Use a slightly larger press area
        onPress={() => onMilestonePress(index)}
        disabled={!isEarned}
        activeOpacity={0.8}
        testID={`sobriety-medallion-${milestone.key}`}>
        <Animated.View
          style={[
            styles.medallionContainer,
            chipStyle,
            !isEarned && styles.unearnedMedallion,
            {
              // Apply scaling animation for newly earned chips
              transform: [{scale: isNewlyEarned ? 1.1 : 1}],
              // Add elevation/shadow for a slight 3D effect
              elevation: isCurrentMilestone ? 10 : 5,
              shadowOpacity: isCurrentMilestone ? 0.5 : 0.2,
              shadowRadius: isCurrentMilestone ? 8 : 4,
              shadowOffset: {width: 0, height: isCurrentMilestone ? 4 : 2},
            },
          ]}>
          {/* 
            ** Placeholder for Image ** 
            When you have image assets, replace this View with:
            <Image 
              source={require(`./path/to/images/${milestone.key}.png`)} 
              style={styles.medallionImage} 
              resizeMode="contain" 
            />
            OR use a mapping object for sources:
            <Image source={MEDALLION_IMAGES[milestone.key]} ... />
          */}
          <View style={styles.medallionContentPlaceholder}>
            <Text style={styles.medallionText}>{milestone.label}</Text>
            <Text style={styles.medallionDays}>{milestone.days} Days</Text>
          </View>
          {/* End Placeholder */}

          {isEarned && (
            <View style={styles.earnedBadge}>
              <Icon name="check-circle" size={24} color="#4CAF50" />
            </View>
          )}
        </Animated.View>
        {!isEarned && (
          // Simple overlay for unearned chips
          <View style={styles.lockOverlay}>
            <Icon name="lock" size={30} color="rgba(255, 255, 255, 0.7)" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render achievement celebration modal
  const renderCelebration = () => {
    if (!showCelebration || !newMilestone) return null;

    return (
      <View
        style={styles.celebrationOverlay}
        testID={`sobriety-celebration-modal-${newMilestone.key}`}>
        <View style={styles.celebrationContainer}>
          <LottieViewFallback
            ref={confettiRef}
            source={require('../../assets/animations/confetti.json')}
            style={styles.confetti}
            loop={false}
          />

          <AnimatedView animation="bounceIn" style={styles.celebrationContent}>
            <Text style={styles.celebrationTitle}>Congratulations!</Text>
            <Text style={styles.celebrationSubtitle}>
              You've reached {newMilestone.label} of sobriety!
            </Text>

            <View
              style={[
                styles.celebrationMedallion,
                {backgroundColor: newMilestone.color},
              ]}>
              <Text style={styles.celebrationMedallionText}>
                {newMilestone.label}
              </Text>
              <Text style={styles.celebrationMedallionDays}>
                {newMilestone.days} Days
              </Text>
            </View>

            <Text style={styles.celebrationMessage}>
              {newMilestone.description}
            </Text>

            <TouchableOpacity
              style={styles.closeCelebrationButton}
              onPress={() => setShowCelebration(false)}
              testID="sobriety-celebration-close-button">
              <Text style={styles.closeCelebrationText}>Continue</Text>
            </TouchableOpacity>
          </AnimatedView>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading your sobriety journey...</Text>
      </SafeAreaView>
    );
  }

  if (!userData?.sobrietyStartDate) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.noDateContainer}>
          <Icon name="calendar-question" size={80} color="#BBDEFB" />
          <Text style={styles.noDateTitle}>No Sobriety Date Set</Text>
          <Text style={styles.noDateText}>
            Add your sobriety date in your profile to start tracking your
            progress and unlocking achievements.
          </Text>
          <TouchableOpacity
            style={styles.setDateButton}
            onPress={() => navigation.navigate('ProfileMain')}>
            <Text style={styles.setDateButtonText}>Go to Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="sobriety-tracker-screen">
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          testID="sobriety-tracker-back-button">
          <Icon name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sobriety Tracker</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.scrollViewContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sobriety Tracker</Text>
        </View>

        {/* Sobriety Counter */}
        <View style={styles.counterContainer} testID="sobriety-counter-section">
          <GradientFallback
            colors={['#2196F3', '#3949AB']}
            style={styles.counterGradient}>
            <Text style={styles.counterLabel}>Your Sobriety</Text>
            <Text style={styles.counterValue} testID="sobriety-days-count">
              {sobrietyDays}
            </Text>
            <Text style={styles.counterUnit}>Days</Text>
            <Text style={styles.counterDetail}>
              {sobrietyHours} hours, {sobrietyMinutes} minutes
            </Text>
            <Text style={styles.sobrietyDate}>
              Since {new Date(userData.sobrietyStartDate).toLocaleDateString()}
            </Text>
          </GradientFallback>
        </View>

        {/* Sobriety Stats */}
        <View style={styles.statsContainer} testID="sobriety-stats-section">
          <View style={styles.statItem}>
            <Icon name="cash" size={28} color="#4CAF50" />
            <Text style={styles.statValue}>${moneySaved.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>

          <View style={styles.statItem}>
            <Icon name="heart-pulse" size={28} color="#F44336" />
            <Text style={styles.statValue}>
              {Math.min(100, Math.floor(sobrietyDays / 3))}%
            </Text>
            <Text style={styles.statLabel}>Health</Text>
          </View>

          <View style={styles.statItem}>
            <Icon name="battery-charging" size={28} color="#FF9800" />
            <Text style={styles.statValue}>
              {Math.min(100, Math.floor(sobrietyDays / 2))}%
            </Text>
            <Text style={styles.statLabel}>Energy</Text>
          </View>
        </View>

        {/* Current Progress */}
        <View style={styles.progressSection} testID="sobriety-progress-section">
          <Text style={styles.progressTitle}>Progress to Next Milestone</Text>
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabelStart}>
              {MILESTONES[currentMilestoneIndex].label}
            </Text>
            <Text style={styles.progressLabelEnd}>
              {currentMilestoneIndex < MILESTONES.length - 1
                ? MILESTONES[nextMilestoneIndex].label
                : 'Beyond!'}
            </Text>
          </View>
          {currentMilestoneIndex < MILESTONES.length - 1 && (
            <Text style={styles.daysToGo} testID="sobriety-days-to-go">
              {MILESTONES[nextMilestoneIndex].days - sobrietyDays} days to go!
            </Text>
          )}
        </View>

        {/* Milestone Medallions */}
        <View style={styles.milestoneSection}>
          <Text style={styles.milestoneTitle}>Your Sobriety Medallions</Text>
          <Text style={styles.milestoneSubtitle}>
            Earn medallions as you reach important milestones
          </Text>

          <ScrollView
            horizontal
            ref={scrollViewRef}
            testID="sobriety-medallion-scrollview"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.medallionsScrollContent}
            snapToInterval={WINDOW_WIDTH * 0.5}
            decelerationRate="fast">
            {MILESTONES.map((milestone, index) =>
              renderMedallion(milestone, index),
            )}
          </ScrollView>

          {currentMilestoneIndex < MILESTONES.length - 1 && (
            <View style={styles.nextMilestoneInfo}>
              <Text style={styles.nextMilestoneTitle}>Next Milestone</Text>
              <Text style={styles.nextMilestoneText}>
                {MILESTONES[nextMilestoneIndex].label} -{' '}
                {MILESTONES[nextMilestoneIndex].days} days
              </Text>
              <Text style={styles.nextMilestoneDesc}>
                {MILESTONES[nextMilestoneIndex].description}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
      {/* Celebration Modal */}
      {renderCelebration()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollViewContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerPlaceholder: {
    width: 40,
  },
  counterContainer: {
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  counterGradient: {
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  counterLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  counterValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  counterUnit: {
    fontSize: 20,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  counterDetail: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: 4,
  },
  sobrietyDate: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressLabelStart: {
    fontSize: 12,
    color: '#757575',
  },
  progressLabelEnd: {
    fontSize: 12,
    color: '#757575',
  },
  daysToGo: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2196F3',
    textAlign: 'center',
    marginTop: 12,
  },
  milestoneSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  milestoneTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  milestoneSubtitle: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
  },
  medallionsScrollContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  medallionPressableArea: {
    width: WINDOW_WIDTH * 0.45,
    height: WINDOW_WIDTH * 0.45,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    position: 'relative',
  },
  medallionContainer: {
    width: WINDOW_WIDTH * 0.4,
    height: WINDOW_WIDTH * 0.4,
    borderRadius: (WINDOW_WIDTH * 0.4) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  medallionContentPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  medallionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
  medallionDays: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 1,
  },
  unearnedMedallion: {
    opacity: 0.6,
  },
  lockOverlay: {
    position: 'absolute',
    width: WINDOW_WIDTH * 0.4 - 20,
    height: WINDOW_WIDTH * 0.4 - 20,
    borderRadius: (WINDOW_WIDTH * 0.4 - 20) / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earnedBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 2,
  },
  nextMilestoneInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nextMilestoneTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  nextMilestoneText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2196F3',
    marginBottom: 8,
  },
  nextMilestoneDesc: {
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
  },
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  celebrationContainer: {
    width: '90%',
    maxWidth: 350,
    alignItems: 'center',
  },
  confetti: {
    width: '100%',
    height: 300,
    position: 'absolute',
    top: -50,
    left: 0,
    right: 0,
  },
  celebrationContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  celebrationTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 8,
  },
  celebrationSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#424242',
    marginBottom: 24,
  },
  celebrationMedallion: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  celebrationMedallionText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  celebrationMedallionDays: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 4,
    textAlign: 'center',
  },
  celebrationMessage: {
    fontSize: 16,
    color: '#616161',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  closeCelebrationButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  closeCelebrationText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noDateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noDateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  noDateText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  setDateButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  setDateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default SobrietyTrackerScreen;
