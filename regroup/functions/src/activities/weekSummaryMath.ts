/**
 * Pure rules for the server-owned `week-summaries` collection.
 *
 * A summary is keyed `{guestId}_{weekStart}`, where weekStart is the Monday
 * (YYYY-MM-DD) of the activity's week. The mobile client used to compute that
 * on the device as local Monday 00:00 (services/activity.ts getWeekStart), so
 * for a resident whose phone is in the house's zone the device and the house
 * agree. The server has no device, so it uses the house's `timezone`, falling
 * back to the same default as mobile util/dateWithTimezone.
 *
 * An activity counts iff its status is `active` or `resolved`. `resolved` is
 * what resolveDispute('keep') writes: an admin upheld it, so it counts again.
 * (The old client recompute counted only `active`, so every dispute removed
 * the activity for good even when kept.) A pending dispute (`disputed`) does
 * not count until resolved; `deleted` never counts. Mobile's activity lists
 * use the same set (COUNTED_ACTIVITY_STATUSES in entities/ActivityModel).
 *
 * dailyStats is keyed by the house-local date. The client keyed it by the UTC
 * date, which put Sunday-evening activities on a Monday outside the week;
 * nothing reads dailyStats, so this is a fix with no consumer impact.
 */

export const DEFAULT_SUMMARY_TIME_ZONE = 'America/New_York';

export const ACTIVITY_TYPE_TO_STAT = {
  chore: 'choresCompleted',
  meeting: 'meetingsAttended',
  work: 'hoursWorked',
  medication: 'medicationTaken',
  primary_supporter: 'primarySupporterMet',
} as const;

export type StatKey = (typeof ACTIVITY_TYPE_TO_STAT)[keyof typeof ACTIVITY_TYPE_TO_STAT];
export type WeekStats = Record<StatKey, number>;
export type DailyStats = WeekStats & { date: string };

export interface WeekAggregate {
  stats: WeekStats;
  dailyStats: Record<string, DailyStats>;
  activityCount: number;
  /** Counted WORK activities whose hoursWorked was not a number (added 0). */
  nonNumericHours: number;
}

/** The fields of an activity document the summary depends on. */
export interface ActivityLike {
  type?: unknown;
  status?: unknown;
  timestamp?: unknown;
  data?: unknown;
}

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** A house's zone if it is a valid IANA name, otherwise the default. */
export function resolveTimeZone(tz: unknown): { timeZone: string; fallback: boolean } {
  if (typeof tz === 'string' && tz !== '') {
    try {
      formatterFor(tz);
      return { timeZone: tz, fallback: false };
    } catch {
      // RangeError: not a zone this runtime knows.
    }
  }
  return { timeZone: DEFAULT_SUMMARY_TIME_ZONE, fallback: true };
}

function zonedParts(at: Date, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of `at` as a wall-clock date in `timeZone`. */
export function localDateString(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the house-local week containing `at`. */
export function weekStartFor(at: Date, timeZone: string): string {
  const local = localDateString(at, timeZone);
  const dow = new Date(`${local}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(local, dow === 0 ? -6 : 1 - dow);
}

export function weekEndFor(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Offset of `timeZone` from UTC at `at`, in ms (negative west of UTC). */
function offsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of local midnight at the start of `date` in `timeZone`. */
function zonedMidnight(date: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T00:00:00Z`);
  const first = wall - offsetMs(new Date(wall), timeZone);
  const second = wall - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** [start, end) of the house-local week, as UTC instants for a range query. */
export function weekWindowUtc(weekStart: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedMidnight(weekStart, timeZone),
    end: zonedMidnight(addDays(weekStart, 7), timeZone),
  };
}

/** A Firestore Timestamp, Date, ISO string or epoch millis, as a Date. */
export function toInstant(value: unknown): Date | null {
  let d: Date | null = null;
  if (value instanceof Date) d = value;
  else if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    d = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Statuses that count: active, and a dispute resolved as "keep". */
export const COUNTED_STATUSES: readonly string[] = ['active', 'resolved'];

export function countsTowardSummary(activity: ActivityLike): boolean {
  return typeof activity.status === 'string' && COUNTED_STATUSES.includes(activity.status);
}

export function summaryDocId(guestId: string, weekStart: string): string {
  return `${guestId}_${weekStart}`;
}

export function emptyStats(): WeekStats {
  return {
    choresCompleted: 0,
    meetingsAttended: 0,
    hoursWorked: 0,
    medicationTaken: 0,
    primarySupporterMet: 0,
  };
}

/**
 * Hours a WORK activity contributes, or null when hoursWorked is not a finite
 * number. Numeric strings ("8") are coerced; the client used to concatenate
 * them as strings instead.
 */
export function hoursOf(data: unknown): number | null {
  const h = (data as { hoursWorked?: unknown } | null | undefined)?.hoursWorked;
  if (typeof h === 'number') return Number.isFinite(h) ? h : null;
  if (typeof h === 'string' && h.trim() !== '') {
    const n = Number(h);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Recompute a whole week from its activities. Activities outside the week, or
 * without a usable timestamp, are ignored rather than trusted.
 */
export function aggregateWeek(
  activities: ActivityLike[],
  weekStart: string,
  timeZone: string,
): WeekAggregate {
  const stats = emptyStats();
  const dailyStats: Record<string, DailyStats> = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    dailyStats[date] = { date, ...emptyStats() };
  }
  let activityCount = 0;
  let nonNumericHours = 0;

  for (const activity of activities) {
    if (!countsTowardSummary(activity)) continue;
    const at = toInstant(activity.timestamp);
    if (!at || weekStartFor(at, timeZone) !== weekStart) continue;

    activityCount++;
    const key = ACTIVITY_TYPE_TO_STAT[activity.type as keyof typeof ACTIVITY_TYPE_TO_STAT];
    if (!key) continue;
    let amount = 1;
    if (key === 'hoursWorked') {
      const hours = hoursOf(activity.data);
      if (hours === null) nonNumericHours++;
      amount = hours ?? 0;
    }
    stats[key] += amount;
    dailyStats[localDateString(at, timeZone)][key] += amount;
  }

  return { stats, dailyStats, activityCount, nonNumericHours };
}

/** Whether a stored summary already holds exactly this aggregate. */
export function sameAggregate(
  prev: Record<string, unknown>,
  next: WeekAggregate,
  houseId: string,
  weekStart: string,
): boolean {
  if (
    prev.houseId !== houseId ||
    prev.startDate !== weekStart ||
    prev.endDate !== weekEndFor(weekStart) ||
    prev.activityCount !== next.activityCount
  ) {
    return false;
  }
  const stats = (prev.stats ?? {}) as Record<string, unknown>;
  if (Object.entries(next.stats).some(([k, v]) => stats[k] !== v)) return false;

  const daily = (prev.dailyStats ?? {}) as Record<string, Record<string, unknown>>;
  if (Object.keys(daily).length !== Object.keys(next.dailyStats).length) return false;
  return Object.entries(next.dailyStats).every(([date, day]) =>
    Object.entries(day).every(([k, v]) => daily[date]?.[k] === v),
  );
}
