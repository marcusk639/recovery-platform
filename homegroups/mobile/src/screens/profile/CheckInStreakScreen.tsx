import React, {useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchStreak,
  recordCheckIn,
  selectStreakData,
  selectStreakStatus,
  selectCheckedInToday,
} from '../../store/slices/engagementSlice';
import {theme} from '../../theme/theme';

const CheckInStreakScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();

  const streakData = useAppSelector(selectStreakData);
  const streakStatus = useAppSelector(selectStreakStatus);
  const checkedInToday = useAppSelector(selectCheckedInToday);

  const isLoading = streakStatus === 'loading';

  useEffect(() => {
    dispatch(fetchStreak());
  }, [dispatch]);

  const handleCheckIn = useCallback(async () => {
    if (checkedInToday) {
      Alert.alert(
        'Already Checked In',
        'You have already checked in today. Come back tomorrow to keep your streak going!',
      );
      return;
    }

    try {
      await dispatch(recordCheckIn()).unwrap();
    } catch (err: any) {
      Alert.alert('Error', err ?? 'Failed to record check-in. Please try again.');
    }
  }, [checkedInToday, dispatch]);

  const getStreakMessage = (): string => {
    if (!streakData) return 'Start your streak today!';
    const {currentStreak} = streakData;
    if (currentStreak === 0) return 'Check in today to start your streak!';
    if (currentStreak === 1) return 'Great start! Check in tomorrow to build your streak.';
    if (currentStreak < 7) return `${currentStreak} days strong! Keep it up.`;
    if (currentStreak < 30) return `Amazing! ${currentStreak} days in a row!`;
    if (currentStreak < 90) return `Incredible! ${currentStreak}-day streak!`;
    return `Phenomenal! ${currentStreak} days of consecutive check-ins!`;
  };

  const getStreakColor = (): string => {
    if (!streakData) return theme.colors.neutral.grey400;
    const {currentStreak} = streakData;
    if (currentStreak === 0) return theme.colors.neutral.grey400;
    if (currentStreak < 7) return theme.colors.primary.main;
    if (currentStreak < 30) return '#FF9800'; // orange
    return '#F44336'; // red — fire!
  };

  // Build last 7 days display
  const getLast7Days = (): {date: string; label: string; checked: boolean}[] => {
    const result = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const checkInSet = new Set(streakData?.checkInDates ?? []);

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        label: days[d.getUTCDay()],
        checked: checkInSet.has(dateStr),
      });
    }
    return result;
  };

  const last7 = getLast7Days();
  const streakColor = getStreakColor();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon
            name="chevron-back"
            size={24}
            color={theme.colors.neutral.grey800}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Check-in Streak</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView}>
        {isLoading && !streakData ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary.main}
            style={styles.loader}
          />
        ) : (
          <>
            {/* Streak counter */}
            <View style={styles.streakCard}>
              <View style={[styles.streakCircle, {borderColor: streakColor}]}>
                <Icon
                  name="flame"
                  size={40}
                  color={streakColor}
                  style={styles.flameIcon}
                />
                <Text style={[styles.streakNumber, {color: streakColor}]}>
                  {streakData?.currentStreak ?? 0}
                </Text>
                <Text style={styles.streakLabel}>day streak</Text>
              </View>

              <Text style={styles.streakMessage}>{getStreakMessage()}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {streakData?.currentStreak ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Current</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {streakData?.longestStreak ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Best</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {streakData?.checkInDates?.length ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>This Month</Text>
                </View>
              </View>
            </View>

            {/* Last 7 days calendar */}
            <View style={styles.calendarCard}>
              <Text style={styles.calendarTitle}>Last 7 Days</Text>
              <View style={styles.calendarRow}>
                {last7.map(day => (
                  <View key={day.date} style={styles.dayContainer}>
                    <Text style={styles.dayLabel}>{day.label}</Text>
                    <View
                      style={[
                        styles.dayDot,
                        day.checked
                          ? {backgroundColor: streakColor}
                          : styles.dayDotEmpty,
                      ]}>
                      {day.checked && (
                        <Icon name="checkmark" size={12} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Check-in button */}
            <TouchableOpacity
              style={[
                styles.checkInButton,
                checkedInToday && styles.checkInButtonDone,
                isLoading && styles.checkInButtonDisabled,
              ]}
              onPress={handleCheckIn}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : checkedInToday ? (
                <>
                  <Icon name="checkmark-circle" size={24} color="#FFFFFF" />
                  <Text style={styles.checkInButtonText}>
                    Checked In Today!
                  </Text>
                </>
              ) : (
                <>
                  <Icon name="log-in-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.checkInButtonText}>Check In Now</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.checkInHint}>
              Check in daily to build your streak. Missing a day resets it to 1.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.grey200,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.neutral.grey900,
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  loader: {
    marginTop: theme.spacing.xxl,
  },
  streakCard: {
    backgroundColor: theme.colors.background.primary,
    margin: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  streakCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.neutral.grey50,
  },
  flameIcon: {
    marginBottom: 2,
  },
  streakNumber: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
  },
  streakLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey500,
  },
  streakMessage: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey700,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.grey200,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.neutral.grey500,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.neutral.grey200,
  },
  calendarCard: {
    backgroundColor: theme.colors.background.primary,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  calendarTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.neutral.grey800,
    marginBottom: theme.spacing.md,
  },
  calendarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayContainer: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dayLabel: {
    fontSize: 11,
    color: theme.colors.neutral.grey500,
    fontWeight: '500',
  },
  dayDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotEmpty: {
    backgroundColor: theme.colors.neutral.grey200,
  },
  checkInButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary.main,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    minHeight: 56,
    ...theme.shadows.md,
  },
  checkInButtonDone: {
    backgroundColor: theme.colors.secondary.main,
  },
  checkInButtonDisabled: {
    opacity: 0.6,
  },
  checkInButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
  },
  checkInHint: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.neutral.grey500,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
});

export default CheckInStreakScreen;
