// src/__tests__/activities/weekSummaryMath.test.ts
//
// Pure week-boundary and aggregation rules behind the server-owned
// week-summaries. The mobile client used to compute these on the device
// (services/activity.ts getWeekStart / incrementWeekSummaryForActivity); the
// server must land every activity in the same summary doc the device would
// have, so the week boundary is the house's local Monday 00:00.

import {
  DEFAULT_SUMMARY_TIME_ZONE,
  aggregateWeek,
  addDays,
  countsTowardSummary,
  localDateString,
  resolveTimeZone,
  summaryDocId,
  toInstant,
  weekEndFor,
  weekStartFor,
  weekWindowUtc,
} from '../../activities/weekSummaryMath';

const CHICAGO = 'America/Chicago';
const LA = 'America/Los_Angeles';

describe('resolveTimeZone', () => {
  it('uses a valid IANA zone from the house', () => {
    expect(resolveTimeZone(LA)).toEqual({ timeZone: LA, fallback: false });
  });

  it.each([undefined, null, '', 'Not/AZone', 42])(
    'falls back to the mobile default zone for %p',
    (tz) => {
      expect(resolveTimeZone(tz)).toEqual({
        timeZone: DEFAULT_SUMMARY_TIME_ZONE,
        fallback: true,
      });
    },
  );

  it('defaults to the same zone as mobile util/dateWithTimezone', () => {
    expect(DEFAULT_SUMMARY_TIME_ZONE).toBe('America/New_York');
  });
});

describe('weekStartFor (house-local Monday)', () => {
  it('puts a Sunday-evening activity in the week that is ending, not the UTC week', () => {
    // Sunday 2026-01-18 21:30 CST is already Monday 03:30 UTC.
    const at = new Date('2026-01-19T03:30:00Z');
    expect(weekStartFor(at, CHICAGO)).toBe('2026-01-12');
  });

  it('starts a new week at local Monday 00:00', () => {
    // Monday 2026-01-19 00:30 CST.
    expect(weekStartFor(new Date('2026-01-19T06:30:00Z'), CHICAGO)).toBe('2026-01-19');
  });

  it('keeps an activity one minute before local midnight in the old week', () => {
    // Sunday 2026-01-18 23:59 CST.
    expect(weekStartFor(new Date('2026-01-19T05:59:00Z'), CHICAGO)).toBe('2026-01-12');
  });

  it('depends on the house zone: the same instant is a different week in LA and New York', () => {
    // Sunday 23:30 PST == Monday 02:30 EST.
    const at = new Date('2026-01-19T07:30:00Z');
    expect(weekStartFor(at, LA)).toBe('2026-01-12');
    expect(weekStartFor(at, 'America/New_York')).toBe('2026-01-19');
  });

  it('matches the device rule for a mid-week activity', () => {
    expect(weekStartFor(new Date('2026-01-14T18:00:00Z'), CHICAGO)).toBe('2026-01-12');
  });
});

describe('week dates', () => {
  it('weekEndFor is the Sunday six days later, across a month boundary', () => {
    expect(weekEndFor('2026-01-26')).toBe('2026-02-01');
  });

  it('addDays crosses a year boundary', () => {
    expect(addDays('2025-12-29', 7)).toBe('2026-01-05');
  });

  it('localDateString uses the house zone, not UTC', () => {
    expect(localDateString(new Date('2026-01-19T03:30:00Z'), CHICAGO)).toBe('2026-01-18');
  });

  it('summaryDocId is guestId_weekStart, the id every reader uses', () => {
    expect(summaryDocId('g1', '2026-01-12')).toBe('g1_2026-01-12');
  });
});

describe('weekWindowUtc', () => {
  it('spans local Monday 00:00 to the next local Monday 00:00 (CST)', () => {
    const { start, end } = weekWindowUtc('2026-01-12', CHICAGO);
    expect(start.toISOString()).toBe('2026-01-12T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-19T06:00:00.000Z');
  });

  it('is one hour short across the spring DST change', () => {
    // DST starts Sunday 2026-03-08 in the US.
    const { start, end } = weekWindowUtc('2026-03-02', CHICAGO);
    expect(start.toISOString()).toBe('2026-03-02T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-09T05:00:00.000Z');
  });

  it('agrees with weekStartFor at both edges', () => {
    const { start, end } = weekWindowUtc('2026-03-02', CHICAGO);
    expect(weekStartFor(start, CHICAGO)).toBe('2026-03-02');
    expect(weekStartFor(new Date(end.getTime() - 1), CHICAGO)).toBe('2026-03-02');
    expect(weekStartFor(end, CHICAGO)).toBe('2026-03-09');
  });
});

describe('toInstant', () => {
  it('accepts Firestore Timestamps, Dates, ISO strings and millis', () => {
    const iso = '2026-01-14T18:00:00.000Z';
    expect(toInstant({ toDate: () => new Date(iso) })?.toISOString()).toBe(iso);
    expect(toInstant(new Date(iso))?.toISOString()).toBe(iso);
    expect(toInstant(iso)?.toISOString()).toBe(iso);
    expect(toInstant(Date.parse(iso))?.toISOString()).toBe(iso);
  });

  it.each([undefined, null, 'not a date', {}, NaN])('returns null for %p', (v) => {
    expect(toInstant(v)).toBeNull();
  });
});

describe('countsTowardSummary', () => {
  it('counts active and kept (resolved) activities; not pending disputes or deleted', () => {
    expect(countsTowardSummary({ status: 'active' })).toBe(true);
    expect(countsTowardSummary({ status: 'disputed' })).toBe(false);
    expect(countsTowardSummary({ status: 'resolved' })).toBe(true);
    expect(countsTowardSummary({ status: 'deleted' })).toBe(false);
    expect(countsTowardSummary({})).toBe(false);
  });
});

describe('aggregateWeek', () => {
  const WEEK = '2026-01-12';
  const at = (iso: string) => ({ toDate: () => new Date(iso) });
  const act = (type: string, iso: string, extra: Record<string, unknown> = {}) => ({
    type,
    status: 'active',
    timestamp: at(iso),
    data: {},
    ...extra,
  });

  it('increments one counter per type and scales WORK by hoursWorked', () => {
    const result = aggregateWeek(
      [
        act('chore', '2026-01-12T15:00:00Z'),
        act('chore', '2026-01-13T15:00:00Z'),
        act('meeting', '2026-01-13T15:00:00Z'),
        act('work', '2026-01-14T15:00:00Z', { data: { hoursWorked: 8 } }),
        act('work', '2026-01-14T20:00:00Z', { data: { hoursWorked: 4.5 } }),
        act('medication', '2026-01-15T15:00:00Z'),
        act('primary_supporter', '2026-01-16T15:00:00Z'),
      ],
      WEEK,
      CHICAGO,
    );
    expect(result.stats).toEqual({
      choresCompleted: 2,
      meetingsAttended: 1,
      hoursWorked: 12.5,
      medicationTaken: 1,
      primarySupporterMet: 1,
    });
    expect(result.activityCount).toBe(7);
    expect(result.dailyStats['2026-01-14'].hoursWorked).toBe(12.5);
    expect(result.dailyStats['2026-01-13']).toEqual({
      date: '2026-01-13',
      choresCompleted: 1,
      meetingsAttended: 1,
      hoursWorked: 0,
      medicationTaken: 0,
      primarySupporterMet: 0,
    });
  });

  it('materialises all seven days so readers never see a missing stat key', () => {
    const result = aggregateWeek([], WEEK, CHICAGO);
    expect(Object.keys(result.dailyStats)).toEqual([
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
      '2026-01-16',
      '2026-01-17',
      '2026-01-18',
    ]);
    expect(result.activityCount).toBe(0);
    expect(result.stats.choresCompleted).toBe(0);
  });

  it('keys a Sunday-evening activity on the local Sunday, inside its week', () => {
    const result = aggregateWeek([act('chore', '2026-01-19T03:30:00Z')], WEEK, CHICAGO);
    expect(result.dailyStats['2026-01-18'].choresCompleted).toBe(1);
    expect(result.dailyStats['2026-01-19']).toBeUndefined();
  });

  it('ignores disputed and deleted activities but counts kept (resolved) ones', () => {
    const result = aggregateWeek(
      [
        act('chore', '2026-01-12T15:00:00Z', { status: 'disputed' }),
        act('chore', '2026-01-12T15:00:00Z', { status: 'resolved' }),
        act('chore', '2026-01-12T15:00:00Z', { status: 'deleted' }),
        act('meeting', '2026-01-12T15:00:00Z'),
      ],
      WEEK,
      CHICAGO,
    );
    expect(result.stats.choresCompleted).toBe(1);
    expect(result.stats.meetingsAttended).toBe(1);
    expect(result.activityCount).toBe(2);
  });

  it('ignores activities outside the week and ones without a usable timestamp', () => {
    const result = aggregateWeek(
      [
        act('chore', '2026-01-19T06:30:00Z'), // next local week
        act('chore', '2026-01-12T05:30:00Z'), // previous local week (Sunday night)
        { type: 'chore', status: 'active', timestamp: 'garbage', data: {} },
      ],
      WEEK,
      CHICAGO,
    );
    expect(result.activityCount).toBe(0);
  });

  it('coerces numeric-string hours and counts non-numeric hours as 0, reporting them', () => {
    const result = aggregateWeek(
      [
        act('work', '2026-01-12T15:00:00Z', { data: {} }),
        act('work', '2026-01-12T15:00:00Z', { data: { hoursWorked: '8' } }),
        act('work', '2026-01-12T15:00:00Z', { data: { hoursWorked: 'eight' } }),
        act('work', '2026-01-12T15:00:00Z', { data: null }),
      ],
      WEEK,
      CHICAGO,
    );
    expect(result.stats.hoursWorked).toBe(8);
    expect(result.activityCount).toBe(4);
    expect(result.nonNumericHours).toBe(3);
  });

  it('counts an unknown type in activityCount only, like the client did', () => {
    const result = aggregateWeek([act('nap', '2026-01-12T15:00:00Z')], WEEK, CHICAGO);
    expect(result.activityCount).toBe(1);
    expect(Object.values(result.stats).every((n) => n === 0)).toBe(true);
  });
});
