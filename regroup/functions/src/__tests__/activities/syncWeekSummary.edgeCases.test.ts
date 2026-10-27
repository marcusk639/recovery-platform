// src/__tests__/activities/syncWeekSummary.edgeCases.test.ts
//
// onActivityWritten recompute: time zone, bad input, failure/retry and
// logging. The core create/transition/idempotency cases are in
// syncWeekSummary.test.ts; the setup below is the same.

import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import {
  recomputeWeekSummary,
  syncWeekSummariesForActivityWrite,
} from '../../activities/syncWeekSummary';

const WEEK = '2026-01-12'; // Monday, America/Chicago
const NEXT_WEEK = '2026-01-19';
const SUMMARY = `g1_${WEEK}`;

let db: FakeFirestore;

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

const activity = (overrides: Record<string, unknown> = {}) => ({
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  verified: false,
  loggedBy: 'resident-uid',
  timestamp: ts('2026-01-14T18:00:00Z'),
  data: {},
  ...overrides,
});

/** Commit `after` (or delete), then deliver the event for it. */
async function write(
  id: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
) {
  if (after) db.seed('activities', id, after);
  else db.collections.get('activities')?.delete(id);
  return syncWeekSummariesForActivityWrite(asFirestore(db), id, before, after);
}

const summary = (id = SUMMARY) => db.read('week-summaries', id);

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('houses', 'h1', { timezone: 'America/Chicago' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());


describe('time zone', () => {
  const SUNDAY_NIGHT_PST = '2026-01-19T07:30:00Z'; // Sun 23:30 PST, Mon 02:30 EST

  it('puts the activity in the house-local week', async () => {
    db.seed('houses', 'h1', { timezone: 'America/Los_Angeles' });
    await write('a1', undefined, activity({ timestamp: ts(SUNDAY_NIGHT_PST) }));

    expect(summary()!.stats.choresCompleted).toBe(1);
    expect(summary()!.dailyStats['2026-01-18'].choresCompleted).toBe(1);
    expect(summary(`g1_${NEXT_WEEK}`)).toBeUndefined();
  });

  it('falls back to America/New_York when the house has no timezone', async () => {
    db.seed('houses', 'h1', {});
    await write('a1', undefined, activity({ timestamp: ts(SUNDAY_NIGHT_PST) }));

    expect(summary(`g1_${NEXT_WEEK}`)!.stats.choresCompleted).toBe(1);
  });

  it('falls back when the house doc does not exist', async () => {
    await write('a1', undefined, activity({ houseId: 'gone', timestamp: ts(SUNDAY_NIGHT_PST) }));
    expect(summary(`g1_${NEXT_WEEK}`)!.houseId).toBe('gone');
  });
});

describe('bad input and failures', () => {
  it('ignores an activity with no guestId or no usable timestamp, without throwing', async () => {
    await expect(write('a1', undefined, activity({ guestId: '' }))).resolves.toEqual({
      recomputed: [],
    });
    await expect(write('a2', undefined, activity({ timestamp: 'garbage' }))).resolves.toEqual({
      recomputed: [],
    });
    expect(db.transactions).toBe(0);
  });

  it('rethrows a failed transaction so the event is retried, having written nothing', async () => {
    db.failTransactions = 1;
    await expect(write('a1', undefined, activity())).rejects.toThrow('unavailable');
    expect(summary()).toBeUndefined();

    // The retry succeeds.
    await syncWeekSummariesForActivityWrite(asFirestore(db), 'a1', undefined, activity());
    expect(summary()!.stats.choresCompleted).toBe(1);
  });

  it('logs ids and counts only — never activity data', async () => {
    const calls: unknown[] = [];
    for (const level of ['info', 'warn', 'error', 'log'] as const) {
      jest.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    }
    await write('a1', undefined, activity({ type: 'medication', data: { medicationName: 'SECRET-MED' } }));
    const logged = JSON.stringify(calls);
    expect(logged).toContain('week_summary.recomputed');
    expect(logged).not.toContain('SECRET-MED');
  });
});

describe('recomputeWeekSummary', () => {
  it('reports unchanged when the summary already matches', async () => {
    db.seed('activities', 'a1', activity());
    const target = { guestId: 'g1', houseId: 'h1', weekStart: WEEK, timeZone: 'America/Chicago' };
    expect(await recomputeWeekSummary(asFirestore(db), target)).toEqual({
      changed: true,
      activityCount: 1,
    });
    expect(await recomputeWeekSummary(asFirestore(db), target)).toEqual({
      changed: false,
      activityCount: 1,
    });
  });
});
