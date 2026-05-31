import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  VictoryChart,
  VictoryBar,
  VictoryAxis,
  VictoryTheme,
} from 'victory-native';
import {ProfileStackParamList} from '../../types/navigation';

type MyRecoveryJourneyNavProp = StackNavigationProp<ProfileStackParamList>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48;

// Standard sobriety milestones in days
const MILESTONES_DAYS: {days: number; label: string}[] = [
  {days: 30, label: '30d'},
  {days: 60, label: '60d'},
  {days: 90, label: '90d'},
  {days: 180, label: '180d'},
  {days: 365, label: '1yr'},
  {days: 730, label: '2yr'},
  {days: 1095, label: '3yr'},
];

interface JourneyData {
  sobrietyDays: number;
  sobrietyStartDate: Date | null;
  checkInStreak: {currentStreak: number; longestStreak: number};
  meetingsThisYear: number;
  meetingsTotal: number;
  meetingsByMonth: {month: string; count: number}[];
  currentStep: number;
  totalSteps: number;
  stepStartDate: Date | null;
  gratitudeEntriesThisYear: number;
  gratitudeLastEntry: string | null;
  gratitudeHeatmap: boolean[]; // 84 days (12 weeks) of booleans
}

const getMonthLabel = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
};

const MyRecoveryJourneyScreen: React.FC = () => {
  const navigation = useNavigation<MyRecoveryJourneyNavProp>();
  const [journeyData, setJourneyData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    setLoading(true);
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const yearStart = new Date(currentYear, 0, 1);

      const [userSnap, stepSnap, gratitudeSnap, meetingSnap] =
        await Promise.all([
          // 1. User doc
          firestore().collection('users').doc(uid).get(),

          // 2. Step progress
          firestore()
            .collection('users')
            .doc(uid)
            .collection('stepProgress')
            .doc('current')
            .get()
            .catch(() => null),

          // 3. Gratitude entries this year
          firestore()
            .collection('users')
            .doc(uid)
            .collection('gratitudeEntries')
            .where('date', '>=', `${currentYear}-01-01`)
            .get()
            .catch(() => null),

          // 4. Meeting instances attended this year (requires composite index)
          firestore()
            .collection('meetingInstances')
            .where('attendees', 'array-contains', uid)
            .where('scheduledAt', '>=', yearStart)
            .get()
            .catch(() => null),
        ]);

      // Sobriety calculation
      const userData = userSnap.data() || {};
      let sobrietyDays = 0;
      let sobrietyStartDate: Date | null = null;

      if (userData.sobrietyStartDate) {
        sobrietyStartDate = userData.sobrietyStartDate.toDate
          ? userData.sobrietyStartDate.toDate()
          : new Date(userData.sobrietyStartDate);
        const diffMs = now.getTime() - sobrietyStartDate!.getTime();
        sobrietyDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      // Check-in streak
      const checkInStreak = {
        currentStreak: userData.checkInStreak?.currentStreak || 0,
        longestStreak: userData.checkInStreak?.longestStreak || 0,
      };

      // Step work
      const stepData = stepSnap?.data() || {};
      const currentStep = stepData.currentStep || 0;
      const totalSteps = 12;
      let stepStartDate: Date | null = null;
      if (stepData.stepStartDate) {
        stepStartDate = stepData.stepStartDate.toDate
          ? stepData.stepStartDate.toDate()
          : new Date(stepData.stepStartDate);
      }

      // Gratitude entries
      const gratitudeDates = new Set<string>();
      if (gratitudeSnap) {
        gratitudeSnap.forEach(doc => {
          const docData = doc.data();
          if (docData.date) gratitudeDates.add(docData.date);
        });
      }
      const gratitudeEntriesThisYear = gratitudeDates.size;

      // Gratitude last entry
      const sortedDates = Array.from(gratitudeDates).sort().reverse();
      const gratitudeLastEntry = sortedDates.length > 0 ? sortedDates[0] : null;

      // Gratitude heatmap: last 84 days
      const heatmapDays = 84;
      const gratitudeHeatmap: boolean[] = [];
      for (let i = heatmapDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          '0',
        )}-${String(d.getDate()).padStart(2, '0')}`;
        gratitudeHeatmap.push(gratitudeDates.has(key));
      }

      // Meeting attendance
      let meetingsThisYear = 0;
      const meetingsByMonthMap: Record<string, number> = {};

      if (meetingSnap) {
        meetingSnap.forEach(doc => {
          meetingsThisYear++;
          const instData = doc.data();
          const scheduled = instData.scheduledAt?.toDate
            ? instData.scheduledAt.toDate()
            : new Date(instData.scheduledAt);
          const monthLabel = getMonthLabel(scheduled);
          meetingsByMonthMap[monthLabel] =
            (meetingsByMonthMap[monthLabel] || 0) + 1;
        });
      }

      // Build last 6 months of meeting data
      const meetingsByMonth: {month: string; count: number}[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = getMonthLabel(d);
        meetingsByMonth.push({
          month: label,
          count: meetingsByMonthMap[label] || 0,
        });
      }

      // For meetingsTotal, we do a best-effort count (this year only since we only queried this year)
      const meetingsTotal = meetingsThisYear; // Simplified — full history would require additional query

      setJourneyData({
        sobrietyDays,
        sobrietyStartDate,
        checkInStreak,
        meetingsThisYear,
        meetingsTotal,
        meetingsByMonth,
        currentStep,
        totalSteps,
        stepStartDate,
        gratitudeEntriesThisYear,
        gratitudeLastEntry,
        gratitudeHeatmap,
      });
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.message || 'Failed to load recovery journey data.',
      );
    } finally {
      setLoading(false);
    }
  };

  const formatSobrietyDate = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMonthShort = (label: string): string => {
    const [year, month] = label.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleString('en-US', {month: 'short'});
  };

  const getStepStartDaysAgo = (date: Date | null): string => {
    if (!date) return '';
    const diff = Math.floor(
      (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    return `${diff} days ago`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Loading your journey...</Text>
      </View>
    );
  }

  if (!journeyData) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="account-off" size={48} color="#BDBDBD" />
        <Text style={styles.emptyText}>No recovery data found.</Text>
      </View>
    );
  }

  const {
    sobrietyDays,
    sobrietyStartDate,
    checkInStreak,
    meetingsThisYear,
    meetingsByMonth,
    currentStep,
    totalSteps,
    stepStartDate,
    gratitudeEntriesThisYear,
    gratitudeLastEntry,
    gratitudeHeatmap,
  } = journeyData;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      testID="my-recovery-journey-scroll">
      {/* SOBRIETY */}
      <View style={[styles.card, styles.sobrietyCard]}>
        <Text style={styles.sobrietyTitle}>My Sobriety</Text>
        <Text style={styles.sobrietyDays}>{sobrietyDays} Days</Text>
        {sobrietyStartDate && (
          <Text style={styles.sobrietySubtext}>
            Sober since {formatSobrietyDate(sobrietyStartDate)}
          </Text>
        )}

        {/* Milestones */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.milestonesScroll}>
          {MILESTONES_DAYS.map(m => {
            const achieved = sobrietyDays >= m.days;
            return (
              <View
                key={m.label}
                style={[
                  styles.milestoneChip,
                  achieved
                    ? styles.milestoneChipDone
                    : styles.milestoneChipPending,
                ]}>
                {achieved && (
                  <Icon
                    name="check"
                    size={12}
                    color="#FFFFFF"
                    style={{marginRight: 2}}
                  />
                )}
                <Text
                  style={[
                    styles.milestoneChipText,
                    achieved
                      ? styles.milestoneChipTextDone
                      : styles.milestoneChipTextPending,
                  ]}>
                  {m.label}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.seeMoreLink}
          onPress={() => navigation.navigate('SobrietyTracker')}
          testID="sobriety-tracker-link">
          <Text style={styles.seeMoreText}>View Sobriety Tracker →</Text>
        </TouchableOpacity>
      </View>

      {/* MEETING ATTENDANCE */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="calendar-check" size={20} color="#388E3C" />
          <Text style={styles.cardTitle}>Meetings Attended</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{meetingsThisYear}</Text>
            <Text style={styles.statLabel}>This year</Text>
          </View>
        </View>

        {meetingsByMonth.some(m => m.count > 0) ? (
          <VictoryChart
            width={CHART_WIDTH}
            height={160}
            theme={VictoryTheme.material}
            domainPadding={{x: 20}}>
            <VictoryAxis
              tickFormat={label => formatMonthShort(label)}
              style={{
                tickLabels: {fontSize: 10, fill: '#757575'},
                grid: {stroke: 'none'},
              }}
            />
            <VictoryAxis
              dependentAxis
              style={{
                tickLabels: {fontSize: 10, fill: '#757575'},
                grid: {stroke: '#F0F0F0'},
              }}
            />
            <VictoryBar
              data={meetingsByMonth.map(m => ({x: m.month, y: m.count}))}
              style={{data: {fill: '#388E3C'}}}
              animate={{duration: 400}}
            />
          </VictoryChart>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyChartText}>
              No meeting attendance data yet.
            </Text>
          </View>
        )}

        <View style={styles.streakRow}>
          <Text style={styles.streakText}>
            Current streak:{' '}
            <Text style={styles.streakValue}>
              {checkInStreak.currentStreak} days
            </Text>
          </Text>
          <Text style={styles.streakText}>
            Longest:{' '}
            <Text style={styles.streakValue}>
              {checkInStreak.longestStreak} days
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={styles.seeMoreLink}
          onPress={() => navigation.navigate('CheckInStreak')}
          testID="check-in-streak-link">
          <Text style={styles.seeMoreText}>View Check-In Streak →</Text>
        </TouchableOpacity>
      </View>

      {/* STEP WORK */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="stairs" size={20} color="#7B1FA2" />
          <Text style={styles.cardTitle}>Step Work</Text>
        </View>
        <Text style={styles.stepProgress}>
          Step {currentStep} of {totalSteps}
        </Text>

        {/* Steps grid */}
        <View style={styles.stepsGrid}>
          {Array.from({length: totalSteps}, (_, i) => i + 1).map(step => {
            const completed = step < currentStep;
            const current = step === currentStep;
            return (
              <TouchableOpacity
                key={step}
                style={[
                  styles.stepCircle,
                  completed && styles.stepCircleCompleted,
                  current && styles.stepCircleCurrent,
                ]}
                onPress={() => navigation.navigate('StepTracker')}
                testID={`step-circle-${step}`}>
                <Text
                  style={[
                    styles.stepCircleText,
                    (completed || current) && styles.stepCircleTextDone,
                  ]}>
                  {step}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {stepStartDate && currentStep > 0 && (
          <Text style={styles.stepSubtext}>
            Started Step {currentStep} {getStepStartDaysAgo(stepStartDate)}
          </Text>
        )}

        <TouchableOpacity
          style={styles.seeMoreLink}
          onPress={() => navigation.navigate('StepTracker')}
          testID="step-tracker-link">
          <Text style={styles.seeMoreText}>Open Step Tracker →</Text>
        </TouchableOpacity>
      </View>

      {/* GRATITUDE JOURNAL */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="heart" size={20} color="#E91E63" />
          <Text style={styles.cardTitle}>Gratitude Journal</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{gratitudeEntriesThisYear}</Text>
            <Text style={styles.statLabel}>Entries this year</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {gratitudeLastEntry
                ? gratitudeLastEntry === new Date().toISOString().split('T')[0]
                  ? 'today'
                  : gratitudeLastEntry
                : 'None'}
            </Text>
            <Text style={styles.statLabel}>Last entry</Text>
          </View>
        </View>

        {/* Calendar heatmap: 12 weeks × 7 days */}
        <View style={styles.heatmapContainer}>
          {Array.from({length: 12}, (_, week) => (
            <View key={week} style={styles.heatmapColumn}>
              {Array.from({length: 7}, (_, day) => {
                const idx = week * 7 + day;
                const hasEntry =
                  idx < gratitudeHeatmap.length && gratitudeHeatmap[idx];
                return (
                  <View
                    key={day}
                    style={[
                      styles.heatmapCell,
                      hasEntry
                        ? styles.heatmapCellFilled
                        : styles.heatmapCellEmpty,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.seeMoreLink}
          onPress={() => navigation.navigate('GratitudeJournal')}
          testID="gratitude-journal-link">
          <Text style={styles.seeMoreText}>Open Gratitude Journal →</Text>
        </TouchableOpacity>
      </View>

      {/* RECOVERY HIGHLIGHTS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="trophy" size={20} color="#FFA000" />
          <Text style={styles.cardTitle}>Recovery Highlights</Text>
        </View>
        <View style={styles.highlightItem}>
          <Icon name="trophy-outline" size={24} color="#FFA000" />
          <Text style={styles.highlightText}>
            Longest streak:{' '}
            <Text style={styles.highlightValue}>
              {checkInStreak.longestStreak} days
            </Text>
          </Text>
        </View>
        <View style={styles.highlightItem}>
          <Icon name="star-outline" size={24} color="#7B1FA2" />
          <Text style={styles.highlightText}>
            Steps completed:{' '}
            <Text style={styles.highlightValue}>
              {Math.max(0, currentStep - 1)} of {totalSteps}
            </Text>
          </Text>
        </View>
        <View style={styles.highlightItem}>
          <Icon name="heart-outline" size={24} color="#E91E63" />
          <Text style={styles.highlightText}>
            Gratitude entries:{' '}
            <Text style={styles.highlightValue}>
              {gratitudeEntriesThisYear} this year
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.footer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  contentContainer: {paddingBottom: 24},
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  loadingText: {marginTop: 12, fontSize: 14, color: '#757575'},
  emptyText: {fontSize: 14, color: '#9E9E9E', marginTop: 12},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    marginBottom: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sobrietyCard: {
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
  },
  sobrietyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sobrietyDays: {
    fontSize: 56,
    fontWeight: '800',
    color: '#1565C0',
  },
  sobrietySubtext: {fontSize: 14, color: '#1976D2', marginTop: 4},
  milestonesScroll: {marginTop: 16, marginBottom: 4},
  milestoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
  },
  milestoneChipDone: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  milestoneChipPending: {
    backgroundColor: '#FFFFFF',
    borderColor: '#90CAF9',
  },
  milestoneChipText: {fontSize: 12, fontWeight: '600'},
  milestoneChipTextDone: {color: '#FFFFFF'},
  milestoneChipTextPending: {color: '#90CAF9'},
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginLeft: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statItem: {alignItems: 'center', flex: 1},
  statValue: {fontSize: 24, fontWeight: '700', color: '#212121'},
  statLabel: {fontSize: 12, color: '#757575', marginTop: 2},
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  streakText: {fontSize: 12, color: '#757575'},
  streakValue: {fontWeight: '700', color: '#212121'},
  stepProgress: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7B1FA2',
    marginBottom: 12,
  },
  stepsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleCompleted: {
    backgroundColor: '#7B1FA2',
    borderColor: '#7B1FA2',
  },
  stepCircleCurrent: {
    backgroundColor: '#CE93D8',
    borderColor: '#7B1FA2',
  },
  stepCircleText: {fontSize: 14, fontWeight: '600', color: '#9E9E9E'},
  stepCircleTextDone: {color: '#FFFFFF'},
  stepSubtext: {fontSize: 12, color: '#9E9E9E', marginBottom: 8},
  heatmapContainer: {
    flexDirection: 'row',
    marginVertical: 12,
    alignSelf: 'center',
  },
  heatmapColumn: {flexDirection: 'column', marginRight: 3},
  heatmapCell: {
    width: 14,
    height: 14,
    borderRadius: 2,
    marginBottom: 3,
  },
  heatmapCellFilled: {backgroundColor: '#4CAF50'},
  heatmapCellEmpty: {backgroundColor: '#F5F5F5'},
  seeMoreLink: {marginTop: 12},
  seeMoreText: {color: '#1976D2', fontSize: 13, fontWeight: '500'},
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  highlightText: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 12,
    flex: 1,
  },
  highlightValue: {fontWeight: '700', color: '#212121'},
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyChartText: {fontSize: 13, color: '#9E9E9E', textAlign: 'center'},
  footer: {height: 24},
});

export default MyRecoveryJourneyScreen;
