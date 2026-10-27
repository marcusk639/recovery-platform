// src/__tests__/activities/disputeDecisions.test.ts
//
// Owner decision: dispute decisions can be undone (REOPEN), and no decision
// is ever lost. Every decision is logged in activities/{id}/dispute-decisions
// and archived to /disputes/{key}_{stamp}_{decision id}; a reopened dispute
// keeps its stamp and gets its house.disputes entry back.

import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { mirrorHouseDispute } from '../../activities/houseDisputeMirror';
import {
  closingDecision,
  disputeStamp,
  isReopen,
  reopenDecision,
} from '../../activities/disputeDecisions';

let db: FakeFirestore;
const NOW = '2026-01-15T12:00:00.000Z';
type Data = Record<string, unknown>;
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const T1 = ts('2026-01-15T10:00:00.000Z');
const T2 = ts('2026-01-15T11:00:00.000Z');
const T3 = ts('2026-01-15T11:30:00.000Z');

const active = { guestId: 'g1', houseId: 'h1', type: 'chore', status: 'active', loggedBy: 'res' };
const pending = {
  ...active,
  status: 'disputed',
  disputeReason: 'Kitchen not cleaned',
  disputedBy: 'peer',
  disputeResolvedBy: 'peer',
  disputedAt: ts('2026-01-15T09:00:00.000Z'),
};
const approved = (at: Timestamp, by = 'mgr') => ({
  ...pending,
  status: 'resolved',
  disputed: 'successful',
  incomplete: true,
  disputeOutcome: 'incomplete-per-residents',
  disputeResult: 'success',
  disputeResolvedBy: by,
  disputeResolvedAt: at,
});
const rejected = (at: Timestamp, by = 'mgr') => ({
  ...approved(at, by),
  disputed: 'rejected',
  incomplete: false,
  disputeOutcome: null,
  disputeResult: 'fail',
});
const reopened = (at: Timestamp, by = 'owner') => ({
  ...pending,
  disputeResolvedBy: null,
  disputeResolvedAt: null,
  reopenedBy: by,
  reopenedAt: at,
});

const house = () => db.read('houses', 'h1')!;
const log = () => [
  ...(db.collections.get('activities/a1/dispute-decisions') ?? new Map()).entries(),
];
const archives = () => [...(db.collections.get('disputes') ?? new Map()).entries()];
const step = async (before: Data | undefined, after: Data) => {
  db.seed('activities', 'a1', after);
  return mirrorHouseDispute(asFirestore(db), 'a1', before, after, { now: NOW });
};

/** An event delivered again; the activity stays as it is now. */
const redeliver = (before: Data, after: Data) =>
  mirrorHouseDispute(asFirestore(db), 'a1', before, after, { now: NOW });

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'res' });
  db.seed('houses', 'h1', { name: 'H', disputes: {} });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('decision records', () => {
  it('a resolution is decided_{disputeResolvedAt ms}, with outcome and resolver', () => {
    expect(closingDecision(pending, approved(T1), NOW)).toEqual({
      id: `decided_${T1.toMillis()}`,
      data: expect.objectContaining({ event: 'approved', by: 'mgr', previousOutcome: null }),
    });
    expect(closingDecision(pending, rejected(T1), NOW)?.data.event).toBe('rejected');
    const keep = {
      ...pending,
      status: 'resolved',
      disputeResolvedBy: 'mgr',
      disputeResolvedAt: T1,
    };
    expect(closingDecision(pending, keep, NOW)?.data.event).toBe('kept');
    expect(closingDecision(pending, undefined, NOW)?.id).toBe(`decided_${Date.parse(NOW)}`);
    expect(closingDecision(active, pending, NOW)).toBeNull();
  });

  it('a reopen is reopened_{reopenedAt ms}, with who, and the outcome it undid', () => {
    expect(isReopen(approved(T1), reopened(T2))).toBe(true);
    expect(isReopen(active, pending)).toBe(false);
    expect(reopenDecision(approved(T1), reopened(T2), NOW)).toEqual({
      id: `reopened_${T2.toMillis()}`,
      data: expect.objectContaining({
        event: 'reopened',
        by: 'owner',
        previousOutcome: 'approved',
      }),
    });
    const legacyDeleted = { ...pending, status: 'deleted', disputeResolvedAt: T1, loggedAt: T1 };
    expect(reopenDecision(legacyDeleted, reopened(T2), NOW)?.data.previousOutcome).toBe('deleted');
  });

  it('a reopen keeps the dispute stamp; disputedAt tells a re-dispute by the same peer apart', () => {
    expect(disputeStamp(reopened(T2))).toBe(disputeStamp(pending));
    expect(disputeStamp({ ...pending, disputedAt: T3 })).not.toBe(disputeStamp(pending));
  });
});

describe('approve -> reopen -> reject -> reopen -> approve', () => {
  it('logs and archives every decision separately and keeps one live entry while pending', async () => {
    await step(active, pending);
    await step(pending, approved(T1));
    expect(house().disputes).toEqual({});
    await step(approved(T1), reopened(T2, 'owner'));
    expect(house().disputes.a1).toMatchObject({
      disputeStamp: disputeStamp(pending),
      status: 'pending',
    });
    await step(reopened(T2, 'owner'), rejected(T3, 'pl'));
    await step(rejected(T3, 'pl'), reopened(ts('2026-01-15T11:45:00.000Z'), 'mgr'));
    await step(
      reopened(ts('2026-01-15T11:45:00.000Z'), 'mgr'),
      approved(ts('2026-01-15T11:50:00.000Z'), 'mgr2'),
    );

    expect(log().map(([, d]) => [d.event, d.by, d.previousOutcome])).toEqual([
      ['approved', 'mgr', null],
      ['reopened', 'owner', 'approved'],
      ['rejected', 'pl', null],
      ['reopened', 'mgr', 'rejected'],
      ['approved', 'mgr2', null],
    ]);
    expect(archives().map(([, a]) => [a.resolutionMessage, a.resolvedBy])).toEqual([
      ['approved', 'mgr'],
      ['rejected', 'pl'],
      ['approved', 'mgr2'],
    ]);
    expect(house().disputes).toEqual({});
  });

  it('is idempotent: redelivered events log and archive nothing more', async () => {
    await step(active, pending);
    await step(pending, approved(T1));
    await step(approved(T1), reopened(T2));
    const before = [log().length, archives().length];
    expect(await redeliver(pending, approved(T1))).toEqual({ added: 0, removed: 0, logged: 0 });
    expect(await redeliver(approved(T1), reopened(T2))).toEqual({
      added: 0,
      removed: 0,
      logged: 0,
    });
    expect([log().length, archives().length]).toEqual(before);
    expect(house().disputes.a1).toBeDefined();
  });
});

describe('late and odd events', () => {
  it("a close processed after the reopen archives that decision's real outcome and keeps the live entry", async () => {
    await step(active, pending);
    db.seed('activities', 'a1', reopened(T2)); // approved, then reopened, before the close event runs
    await mirrorHouseDispute(asFirestore(db), 'a1', pending, approved(T1), { now: NOW });

    expect(archives().map(([, a]) => [a.resolutionMessage, a.resolvedBy])).toEqual([
      ['approved', 'mgr'],
    ]);
    expect(log().map(([id]) => id)).toEqual([`decided_${T1.toMillis()}`]);
    expect(house().disputes.a1).toMatchObject({ status: 'pending' });
  });

  it('the same peer re-disputing with the same reason (after a legacy restore) is a separate dispute', async () => {
    await step(active, pending);
    await step(pending, rejected(T1));
    const again = { ...rejected(T1), status: 'disputed', disputedAt: T3 };
    await step({ ...rejected(T1), status: 'active' }, again);
    await step(again, approved(ts('2026-01-15T11:50:00.000Z')));
    const stamps = archives().map(([, a]) => a.disputeStamp);
    expect(new Set(stamps).size).toBe(2);
    expect(archives().map(([, a]) => a.resolutionMessage)).toEqual(['rejected', 'approved']);
  });

  it('logs the decision even when the guest doc is gone (no mirror to update)', async () => {
    db.collections.get('guests')!.delete('g1');
    const r = await step(pending, approved(T1));
    expect(r).toEqual({ added: 0, removed: 0, logged: 1 });
    expect(log()[0][1]).toMatchObject({ event: 'approved', houseId: null });
  });
});
