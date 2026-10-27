// src/__tests__/activities/syncWeekSummary.test.ts
//
// The activities/{id} write handler that owns week-summaries. Each event
// recomputes the affected guest-week from the activities as they are NOW, so
// it is idempotent (a re-delivered event changes nothing), order-independent
// (out-of-order events converge), and overwrites any stray increment an old
// app version applied client-side.
//
// The db is FakeFirestore: it holds the post-commit state the trigger would
// see, and the handler is called with the event's before/after payloads.

import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';

const WEEK = '2026-01-12'; // Monday, America/Chicago
const NEXT_WEEK = '2026-01-19';
const SUMMARY = `g1_${WEEK}`;

let db: FakeFirestore;

/** Stand-in for the Auth custom-claims check: admin-uid administers h1 only. */
const deps = {
  isHouseAdmin: async (uid: string, houseId: string) => uid === 'admin-uid' && houseId === 'h1',
};

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
  return syncWeekSummariesForActivityWrite(asFirestore(db), id, before, after, deps);
}

const summary = (id = SUMMARY) => db.read('week-summaries', id);

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('houses', 'h1', { timezone: 'America/Chicago' });
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'resident-uid' });
  db.seed('guests', 'g2', { houseId: 'h1', userId: 'resident2-uid' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('create', () => {
  it('creates the missing summary doc with the full schema on the first activity of the week', async () => {
    await write('a1', undefined, activity());

    const s = summary()!;
    expect(s).toMatchObject({
      id: SUMMARY,
      guestId: 'g1',
      houseId: 'h1',
      startDate: WEEK,
      endDate: '2026-01-18',
      activityCount: 1,
      stats: {
        choresCompleted: 1,
        meetingsAttended: 0,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
    });
    expect(Object.keys(s.dailyStats)).toHaveLength(7);
    expect(s.dailyStats['2026-01-14'].choresCompleted).toBe(1);
    expect(s.lastUpdated).toBeDefined();
  });

  it('counts a resident-logged activity — the case the client could never write', async () => {
    await write('a1', undefined, activity({ loggedBy: 'resident-uid', type: 'medication' }));
    expect(summary()!.stats.medicationTaken).toBe(1);
  });

  it('counts every activity when several are logged in the same week', async () => {
    await write('a1', undefined, activity());
    await write('a2', undefined, activity({ type: 'meeting' }));
    await write('a3', undefined, activity({ type: 'work', data: { hoursWorked: 6 } }));

    expect(summary()!.stats).toMatchObject({
      choresCompleted: 1,
      meetingsAttended: 1,
      hoursWorked: 6,
    });
    expect(summary()!.activityCount).toBe(3);
  });

  it("only counts the guest's own activities", async () => {
    db.seed('activities', 'other', activity({ guestId: 'g2' }));
    await write('a1', undefined, activity());
    expect(summary()!.activityCount).toBe(1);
  });
});

describe('idempotency and ordering', () => {
  it('a re-delivered create event does not double-count and writes nothing', async () => {
    const a = activity();
    await write('a1', undefined, a);
    await syncWeekSummariesForActivityWrite(asFirestore(db), 'a1', undefined, a, deps);
    await syncWeekSummariesForActivityWrite(asFirestore(db), 'a1', undefined, a, deps);

    expect(summary()!.stats.choresCompleted).toBe(1);
    expect(db.writes.filter((w) => w.collection === 'week-summaries')).toHaveLength(1);
  });

  it('converges when the delete event is processed before the create event', async () => {
    const active = activity();
    const deleted = activity({ status: 'deleted' });
    db.seed('activities', 'a1', deleted); // final committed state

    await syncWeekSummariesForActivityWrite(asFirestore(db), 'a1', active, deleted, deps);
    await syncWeekSummariesForActivityWrite(asFirestore(db), 'a1', undefined, active, deps);

    expect(summary()!.stats.choresCompleted).toBe(0);
    expect(summary()!.activityCount).toBe(0);
  });

  it('overwrites a stray client-side +1 from an old app version instead of adding to it', async () => {
    const a = activity();
    db.seed('activities', 'a1', a);
    // An old client already applied its own +1 before the trigger ran.
    db.seed('week-summaries', SUMMARY, {
      guestId: 'g1',
      houseId: 'h1',
      startDate: WEEK,
      endDate: '2026-01-18',
      stats: {
        choresCompleted: 1,
        meetingsAttended: 0,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
      dailyStats: { '2026-01-14': { date: '2026-01-14', choresCompleted: 1 } },
      activityCount: 1,
    });

    await syncWeekSummariesForActivityWrite(asFirestore(db), 'a1', undefined, a, deps);

    expect(summary()!.stats.choresCompleted).toBe(1);
    expect(summary()!.activityCount).toBe(1);
  });

  it('fills a summary pre-created by advanceGuestWeek and keeps fields it does not own', async () => {
    db.seed('week-summaries', SUMMARY, {
      id: SUMMARY,
      guestId: 'g1',
      houseId: 'h1',
      startDate: WEEK,
      endDate: '2026-01-18',
      stats: {
        choresCompleted: 0,
        meetingsAttended: 0,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
      dailyStats: {},
      lastUpdated: '2026-01-11T08:00:00.000Z',
      activityCount: 0,
      phaseRequirementsMet: { chores: true },
    });

    await write('a1', undefined, activity());

    expect(summary()!.stats.choresCompleted).toBe(1);
    expect(Object.keys(summary()!.dailyStats)).toHaveLength(7);
    expect(summary()!.phaseRequirementsMet).toEqual({ chores: true });
  });
});

describe('status transitions', () => {
  it('soft delete (active → deleted) removes the activity from the summary', async () => {
    const a = activity();
    await write('a1', undefined, a);
    await write('a1', a, { ...a, status: 'deleted' });

    expect(summary()!.stats.choresCompleted).toBe(0);
    expect(summary()!.activityCount).toBe(0);
  });

  it('a pending dispute (active → disputed) keeps counting', async () => {
    const a = activity();
    await write('a1', undefined, a);
    await write('a1', a, { ...a, status: 'disputed' });
    expect(summary()!.stats.choresCompleted).toBe(1);
  });

  it('an approved dispute stops counting; a rejected one counts', async () => {
    const a = activity();
    await write('a1', undefined, a);
    await write('a2', undefined, activity({ type: 'meeting' }));
    const disputed = { ...a, status: 'disputed', disputeReason: 'not done', disputedBy: 'peer-uid' };
    await write('a1', a, disputed);
    expect(summary()!.stats.choresCompleted).toBe(1);

    const approved = { ...disputed, status: 'resolved', disputed: 'successful', incomplete: true };
    await write('a1', disputed, approved);
    expect(summary()!.stats.choresCompleted).toBe(0);
    expect(summary()!.activityCount).toBe(1);

    const b = activity({ type: 'meeting' });
    const bDisputed = { ...b, status: 'disputed' };
    await write('a2', b, bDisputed);
    await write('a2', bDisputed, { ...bDisputed, status: 'resolved', disputed: 'rejected', incomplete: false });
    expect(summary()!.stats.meetingsAttended).toBe(1);
  });

  it('a dispute resolved "delete" removes the activity for good', async () => {
    const a = activity();
    await write('a1', undefined, a);
    const disputed = { ...a, status: 'disputed' };
    await write('a1', a, disputed);
    await write('a1', disputed, { ...disputed, status: 'deleted' });
    expect(summary()!.stats.choresCompleted).toBe(0);
    expect(summary()!.activityCount).toBe(0);
  });

  it('a verify-only update does not touch the summary at all', async () => {
    const a = activity();
    await write('a1', undefined, a);
    const before = db.transactions;

    await write('a1', a, {
      ...a,
      verified: true,
      verifiedBy: 'admin-uid',
      loggedAt: ts('2026-01-15T00:00:00Z'),
    });

    expect(db.transactions).toBe(before);
  });

  it('editing hoursWorked recomputes the hours', async () => {
    const a = activity({ type: 'work', data: { hoursWorked: 8 } });
    await write('a1', undefined, a);
    await write('a1', a, { ...a, data: { hoursWorked: 6 } });
    expect(summary()!.stats.hoursWorked).toBe(6);
  });

  it('moving an activity to another week recomputes both weeks', async () => {
    const a = activity();
    await write('a1', undefined, a);
    await write('a1', a, { ...a, timestamp: ts('2026-01-21T18:00:00Z') });

    expect(summary()!.stats.choresCompleted).toBe(0);
    expect(summary(`g1_${NEXT_WEEK}`)!.stats.choresCompleted).toBe(1);
  });

  it('a hard delete of the activity doc recomputes the old week', async () => {
    const a = activity();
    await write('a1', undefined, a);
    await write('a1', a, undefined);
    expect(summary()!.activityCount).toBe(0);
  });
});
