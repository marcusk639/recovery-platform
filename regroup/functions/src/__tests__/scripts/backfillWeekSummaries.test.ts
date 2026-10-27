// src/__tests__/scripts/backfillWeekSummaries.test.ts
//
// One-off repair for week-summaries that missed resident-logged activities
// (the client could not write them). Recomputes every guest-week touched by an
// activity in the date range, with the same code the trigger uses. Dry run is
// the default; --apply writes. Re-running is a no-op.
//
// Firestore is FakeFirestore and scriptBootstrap is stubbed, so nothing here
// can reach a project.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from '../activities/fakeFirestore';
import { main, parseArgs, run } from '../../scripts/backfillWeekSummaries';

const WEEK = '2026-01-12';
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const activity = (overrides: Record<string, unknown> = {}) => ({
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'admin',
  timestamp: ts('2026-01-14T18:00:00Z'),
  data: {},
  ...overrides,
});

let db: FakeFirestore;
let output: string[];

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('houses', 'h1', { timezone: 'America/Chicago' });
  db.seed('houses', 'h2', { timezone: 'America/Chicago' });
  for (let i = 0; i < 10; i++) db.seed('guests', `g${i}`, { houseId: 'h1', userId: `g${i}-uid` });
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'resident' });
  db.seed('guests', 'g7', { houseId: 'h2', userId: 'g7-uid' });
  output = [];
  jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '));
  });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

// 'admin' administers every house here; the claims check itself is tested in
// __tests__/activities/activityTrust.test.ts.
const isHouseAdmin = async (uid: string) => uid === 'admin';
const NOW = new Date('2026-01-16T12:00:00Z'); // week of 2026-01-12 is still open
const opts = { from: '2026-01-01', to: '2026-02-01', apply: false, isHouseAdmin, now: NOW };
const summaryWrites = () => db.writes.filter((w) => w.collection === 'week-summaries');

describe('parseArgs', () => {
  it('parses the range, an optional house and --apply', () => {
    expect(parseArgs(['--from', '2026-01-01', '--to', '2026-02-01'])).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
      apply: false,
    });
    expect(
      parseArgs(['--from', '2026-01-01', '--to', '2026-02-01', '--house', 'h1', '--apply']),
    ).toEqual({ from: '2026-01-01', to: '2026-02-01', houseId: 'h1', apply: true });
  });

  it.each([
    [[]],
    [['--from', '2026-01-01']],
    [['--to', '2026-02-01']],
    [['--from', '2026-1-1', '--to', '2026-02-01']],
    [['--from', '2026-02-01', '--to', '2026-01-01']],
    [['--from', '2026-01-01', '--to', '2026-02-01', '--house']],
  ])('rejects %p with usage', (argv) => {
    expect(() => parseArgs(argv)).toThrow(/Usage/);
  });
});

describe('run', () => {
  it('is a dry run by default: reports what would change and writes nothing', async () => {
    db.seed('activities', 'a1', activity());

    const counts = await run(asFirestore(db), opts);

    expect(counts).toMatchObject({ activitiesScanned: 1, summaries: 1, changed: 1, unchanged: 0 });
    expect(summaryWrites()).toHaveLength(0);
    expect(output.join('\n')).toContain('Nothing was written');
  });

  it('--apply adds the resident activities a summary missed', async () => {
    // Admin's chore was counted client-side; the resident's medication never was.
    db.seed('activities', 'admin-chore', activity({ loggedBy: 'admin' }));
    db.seed('activities', 'resident-med', activity({ type: 'medication', loggedBy: 'resident' }));
    db.seed('week-summaries', `g1_${WEEK}`, {
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
      dailyStats: {},
      activityCount: 1,
    });

    const counts = await run(asFirestore(db), { ...opts, apply: true });

    expect(counts.changed).toBe(1);
    const s = db.read('week-summaries', `g1_${WEEK}`)!;
    expect(s.stats.choresCompleted).toBe(1);
    expect(s.stats.medicationTaken).toBe(1);
    expect(s.activityCount).toBe(2);
  });

  it('counts pending disputes and legacy kept (resolved) activities the old client dropped, not approved ones', async () => {
    db.seed('activities', 'kept', activity({ status: 'resolved' }));
    db.seed('activities', 'pending', activity({ type: 'meeting', status: 'disputed' }));
    db.seed('activities', 'approved', activity({ type: 'medication', status: 'resolved', incomplete: true }));
    db.seed('week-summaries', `g1_${WEEK}`, {
      guestId: 'g1',
      houseId: 'h1',
      startDate: WEEK,
      endDate: '2026-01-18',
      stats: { choresCompleted: 0, meetingsAttended: 0, hoursWorked: 0, medicationTaken: 0, primarySupporterMet: 0 },
      dailyStats: {},
      activityCount: 0,
    });

    await run(asFirestore(db), { ...opts, apply: true });

    const s = db.read('week-summaries', `g1_${WEEK}`)!;
    expect(s.stats.choresCompleted).toBe(1);
    expect(s.stats.meetingsAttended).toBe(1);
    expect(s.stats.medicationTaken).toBe(0);
  });

  it('creates summaries that do not exist yet', async () => {
    db.seed('activities', 'a1', activity({ guestId: 'g9' }));
    await run(asFirestore(db), { ...opts, apply: true });
    expect(db.read('week-summaries', `g9_${WEEK}`)!.stats.choresCompleted).toBe(1);
  });

  it('is idempotent: a second --apply changes nothing', async () => {
    db.seed('activities', 'a1', activity());
    db.seed('activities', 'a2', activity({ guestId: 'g2' }));
    await run(asFirestore(db), { ...opts, apply: true });
    const writesAfterFirst = summaryWrites().length;

    const counts = await run(asFirestore(db), { ...opts, apply: true });

    expect(counts).toMatchObject({ summaries: 2, changed: 0, unchanged: 2 });
    expect(summaryWrites()).toHaveLength(writesAfterFirst);
  });

  it('recomputes each guest-week once, however many activities it has', async () => {
    for (let i = 0; i < 4; i++) db.seed('activities', `a${i}`, activity());
    const counts = await run(asFirestore(db), { ...opts, apply: true });
    expect(counts).toMatchObject({ activitiesScanned: 4, summaries: 1 });
  });

  it('pages through the activities', async () => {
    for (let i = 0; i < 5; i++) {
      db.seed('activities', `a${i}`, activity({ guestId: `g${i}` }));
    }
    const counts = await run(asFirestore(db), { ...opts, apply: true, pageSize: 2 });
    expect(counts).toMatchObject({ activitiesScanned: 5, summaries: 5 });
  });

  it('limits to one house with --house', async () => {
    db.seed('activities', 'a1', activity());
    db.seed('activities', 'a2', activity({ guestId: 'g7', houseId: 'h2' }));
    const counts = await run(asFirestore(db), { ...opts, apply: true, houseId: 'h2' });
    expect(counts.summaries).toBe(1);
    expect(db.read('week-summaries', `g1_${WEEK}`)).toBeUndefined();
    expect(db.read('week-summaries', `g7_${WEEK}`)).toBeDefined();
  });

  it('leaves activities outside the range alone', async () => {
    db.seed('activities', 'old', activity({ timestamp: ts('2025-06-04T18:00:00Z') }));
    const counts = await run(asFirestore(db), { ...opts, apply: true });
    expect(counts.activitiesScanned).toBe(0);
    expect(summaryWrites()).toHaveLength(0);
  });

  it('skips activities with no guest, and reports them', async () => {
    db.seed('activities', 'orphan', activity({ guestId: '' }));
    const counts = await run(asFirestore(db), { ...opts, apply: true });
    expect(counts).toMatchObject({ activitiesScanned: 1, activitiesSkipped: 1, summaries: 0 });
  });

  it('prints ids and counts only, never activity data', async () => {
    db.seed(
      'activities',
      'a1',
      activity({ type: 'medication', data: { medicationName: 'SECRET-MED' } }),
    );
    await run(asFirestore(db), { ...opts, apply: true });
    expect(output.join('\n')).not.toContain('SECRET-MED');
    expect(output.join('\n')).toContain(`g1_${WEEK}`);
  });
});

describe('dry-run report', () => {
  it('uses read-only transactions, so a production dry run takes no write locks', async () => {
    db.seed('activities', 'a1', activity());
    await run(asFirestore(db), opts);
    expect(db.readOnlyTransactions).toBe(db.transactions);
    expect(db.transactions).toBeGreaterThan(0);
  });

  it('reports suspected duplicates (same guest, type and data within 10 min) by id, without removing them', async () => {
    db.seed('activities', 'first', activity({ timestamp: ts('2026-01-14T18:00:05Z') }));
    db.seed('activities', 'retry', activity({ timestamp: ts('2026-01-14T18:01:30Z') }));
    db.seed('activities', 'later', activity({ timestamp: ts('2026-01-14T19:30:00Z') }));
    db.seed('activities', 'other', activity({ type: 'meeting', timestamp: ts('2026-01-14T18:01:00Z') }));

    const counts = await run(asFirestore(db), opts);

    expect(counts.suspectedDuplicates).toBe(1);
    expect(output.join('\n')).toContain('retry repeats first');
    expect(db.collections.get('activities')!.size).toBe(4);
  });

  it('counts rewrites of closed weeks separately', async () => {
    db.seed('activities', 'open', activity());
    db.seed('activities', 'closed', activity({ timestamp: ts('2026-01-07T18:00:00Z') }));
    const counts = await run(asFirestore(db), opts);
    expect(counts).toMatchObject({ changed: 2, changedClosedWeeks: 1 });
  });

  it('reports activities it will not count, and guests it cannot find', async () => {
    db.seed('activities', 'forged', activity({ loggedBy: 'stranger' }));
    db.seed('activities', 'foreign', activity({ houseId: 'h2' }));
    db.seed('activities', 'orphan', activity({ guestId: 'ghost' }));
    db.seed('activities', 'hours', activity({ type: 'work', data: { hoursWorked: 'lots' } }));

    const counts = await run(asFirestore(db), opts);

    expect(counts).toMatchObject({
      excludedUntrustedLogger: 1,
      excludedOtherHouse: 1,
      activitiesGuestMissing: 1,
      nonNumericHours: 1,
    });
  });
});

describe('main', () => {
  it('passes --apply through', async () => {
    db.seed('activities', 'a1', activity());
    await main(['--from', '2026-01-01', '--to', '2026-02-01', '--apply'], asFirestore(db), {
      isHouseAdmin,
    });
    expect(summaryWrites()).toHaveLength(1);
  });
});
