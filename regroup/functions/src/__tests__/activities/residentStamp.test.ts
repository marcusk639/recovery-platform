// src/__tests__/activities/residentStamp.test.ts
//
// residentUid is stamped server-side from guests.userId when an activity is
// created or moved to another guest. The rules' owner rule relies on it, so
// editing or deleting the guest doc later cannot hide who the resident is.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import {
  hasDisputeHistory,
  needsResidentStamp,
  residentUidFrom,
  stampResidentUid,
} from '../../activities/residentStamp';

let db: FakeFirestore;
type Data = Record<string, unknown>;
const act = (o: Data = {}) => ({
  guestId: 'g1',
  houseId: 'h1',
  status: 'active',
  loggedBy: 'mgr',
  ...o,
});

const deliver = (before: Data | undefined, after: Data | undefined) => {
  if (after) db.seed('activities', 'a1', after);
  return stampResidentUid(asFirestore(db), 'a1', before, after);
};

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'res1' });
  db.seed('guests', 'g2', { houseId: 'h1', userId: 'res2' });
  db.seed('guests', 'intake', { houseId: 'h1' });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('stampResidentUid', () => {
  it("stamps a new activity with its guest's account", async () => {
    expect(await deliver(undefined, act())).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res1');
  });

  it('D1: a correction that loses the race to a dispute still fills the empty stamp', async () => {
    // An accountless guest's activity, found unfillable...
    db.seed(
      'activities',
      'a1',
      act({ guestId: 'intake', residentUid: null, residentUidPending: false }),
    );
    const before = db.read('activities', 'a1')!;
    // ...is re-pointed onto g1 (res1), and a peer disputes it before the event runs.
    const corrected = { ...before, guestId: 'g1' };
    db.seed('activities', 'a1', {
      ...corrected,
      status: 'disputed',
      disputedBy: 'p',
      disputeResolvedBy: 'p',
    });
    expect(await stampResidentUid(asFirestore(db), 'a1', before, corrected)).toBe('stamped');
    expect(db.read('activities', 'a1')).toMatchObject({ residentUid: 'res1', status: 'disputed' });
    expect(db.read('activities', 'a1')).not.toHaveProperty('residentUidPending');
  });

  it('D1: entering a dispute fills an empty stamp marked unfillable, once the guest has an account', async () => {
    db.seed('activities', 'a1', act({ residentUid: null, residentUidPending: false }));
    const before = db.read('activities', 'a1')!;
    const disputed = { ...before, status: 'disputed', disputedBy: 'p', disputeResolvedBy: 'p' };
    expect(await deliver(before, disputed)).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res1');
    // An ordinary later write of an unfillable stamp still skips the transaction.
    db.seed(
      'activities',
      'a2',
      act({ guestId: 'intake', residentUid: null, residentUidPending: false }),
    );
    const tx = db.transactions;
    const a2 = db.read('activities', 'a2')!;
    expect(await stampResidentUid(asFirestore(db), 'a2', a2, { ...a2, verified: true })).toBe(
      'unchanged',
    );
    expect(db.transactions).toBe(tx);
  });

  it('B4: a disputed activity whose guest doc is gone is flagged guest_missing (merged), not silently left null', async () => {
    db.seed(
      'activities',
      'a1',
      act({ guestId: 'ghost', flaggedForReview: { reason: 'self_decision' } }),
    );
    const before = db.read('activities', 'a1')!;
    const disputed = { ...before, status: 'disputed', disputedBy: 'p', disputeResolvedBy: 'p' };
    expect(await deliver(before, disputed)).toBe('guestMissing');
    expect(db.read('activities', 'a1')).toMatchObject({
      residentUid: null,
      flaggedForReview: { reason: 'self_decision', reasons: ['self_decision', 'guest_missing'] },
    });
  });

  it('records once that a guest with no app account (an intake) cannot be stamped yet', async () => {
    const warn = jest.spyOn(logger, 'warn');
    expect(await deliver(undefined, act({ guestId: 'intake' }))).toBe('unfillable');
    const doc = db.read('activities', 'a1')!;
    expect(doc.residentUid).toBeNull();
    expect(doc.residentUidPending).toBe(false);
    // S6: later writes skip the transaction, and nothing is logged again.
    const tx = db.transactions;
    expect(await deliver(doc, { ...doc, verified: true })).toBe('unchanged');
    expect(db.transactions).toBe(tx);
    expect(warn.mock.calls.filter(([m]) => m === 'resident_stamp.unfillable')).toHaveLength(1);
  });

  it('2 (G1): an admin moving an undisputed activity to another guest re-stamps it; a disputed one never moves', async () => {
    await deliver(undefined, act());
    const stamped = db.read('activities', 'a1')!;
    expect(await deliver(stamped, { ...stamped, guestId: 'g2' })).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res2');
    // With dispute history (here written by the Admin SDK; the rules freeze guestId): no re-stamp.
    const disputed = { ...db.read('activities', 'a1')!, status: 'disputed', disputedBy: 'p' };
    expect(await deliver(disputed, { ...disputed, guestId: 'g1' })).toBe('unchanged');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res2');
  });

  it('2 (5d): correcting an unfillable activity onto a linked guest re-stamps it; onto an accountless one makes it null', async () => {
    await deliver(undefined, act({ guestId: 'intake' }));
    const unfillable = db.read('activities', 'a1')!;
    expect(unfillable.residentUidPending).toBe(false);
    expect(await deliver(unfillable, { ...unfillable, guestId: 'g2' })).toBe('stamped');
    const doc = db.read('activities', 'a1')!;
    expect(doc.residentUid).toBe('res2');
    expect(doc).not.toHaveProperty('residentUidPending');
    expect(await deliver(doc, { ...doc, guestId: 'intake' })).toBe('unfillable');
    expect(db.read('activities', 'a1')).toMatchObject({
      residentUid: null,
      residentUidPending: false,
    });
  });

  it('keeps the stamp when the guest doc changes later (a deleted or cleared userId)', async () => {
    await deliver(undefined, act());
    const stamped = db.read('activities', 'a1')!;
    db.seed('guests', 'g1', { houseId: 'h1' });
    expect(await deliver(stamped, { ...stamped, verified: true })).toBe('unchanged');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res1');
  });

  it('stamps an older activity with no stamp on its next write', async () => {
    expect(await deliver(act(), act({ verified: true }))).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res1');
  });

  it('I2: fills a null stamp (not yet marked unfillable) on the next write once the guest has an account', async () => {
    db.seed('activities', 'a1', act({ guestId: 'intake', residentUid: null }));
    db.seed('guests', 'intake', { houseId: 'h1', userId: 'linked' });
    const stamped = db.read('activities', 'a1')!;
    expect(await deliver(stamped, { ...stamped, verified: true })).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('linked');
  });

  it('is idempotent: a redelivered create writes nothing more', async () => {
    await deliver(undefined, act());
    const writes = db.writes.length;
    expect(await stampResidentUid(asFirestore(db), 'a1', undefined, act())).toBe('unchanged');
    expect(db.writes).toHaveLength(writes);
  });

  it('a missing guest doc is unfillable; a deleted activity is skipped; a stale event stamps from the current doc', async () => {
    expect(await deliver(undefined, act({ guestId: 'ghost' }))).toBe('unfillable');
    expect(db.read('activities', 'a1')!.residentUid).toBeNull();
    expect(await stampResidentUid(asFirestore(db), 'a1', act(), undefined)).toBe('unchanged');
    db.collections.get('activities')!.delete('a1');
    expect(await stampResidentUid(asFirestore(db), 'a1', undefined, act())).toBe('skipped');
    db.seed('activities', 'a1', act({ guestId: 'g2' }));
    expect(await stampResidentUid(asFirestore(db), 'a1', undefined, act())).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res2');
  });

  it('logs ids only', async () => {
    const info = jest.spyOn(logger, 'info');
    await deliver(undefined, act());
    expect(JSON.stringify(info.mock.calls)).toContain('resident_stamp.stamped');
    expect(JSON.stringify(info.mock.calls)).not.toContain('res1');
  });
});

describe('helpers', () => {
  it('needsResidentStamp: only an absent or null stamp not already found unfillable', () => {
    expect(needsResidentStamp(undefined, act())).toBe(true);
    expect(needsResidentStamp(undefined, act({ residentUid: null }))).toBe(true);
    expect(needsResidentStamp(act({ residentUid: 'res1' }), act({ residentUid: 'res1' }))).toBe(
      false,
    );
    // A pre-dispute guest correction re-stamps; with dispute history it does not.
    expect(
      needsResidentStamp(act({ residentUid: 'res1' }), act({ guestId: 'g2', residentUid: 'res1' })),
    ).toBe(true);
    expect(
      needsResidentStamp(
        act({ residentUid: 'res1' }),
        act({ guestId: 'g2', residentUid: 'res1', status: 'disputed' }),
      ),
    ).toBe(false);
    expect(
      needsResidentStamp(undefined, act({ residentUid: null, residentUidPending: false })),
    ).toBe(false);
    expect(needsResidentStamp(act(), undefined)).toBe(false);
  });

  it('hasDisputeHistory mirrors the rules: a null disputeResult (or any present key) is history', () => {
    expect(hasDisputeHistory({ status: 'active', disputeResult: null })).toBe(true);
    expect(hasDisputeHistory({ status: 'active', disputedBy: null })).toBe(true);
    expect(hasDisputeHistory({ status: 'active', disputeResult: 'none' })).toBe(false);
    expect(hasDisputeHistory({ status: 'active' })).toBe(false);
  });

  it('residentUidFrom: the userId, else null', () => {
    expect(residentUidFrom({ userId: 'u' })).toBe('u');
    expect(residentUidFrom({ userId: '' })).toBeNull();
    expect(residentUidFrom(undefined)).toBeNull();
  });
});
