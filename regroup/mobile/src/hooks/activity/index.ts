/**
 * Activity Hooks Index
 *
 * Centralized exports for all Activity system hooks
 */

// Week summary hooks
export {
  useWeekSummary,
  useWeekSummaryHistory,
  getWeekSummaryOnce,
  type UseWeekSummaryResult,
} from './useWeekSummary';

// Activity hooks
export {
  useActivities,
  useActivityCount,
  useDisputedActivities,
  useActivitiesByDate,
  getActivitiesOnce,
  type UseActivitiesOptions,
  type UseActivitiesResult,
} from './useActivities';

// Date utilities
export {
  useCurrentWeek,
  getWeekDatesForDate,
  isInCurrentWeek,
  getPreviousWeek,
  getNextWeek,
  type WeekDates,
} from './useCurrentWeek';
