// src/__tests__/scripts/backfillDisputeIdentity.test.ts
//
// One-off backfill for activities written before the trigger stamped
// residentUid and logged dispute decisions: stamps residentUid from
// guests.userId, and logs decided_{disputeResolvedAt ms} for each decided
// dispute, so the rules' owner rule and REOPEN work on old data. Dry run is
// the default; --apply writes. Re-running is a no-op.
//
// Firestore is FakeFirestore and scriptBootstrap is stubbed, so nothing here
// can reach a project.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, asFirestore } from '../activities/fakeFirestore';
import { isLegacyUpheld, main, parseArgs, run } from '../../scripts/backfillDisputeIdentity';

const T1 = Timestamp.fromDate(new Date('2026-01-15T10:00:00Z'));
const act = (o: Record<string, unknown> = {}) => ({
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'mgr',
  disputeReason: 'SECRET-REASON',
  ...o,
});

let db: FakeFirestore;
let output: string[];
const decisions = (id: string) => [
  ...(db.collections.get(`activities/${id}/dispute-decisions`) ?? new Map()).entries(),
];

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'res1' });
  db.seed('guests', 'intake', { houseId: 'h1' });
  db.seed('guests', 'g2', { houseId: 'h2', userId: 'res2' });
  db.seed('activities', 'plain', act());
  db.seed('activities', 'intakeAct', act({ guestId: 'intake' }));
  db.seed('activities', 'noGuest', act({ guestId: 'gone' }));
  db.seed('activities', 'stamped', act({ residentUid: 'res1' }));
  db.seed(
    'activities',
    'approved',
    act({
      status: 'resolved',
      disputed: 'successful',
      incomplete: true,
      disputeResolvedBy: 'mgr',
      disputeResolvedAt: T1,
    }),
  );
  db.seed(
    'activities',
    'kept',
    act({ status: 'resolved', disputeResolvedBy: 'mgr', disputeResolvedAt: T1 }),
  );
  db.seed('activities', 'undated', act({ status: 'resolved', disputed: 'rejected' }));
  db.seed(
    'activities',
    'upheld',
    act({ status: 'deleted', disputeResolvedBy: 'mgr', disputeResolvedAt: T1, loggedAt: T1 }),
  );
  db.seed('activities', 'otherHouse', act({ guestId: 'g2', houseId: 'h2' }));
  output = [];
  jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '));
  });
});

afterEach(() => jest.restoreAllMocks());

describe('backfillDisputeIdentity', () => {
  it('dry run (default) reports what it would do and writes nothing', async () => {
    const counts = await run(asFirestore(db), { apply: false, pageSize: 3 });
    expect(counts).toEqual({
      scanned: 9,
      stamped: 7,
      alreadyStamped: 1,
      guestMissing: 1,
      decisionsLogged: 3,
      decisionsPresent: 0,
      decisionsUndated: 1,
      openDisputes: 0,
    });
    expect(db.writes).toHaveLength(0);
    expect(output.join('\n')).toContain('DRY RUN');
  });

  it('--apply stamps residentUid (null for an intake) and logs each decision with its outcome', async () => {
    await run(asFirestore(db), { apply: true, pageSize: 3 });
    expect(db.read('activities', 'plain')!.residentUid).toBe('res1');
    expect(db.read('activities', 'intakeAct')!.residentUid).toBeNull();
    expect(db.read('activities', 'noGuest')).not.toHaveProperty('residentUid');
    expect(db.read('activities', 'stamped')!.residentUid).toBe('res1');
    const key = `decided_${T1.toMillis()}`;
    expect(decisions('approved')).toEqual([
      [key, expect.objectContaining({ event: 'approved', by: 'mgr', backfilled: true })],
    ]);
    expect(decisions('kept')[0][1]).toMatchObject({ event: 'kept' });
    expect(decisions('upheld')[0][1]).toMatchObject({ event: 'deleted' });
    expect(decisions('undated')).toEqual([]);
  });

  it('is idempotent: a re-run stamps and logs nothing more', async () => {
    await run(asFirestore(db), { apply: true });
    const writes = db.writes.length;
    const again = await run(asFirestore(db), { apply: true });
    expect(again).toMatchObject({ stamped: 0, decisionsLogged: 0, decisionsPresent: 3 });
    expect(db.writes).toHaveLength(writes);
  });

  it('never overwrites a stamp written meanwhile (the trigger got there first)', async () => {
    const orig = db.runTransaction.bind(db);
    jest.spyOn(db, 'runTransaction').mockImplementationOnce(async (fn: any, o?: any) => {
      db.seed('activities', 'approved', {
        ...db.read('activities', 'approved')!,
        residentUid: 'from-trigger',
      });
      return orig(fn, o);
    });
    await run(asFirestore(db), { apply: true });
    expect(db.read('activities', 'approved')!.residentUid).toBe('from-trigger');
  });

  it('--house limits the run to one house', async () => {
    const counts = await run(asFirestore(db), { apply: true, houseId: 'h2' });
    expect(counts.scanned).toBe(1);
    expect(db.read('activities', 'plain')).not.toHaveProperty('residentUid');
  });

  it('prints ids and counts only (no uids or reasons)', async () => {
    await main(['--apply'], asFirestore(db));
    const printed = output.join('\n');
    expect(printed).toContain('plain');
    expect(printed).not.toContain('res1');
    expect(printed).not.toContain('SECRET-REASON');
  });
});

describe('round 5', () => {
  it('re-stamps a null stamp once the guest has an account; keeps it null while there is none', async () => {
    db.seed('activities', 'nullLinked', act({ residentUid: null }));
    db.seed('activities', 'nullIntake', act({ guestId: 'intake', residentUid: null }));
    await run(asFirestore(db), { apply: true });
    expect(db.read('activities', 'nullLinked')!.residentUid).toBe('res1');
    expect(db.read('activities', 'nullIntake')!.residentUid).toBeNull();
  });

  it('seeds the live dispute list with disputes opened before it existed (apply only)', async () => {
    db.seed('houses', 'h1', { disputes: {} });
    db.seed(
      'activities',
      'open',
      act({ status: 'disputed', disputedBy: 'peer', disputeResolvedBy: 'peer' }),
    );
    const dry = await run(asFirestore(db), { apply: false });
    expect(dry.openDisputes).toBe(1);
    expect(db.read('house-disputes', 'h1')).toBeUndefined();
    await run(asFirestore(db), { apply: true });
    expect(db.read('house-disputes', 'h1')!.disputes.open).toMatchObject({
      status: 'pending',
      disputedBy: 'peer',
    });
  });
});

describe('parseArgs and helpers', () => {
  it('defaults to a dry run; --apply and --house <id>; refuses anything else', () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(['--house', 'h1', '--apply'])).toEqual({ apply: true, houseId: 'h1' });
    expect(() => parseArgs(['--house'])).toThrow('--house needs a value');
    expect(() => parseArgs(['--aply'])).toThrow('Unknown flag');
    expect(() => parseArgs(['h1'])).toThrow('Unexpected');
  });

  it("isLegacyUpheld: an old build's delete (resolved at loggedAt), not a withdrawal", () => {
    expect(isLegacyUpheld({ status: 'deleted', disputeResolvedAt: T1, loggedAt: T1 })).toBe(true);
    const later = Timestamp.fromMillis(T1.toMillis() + 1000);
    expect(isLegacyUpheld({ status: 'deleted', disputeResolvedAt: T1, loggedAt: later })).toBe(
      false,
    );
    expect(
      isLegacyUpheld({ status: 'deleted', disputeResolvedAt: T1, loggedAt: T1, incomplete: true }),
    ).toBe(false);
  });
});
