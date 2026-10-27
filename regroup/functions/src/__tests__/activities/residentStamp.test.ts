// src/__tests__/activities/residentStamp.test.ts
//
// residentUid is stamped server-side from guests.userId when an activity is
// created or moved to another guest. The rules' owner rule relies on it, so
// editing or deleting the guest doc later cannot hide who the resident is.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import {
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

  it('A: never moves a stamp, even when an admin moves the activity to another guest', async () => {
    await deliver(undefined, act());
    const stamped = db.read('activities', 'a1')!;
    expect(await deliver(stamped, { ...stamped, guestId: 'g2' })).toBe('unchanged');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res1');
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
    expect(
      needsResidentStamp(act({ residentUid: 'res1' }), act({ guestId: 'g2', residentUid: 'res1' })),
    ).toBe(false);
    expect(
      needsResidentStamp(undefined, act({ residentUid: null, residentUidPending: false })),
    ).toBe(false);
    expect(needsResidentStamp(act(), undefined)).toBe(false);
  });

  it('residentUidFrom: the userId, else null', () => {
    expect(residentUidFrom({ userId: 'u' })).toBe('u');
    expect(residentUidFrom({ userId: '' })).toBeNull();
    expect(residentUidFrom(undefined)).toBeNull();
  });
});
