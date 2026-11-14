/**
 * useCurrentWeek Hook
 *
 * Provides current week date boundaries (Monday to Sunday)
 * Used to query activities and summaries for the current week
 */

import { useMemo } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

// The same as the server's DEFAULT_SUMMARY_TIME_ZONE. Weeks here must match
// weekStartFor in functions/src/activities/weekSummaryMath.ts, which decides the
// week an activity counts toward.
const DEFAULT_WEEK_TIME_ZONE = 'America/New_York';

/** A house's zone if it is a valid IANA name, otherwise the server's default. */
export function resolveWeekTimeZone(timeZone?: string | null): string {
  if (timeZone) {
    try {
      formatInTimeZone(new Date(0), timeZone, 'yyyy');
      return timeZone;
    } catch {
      // RangeError: not a zone this runtime knows.
    }
  }
  return DEFAULT_WEEK_TIME_ZONE;
}

const localDate = (date: Date, timeZone?: string | null): string =>
  formatInTimeZone(date, resolveWeekTimeZone(timeZone), 'yyyy-MM-dd');

/**
 * Get the Monday of the week containing `date`, in the house's timezone
 */
function getWeekStart(date: Date = new Date(), timeZone?: string | null): string {
  const d = new Date(`${localDate(date, timeZone)}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day)); // Adjust for Sunday
  return d.toISOString().split('T')[0];
}

/**
 * Get the Sunday of the current week (6 days after Monday)
 */
function getWeekEnd(startDate: string): string {
  const d = new Date(startDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

export interface WeekDates {
  startDate: string; // Monday (YYYY-MM-DD)
  endDate: string; // Sunday (YYYY-MM-DD)
  weekNumber: number; // Week number in year
  year: number;
}

/**
 * Hook to get current week boundaries
 *
 * @param timeZone - The house's timezone, so the week matches the server's
 * @returns Week date boundaries and metadata
 */
export function useCurrentWeek(timeZone?: string | null): WeekDates {
  return useMemo(() => {
    const now = new Date();
    const startDate = getWeekStart(now, timeZone);
    const endDate = getWeekEnd(startDate);

    // Calculate week number
    const start = new Date(startDate + 'T00:00:00Z');
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(
      ((start.getTime() - yearStart.getTime()) / 86400000 + yearStart.getUTCDay() + 1) / 7
    );

    return {
      startDate,
      endDate,
      weekNumber,
      year: start.getUTCFullYear(),
    };
  }, [timeZone]); // Only recalculates when the zone arrives or changes
}

/**
 * Get week dates for a specific date
 *
 * @param date - Date to get week boundaries for
 * @param timeZone - The house's timezone
 * @returns Week date boundaries
 */
export function getWeekDatesForDate(date: Date | string, timeZone?: string | null): {
  startDate: string;
  endDate: string;
} {
  const d = typeof date === 'string' ? new Date(date) : date;
  const startDate = getWeekStart(d, timeZone);
  const endDate = getWeekEnd(startDate);

  return { startDate, endDate };
}

/** Whole days from today in the house's timezone to the week's last day. Sunday is 0. */
export function daysLeftInWeek(
  endDate: string,
  now: Date = new Date(),
  timeZone?: string | null,
): number {
  const today = Date.parse(`${localDate(now, timeZone)}T00:00:00Z`);
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - today) / 86_400_000);
}

/**
 * Check if a date is in the current week
 */
export function isInCurrentWeek(date: Date | string): boolean {
  const startDate = getWeekStart();
  const endDate = getWeekEnd(startDate);
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

  return dateStr >= startDate && dateStr <= endDate;
}

/**
 * Get previous week dates
 */
export function getPreviousWeek(): { startDate: string; endDate: string } {
  const currentStartDate = getWeekStart();
  const currentStart = new Date(currentStartDate + 'T00:00:00Z');
  currentStart.setUTCDate(currentStart.getUTCDate() - 7);

  const prevStartDate = currentStart.toISOString().split('T')[0];
  const prevEndDate = getWeekEnd(prevStartDate);

  return { startDate: prevStartDate, endDate: prevEndDate };
}

/**
 * Get next week dates
 */
export function getNextWeek(): { startDate: string; endDate: string } {
  const currentStartDate = getWeekStart();
  const currentStart = new Date(currentStartDate + 'T00:00:00Z');
  currentStart.setUTCDate(currentStart.getUTCDate() + 7);

  const nextStartDate = currentStart.toISOString().split('T')[0];
  const nextEndDate = getWeekEnd(nextStartDate);

  return { startDate: nextStartDate, endDate: nextEndDate };
}
