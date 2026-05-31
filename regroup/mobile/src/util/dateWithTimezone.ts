/**
 * Timezone-aware date utilities for accurate stat tracking
 *
 * FIX #1: All date operations now use a consistent timezone strategy:
 * - Storage: Always use the house's timezone for date keys
 * - Display: Convert to user's local timezone for display only
 * - Week boundaries: Calculated in house timezone
 */
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  startOfDay,
  endOfDay,
  isWithinInterval,
  differenceInDays,
  isValid,
  parse,
} from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

// Default timezone if house doesn't have one set
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Gets the current date in a specific timezone
 * Use this for all stat tracking operations
 */
export function getTodaysDateInTimezone(timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
}

/**
 * Gets the start of week in a specific timezone
 */
export function getStartOfWeekInTimezone(
  date?: string,
  timezone?: string,
): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const zonedDate = date
    ? toZonedTime(new Date(date + 'T12:00:00'), tz)
    : toZonedTime(new Date(), tz);
  return format(startOfWeek(zonedDate), 'yyyy-MM-dd');
}

/**
 * Gets the end of week in a specific timezone
 */
export function getEndOfWeekInTimezone(
  date?: string,
  timezone?: string,
): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const zonedDate = date
    ? toZonedTime(new Date(date + 'T12:00:00'), tz)
    : toZonedTime(new Date(), tz);
  return format(endOfWeek(zonedDate), 'yyyy-MM-dd');
}

/**
 * Gets the weekday date for a specific day index in a timezone
 */
export function getWeekdayDateInTimezone(
  day: number,
  date?: string,
  timezone?: string,
): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const zonedDate = date
    ? toZonedTime(new Date(date + 'T12:00:00'), tz)
    : toZonedTime(new Date(), tz);
  const weekStart = startOfWeek(zonedDate);
  return format(addDays(weekStart, day), 'yyyy-MM-dd');
}

/**
 * Determines if a week is current based on timezone
 */
export function weekIsCurrentInTimezone(
  weekStartDate: string,
  weekEndDate: string,
  timezone?: string,
): boolean {
  const tz = timezone || DEFAULT_TIMEZONE;
  const today = getTodaysDateInTimezone(tz);
  const currentWeekStart = getStartOfWeekInTimezone(today, tz);
  const currentWeekEnd = getEndOfWeekInTimezone(today, tz);
  return weekStartDate === currentWeekStart && weekEndDate === currentWeekEnd;
}

/**
 * Gets the current timestamp in ISO format with timezone info
 */
export function getCurrentTimeWithTimezone(timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Checks if a date falls within a week (timezone-aware)
 */
export function dateIsInWeekWithTimezone(
  date: string,
  weekStartDate: string,
  weekEndDate: string,
  timezone?: string,
): boolean {
  const tz = timezone || DEFAULT_TIMEZONE;
  const checkDate = toZonedTime(new Date(date + 'T12:00:00'), tz);
  const start = startOfDay(
    toZonedTime(new Date(weekStartDate + 'T12:00:00'), tz),
  );
  const end = endOfDay(toZonedTime(new Date(weekEndDate + 'T12:00:00'), tz));
  return isWithinInterval(checkDate, { start, end });
}

/**
 * Gets the day difference between two dates
 */
export function dayDifference(date1: string, date2: string): number {
  return Math.abs(differenceInDays(new Date(date1), new Date(date2)));
}

/**
 * Validates that a date string is properly formatted
 */
export function isValidDateString(date: string): boolean {
  const parsed = parse(date, 'yyyy-MM-dd', new Date());
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === date;
}

/**
 * Gets the device's guessed timezone
 */
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export { DEFAULT_TIMEZONE };
