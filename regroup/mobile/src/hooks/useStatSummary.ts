/**
 * useStatSummary Hook
 *
 * Custom hook that provides stat summary functionality for the stat screens.
 * Replaces the class-based BaseStatSummary with composable hook logic.
 *
 * Data sources (all from the new Activity model — no legacy reads):
 *   - Current week stats  → useWeekSummary  → 'week-summaries' Firestore collection
 *   - Historical bar graph → useWeekSummaryHistory → 'week-summaries' Firestore collection
 *   - Disputed count      → useActivityCount  → 'activities' Firestore collection
 */

import { useMemo, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { useAppSelector } from '../state/store';
import { useSelectedHouse } from './useSelectedHouse';
import { useSelectedGuest } from './useSelectedGuest';
import { Guest, Stat } from '../entities/Guest';
import { House } from '../entities/House';
import { User } from '../entities/User';
import {
  getPercentage,
  getHealthByPercentage,
  HEALTH_COLOR_MAP,
  getPhaseRule,
} from '../util/guest';
import { getTodaysDate, daysLeft } from '../util/display';
import {
  useWeekSummary,
  useWeekSummaryHistory,
  useActivityCount,
  useCurrentWeek,
} from './activity';
import { WeekStats } from '../entities/WeekSummary';
import { ActivityType, ActivityStatus } from '../entities/ActivityModel';

export interface StatSummaryData {
  guest: Guest | null;
  house: House | null;
  user: User | null;
  isLoading: boolean;
  isError: boolean;

  // Computed values for the stat
  statSum: number;
  phaseRule: number;
  percentage: number;
  disputes: number;
  daysRemaining: number;
  /** Historical bar graph data — sourced from 'week-summaries' Firestore collection */
  graphData: Array<{ x: string; y: number }>;

  // Helper functions
  getBarFillColor: (dataPoint: { y: number }) => string;
}

// Maps Stat keys to WeekStats keys in the 'week-summaries' collection
const STAT_TO_WEEK_STATS_KEY: Record<Stat, keyof WeekStats> = {
  choreCompleted: 'choresCompleted',
  meeting: 'meetingsAttended',
  hoursWorked: 'hoursWorked',
  medication: 'medicationTaken',
  metPrimarySupporter: 'primarySupporterMet',
};

// Maps Stat keys to ActivityType enum values for dispute queries
const STAT_TO_ACTIVITY_TYPE: Record<Stat, ActivityType> = {
  meeting: ActivityType.MEETING,
  medication: ActivityType.MEDICATION,
  metPrimarySupporter: ActivityType.PRIMARY_SUPPORTER,
  hoursWorked: ActivityType.WORK,
  choreCompleted: ActivityType.CHORE,
};

/**
 * Hook to get stat summary data and calculations.
 *
 * All data is sourced from the new Activity model:
 *   - statSum / percentage → current week's WeekSummary document ('week-summaries' collection)
 *   - graphData            → last 8 WeekSummary documents ('week-summaries' collection)
 *   - disputes             → disputed Activity documents ('activities' collection)
 *
 * @param stat - The stat type to calculate for
 */
export const useStatSummary = (stat: Stat): StatSummaryData => {
  // Get data from Redux
  const { guest } = useSelectedGuest();
  const { house } = useSelectedHouse();
  const user = useAppSelector((state: any) => state.user.user) as User | null;

  // Get current week dates
  const { startDate, endDate } = useCurrentWeek();

  // Current week stats — sourced from 'week-summaries' Firestore collection
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
  } = useWeekSummary(guest?.id, house?.id, startDate);

  // Historical stats for the bar graph — sourced from 'week-summaries' Firestore collection
  // Fetch last 8 weeks so the graph always has data to display
  const {
    summaries: historicalSummaries,
    loading: historyLoading,
    error: historyError,
  } = useWeekSummaryHistory(guest?.id, house?.id, 8);

  const statSum = useMemo(() => {
    if (!summary) return 0;
    return summary.stats[STAT_TO_WEEK_STATS_KEY[stat]] || 0;
  }, [summary, stat]);

  // Get phase rule (required amount for stat)
  const phaseRule = useMemo(() => {
    if (!house || !guest) return 0;
    return getPhaseRule(house, guest, stat);
  }, [house, guest, stat]);

  // Calculate percentage
  const percentage = useMemo(() => {
    return getPercentage(statSum, phaseRule);
  }, [statSum, phaseRule]);

  // Get disputed activities count — sourced from 'activities' Firestore collection
  const { count: disputedActivitiesCount, loading: disputesLoading } =
    useActivityCount({
      guestId: guest?.id,
      startDate,
      endDate,
      type: STAT_TO_ACTIVITY_TYPE[stat],
      status: ActivityStatus.DISPUTED,
    });

  const disputes = disputedActivitiesCount;

  // Days remaining in the week
  const daysRemaining = useMemo(() => daysLeft(getTodaysDate()), []);

  // Build bar graph data from historical WeekSummary documents.
  // historicalSummaries is ordered newest-first (desc), so we reverse to plot
  // oldest-left → newest-right as expected by the bar graph component.
  const graphData = useMemo(() => {
    if (!historicalSummaries || historicalSummaries.length === 0) return [];

    // historicalSummaries comes back newest-first from Firestore orderBy desc.
    // Reverse a copy so the bar graph shows oldest week on the left.
    return [...historicalSummaries].reverse().map(weekSummary => ({
      x: format(parseISO(weekSummary.startDate), 'MM/dd'),
      y: weekSummary.stats[STAT_TO_WEEK_STATS_KEY[stat]] || 0,
    }));
  }, [historicalSummaries, stat]);

  // Get bar fill color based on stat value
  const getBarFillColor = useCallback(
    (dataPoint: { y: number }): string => {
      const health = getHealthByPercentage(
        getPercentage(dataPoint.y, phaseRule),
      );
      return HEALTH_COLOR_MAP[health];
    },
    [phaseRule],
  );

  return {
    guest,
    house,
    user,
    isLoading: summaryLoading || historyLoading || disputesLoading,
    isError: summaryError != null || historyError != null,
    statSum,
    phaseRule,
    percentage,
    disputes,
    daysRemaining,
    graphData,
    getBarFillColor,
  };
};

export default useStatSummary;
