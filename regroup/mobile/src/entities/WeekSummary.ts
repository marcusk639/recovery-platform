import * as yup from 'yup';
import { BaseEntity } from './BaseEntity';

/**
 * Daily Stats - Aggregated stats for a single day
 */
export interface DailyStats {
  date: string; // ISO date string (YYYY-MM-DD)
  choresCompleted: number;
  meetingsAttended: number;
  hoursWorked: number;
  medicationTaken: number;
  primarySupporterMet: number;
}

/**
 * Week Stats - Aggregated stats for the entire week
 */
export interface WeekStats {
  choresCompleted: number;
  meetingsAttended: number;
  hoursWorked: number;
  medicationTaken: number;
  primarySupporterMet: number;
}

/**
 * WeekSummary Interface
 * Pre-aggregated weekly statistics for fast reads
 * Replaces the need to iterate through all activities
 */
export interface WeekSummary {
  id: string; // Format: {guestId}_{startDate}
  guestId: string;
  houseId: string;
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)

  // Aggregated stats for the entire week
  stats: WeekStats;

  // Daily breakdown (keyed by date string)
  dailyStats: {
    [date: string]: DailyStats;
  };

  // Metadata
  lastUpdated: Date | string | null;
  activityCount: number; // Total number of activities in this week

  // Optional: Track which phase requirements are met
  phaseRequirementsMet?: {
    chores?: boolean;
    meetings?: boolean;
    work?: boolean;
    medication?: boolean;
    primarySupporter?: boolean;
  };
}

/**
 * WeekSummary Entity Class
 */
export class WeekSummaryEntity extends BaseEntity implements WeekSummary {
  id: string = '';
  guestId: string = '';
  houseId: string = '';
  startDate: string = '';
  endDate: string = '';
  stats: WeekStats = {
    choresCompleted: 0,
    meetingsAttended: 0,
    hoursWorked: 0,
    medicationTaken: 0,
    primarySupporterMet: 0,
  };
  dailyStats: { [date: string]: DailyStats } = {};
  lastUpdated: Date = new Date();
  activityCount: number = 0;
  phaseRequirementsMet?: {
    chores?: boolean;
    meetings?: boolean;
    work?: boolean;
    medication?: boolean;
    primarySupporter?: boolean;
  };

  constructor(
    guestId: string,
    houseId: string,
    startDate: string,
    endDate: string,
  ) {
    super();
    this.id = `${guestId}_${startDate}`;
    this.guestId = guestId;
    this.houseId = houseId;
    this.startDate = startDate;
    this.endDate = endDate;
  }
}

/**
 * Validation Schema for WeekSummary
 */
export const weekSummarySchema = yup.object().shape({
  id: yup.string().required('Week summary ID is required'),
  guestId: yup.string().required('Guest ID is required'),
  houseId: yup.string().required('House ID is required'),
  startDate: yup.string().required('Start date is required'),
  endDate: yup.string().required('End date is required'),
  stats: yup.object().shape({
    choresCompleted: yup.number().min(0).default(0),
    meetingsAttended: yup.number().min(0).default(0),
    hoursWorked: yup.number().min(0).default(0),
    medicationTaken: yup.number().min(0).default(0),
    primarySupporterMet: yup.number().min(0).default(0),
  }),
  dailyStats: yup.object(),
  // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
  lastUpdated: yup.date().required(),
  activityCount: yup.number().min(0).default(0),
});

/**
 * Helper to create empty daily stats
 */
export function createEmptyDailyStats(date: string): DailyStats {
  return {
    date,
    choresCompleted: 0,
    meetingsAttended: 0,
    hoursWorked: 0,
    medicationTaken: 0,
    primarySupporterMet: 0,
  };
}

/**
 * Helper to create empty week stats
 */
export function createEmptyWeekStats(): WeekStats {
  return {
    choresCompleted: 0,
    meetingsAttended: 0,
    hoursWorked: 0,
    medicationTaken: 0,
    primarySupporterMet: 0,
  };
}

/**
 * Helper to initialize daily stats for a week
 * Creates empty stats for each day of the week
 */
export function initializeDailyStats(
  startDate: string,
  endDate: string,
): {
  [date: string]: DailyStats;
} {
  const dailyStats: { [date: string]: DailyStats } = {};
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    dailyStats[dateStr] = createEmptyDailyStats(dateStr);
    current.setDate(current.getDate() + 1);
  }

  return dailyStats;
}

/**
 * Type guard for WeekSummary
 */
export function isWeekSummary(obj: any): obj is WeekSummary {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      typeof obj.id === 'string' &&
      typeof obj.guestId === 'string' &&
      typeof obj.stats === 'object' &&
      typeof obj.dailyStats === 'object',
  );
}

// Note: No default export - use named export WeekSummary
