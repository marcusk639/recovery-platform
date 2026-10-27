// src/__tests__/activities/guestRestamp.test.ts
//
// PR #141 review round 5, break 1: a senior peer pointed their own guest
// doc's userId elsewhere, logged an activity (stamped with the other
// account), pointed it back, and decided a dispute on their own activity.
// Now every change of a guest's account re-stamps that guest's activities
// from the guest doc's CURRENT account; and a decision by the activity's
// own resident or logger is flagged for review.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { accountChanged, restampGuestActivities } from '../../activities/guestRestamp';
import { flagSelfDecision } from '../../activities/selfDecisionCheck';

let db: FakeFirestore;
type Data = Record<string, unknown>;
const act = (o: Data = {}) => ({
  guestId: 'gpl',
  houseId: 'h1',
  status: 'active',
  loggedBy: 'mgr',
  ...o,
});
const restamp = (before: Data | undefined, after: Data | undefined, pageSize = 2) =>
  restampGuestActivities(asFirestore(db), 'gpl', before, after, { pageSize });

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'gpl', { houseId: 'h1', userId: 'pl' });
  db.seed('activities', 'c1', act({ residentUid: 'x' }));
  db.seed('activities', 'c2', act({ residentUid: null }));
  db.seed('activities', 'c3', act({ residentUid: 'pl' }));
  db.seed('activities', 'other', act({ guestId: 'g2', residentUid: 'x' }));
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('restampGuestActivities', () => {
  it('A: an account change never moves a stamp; it only fills an empty one', async () => {
    // probe7 A: S points their own guest doc at a decoy (or deletes and
    // recreates it): the stamp on their activity must stay S.
    db.seed('guests', 'gpl', { houseId: 'h1', userId: 'decoy' });
    const r = await restamp({ userId: 'pl' }, { userId: 'decoy' });
    expect(r).toEqual({ scanned: 3, stamped: 1 });
    expect(['c1', 'c2', 'c3'].map((id) => db.read('activities', id)!.residentUid)).toEqual([
      'x',
      'decoy',
      'pl',
    ]);
    expect(db.read('activities', 'other')!.residentUid).toBe('x');
  });

  it('I2: fills a null stamp when the account is linked (none -> pl)', async () => {
    await restamp({ houseId: 'h1' }, { houseId: 'h1', userId: 'pl' });
    expect(db.read('activities', 'c2')!.residentUid).toBe('pl');
  });

  it("stamps from the guest doc's CURRENT account, so late events converge", async () => {
    // The x -> pl event is processed after a later pl -> y change.
    db.seed('guests', 'gpl', { houseId: 'h1', userId: 'y' });
    await restamp({ userId: 'x' }, { userId: 'pl' });
    expect(db.read('activities', 'c2')!.residentUid).toBe('y');
    expect(db.read('activities', 'c1')!.residentUid).toBe('x');
  });

  it('does nothing when the account did not change, or was cleared; is idempotent; logs ids only', async () => {
    const info = jest.spyOn(logger, 'info');
    expect(
      await restamp({ userId: 'pl', firstName: 'A' }, { userId: 'pl', firstName: 'B' }),
    ).toEqual({ scanned: 0, stamped: 0 });
    expect(await restamp({ userId: 'pl' }, { houseId: 'h1' })).toEqual({ scanned: 0, stamped: 0 });
    await restamp({ userId: 'x' }, { userId: 'pl' });
    expect((await restamp({ userId: 'x' }, { userId: 'pl' })).stamped).toBe(0);
    expect(JSON.stringify(info.mock.calls)).toContain('resident_restamp.done');
    expect(JSON.stringify(info.mock.calls)).not.toContain('"pl"');
  });

  it('6: a fill that fails leaves the activity pending (not unfillable), then rethrows to retry', async () => {
    db.seed('activities', 'c2', act({ residentUid: null, residentUidPending: false }));
    db.failTransactions = 1;
    await expect(restamp({ userId: 'x' }, { userId: 'pl' })).rejects.toThrow('unavailable');
    expect(db.read('activities', 'c2')!.residentUidPending).toBe(true);
    // The retry (or the next activity write) fills it.
    await restamp({ userId: 'x' }, { userId: 'pl' });
    expect(db.read('activities', 'c2')!.residentUid).toBe('pl');
    expect(db.read('activities', 'c2')).not.toHaveProperty('residentUidPending');
  });

  it('accountChanged: set or changed to a non-empty account only', () => {
    expect(accountChanged(undefined, { userId: 'a' })).toBe(true);
    expect(accountChanged({ userId: 'a' }, { userId: 'b' })).toBe(true);
    expect(accountChanged({ userId: 'a' }, { userId: 'a' })).toBe(false);
    expect(accountChanged({ userId: 'a' }, undefined)).toBe(false);
  });
});

describe('flagSelfDecision', () => {
  const pending = act({
    status: 'disputed',
    disputedBy: 'peer',
    disputeResolvedBy: 'peer',
    residentUid: 'pl',
  });
  const rejectBy = (by: string) => ({
    ...pending,
    status: 'resolved',
    disputed: 'rejected',
    disputeResolvedBy: by,
  });
  const run = (before: Data, after: Data) =>
    flagSelfDecision(asFirestore(db), 'c1', before, after, { now: '2026-01-15T12:00:00.000Z' });

  it('flags a decision by the guest doc account, the stamp, or the logger (ids-only log)', async () => {
    const warn = jest.spyOn(logger, 'warn');
    db.seed('activities', 'c1', rejectBy('pl'));
    expect(await run(pending, rejectBy('pl'))).toBe(true);
    expect(db.read('activities', 'c1')!.flaggedForReview).toMatchObject({
      reason: 'self_decision',
      event: 'rejected',
    });
    expect(
      await run(
        { ...pending, residentUid: 'stamped' },
        { ...rejectBy('stamped'), residentUid: 'stamped' },
      ),
    ).toBe(true);
    expect(await run(pending, rejectBy('mgr'))).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).toContain('dispute.self_decision');
  });

  it('S-4: merges with an existing flag instead of overwriting it', async () => {
    db.seed('activities', 'c1', { ...rejectBy('pl'), flaggedForReview: { reason: 'stamp_mismatch' } });
    expect(await run(pending, rejectBy('pl'))).toBe(true);
    expect(db.read('activities', 'c1')!.flaggedForReview).toEqual({
      reason: 'stamp_mismatch',
      reasons: ['stamp_mismatch', 'self_decision'],
    });
  });

  it('flags a self reopen too; ignores other admins and non-decisions; tolerates a deleted activity', async () => {
    const reopened = {
      ...rejectBy('mgr2'),
      status: 'disputed',
      reopenedBy: 'pl',
      reopenedAt: '2026-01-15T11:00:00.000Z',
    };
    expect(await run(rejectBy('mgr2'), reopened)).toBe(true);
    db.seed('activities', 'c1', rejectBy('mgr2'));
    expect(await run(pending, rejectBy('mgr2'))).toBe(false);
    expect(await run(act(), pending)).toBe(false);
    db.collections.get('activities')!.delete('c1');
    expect(await run(pending, rejectBy('pl'))).toBe(true);
  });
});
