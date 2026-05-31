/**
 * useCurrentWeek Hook
 *
 * Provides current week date boundaries (Monday to Sunday)
 * Used to query activities and summaries for the current week
 */

import { useMemo } from 'react';

/**
 * Get the Monday of the current week
 */
function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
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
 * @returns Week date boundaries and metadata
 */
export function useCurrentWeek(): WeekDates {
  return useMemo(() => {
    const now = new Date();
    const startDate = getWeekStart(now);
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
  }, []); // Empty deps - only calculates once per component mount
}

/**
 * Get week dates for a specific date
 *
 * @param date - Date to get week boundaries for
 * @returns Week date boundaries
 */
export function getWeekDatesForDate(date: Date | string): {
  startDate: string;
  endDate: string;
} {
  const d = typeof date === 'string' ? new Date(date) : date;
  const startDate = getWeekStart(d);
  const endDate = getWeekEnd(startDate);

  return { startDate, endDate };
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
