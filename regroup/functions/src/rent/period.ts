/**
 * Pure calendar math for rent periods. Dates are YYYY-MM-DD calendar dates in the
 * house's zone; days are added with addDays, never as milliseconds on an instant.
 */
import { addDays, localDateString } from '../activities/weekSummaryMath';
import { RentFrequency } from './types';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;
// No Z or ±hh:mm: a wall-clock time with no zone, so its date is already house-local.
const ISO_NO_OFFSET = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: string): { y: number; m: number; d: number } {
  const match = DATE_ONLY.exec(date);
  if (!match) throw new Error(`not a calendar date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function periodFor(
  date: string,
  frequency: RentFrequency,
): { start: string; end: string; days: number } {
  const { y, m, d } = parts(date);
  if (frequency === 'weekly') {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    const start = addDays(date, dow === 0 ? -6 : 1 - dow);
    return { start, end: addDays(start, 6), days: 7 };
  }
  const days = daysInMonth(y, m);
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(days)}`, days };
}

/** The first day of the period after the one containing `date`. */
export function nextPeriodStart(date: string, frequency: RentFrequency): string {
  return addDays(periodFor(date, frequency).end, 1);
}

export function daysInclusive(from: string, through: string): number {
  const a = parts(from);
  const b = parts(through);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS) + 1;
}

/** The latest of the non-empty dates. YYYY-MM-DD compares correctly as a string. */
export function maxDate(...dates: Array<string | null | undefined>): string {
  const present = dates.filter((d): d is string => typeof d === 'string' && d !== '');
  if (present.length === 0) throw new Error('maxDate needs at least one date');
  return present.reduce((a, b) => (b > a ? b : a));
}

function isCalendarDate(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * A stored date of any shape we write or import, as the house-local calendar date.
 * A bare YYYY-MM-DD is already a calendar date; an ISO timestamp, a Firestore
 * Timestamp or epoch millis is an instant read in `timeZone`. Anything else is null.
 */
export function toLocalDate(value: unknown, timeZone: string): string | null {
  let ms: number | null = null;
  if (typeof value === 'string') {
    if (isCalendarDate(value)) return value;
    const local = ISO_NO_OFFSET.exec(value);
    if (local) return isCalendarDate(local[1]) ? local[1] : null;
    if (ISO_TIMESTAMP.test(value)) ms = Date.parse(value);
  } else if (typeof value === 'number') {
    ms = value;
  } else if (value instanceof Date) {
    ms = value.getTime();
  } else if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    ms = (value as { toMillis: () => number }).toMillis();
  }
  if (ms === null || !Number.isFinite(ms)) return null;
  return localDateString(new Date(ms), timeZone);
}
