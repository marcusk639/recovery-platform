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

  it('stamps null for a guest with no app account (an intake)', async () => {
    await deliver(undefined, act({ guestId: 'intake' }));
    const doc = db.read('activities', 'a1')!;
    expect('residentUid' in doc && doc.residentUid === null).toBe(true);
  });

  it('restamps when an admin moves the activity to another guest', async () => {
    await deliver(undefined, act());
    const stamped = db.read('activities', 'a1')!;
    expect(await deliver(stamped, { ...stamped, guestId: 'g2' })).toBe('stamped');
    expect(db.read('activities', 'a1')!.residentUid).toBe('res2');
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

  it('is idempotent: a redelivered create writes nothing more', async () => {
    await deliver(undefined, act());
    const writes = db.writes.length;
    expect(await stampResidentUid(asFirestore(db), 'a1', undefined, act())).toBe('unchanged');
    expect(db.writes).toHaveLength(writes);
  });

  it('skips a missing guest doc, a deleted activity, and a stale event (guest changed since)', async () => {
    expect(await deliver(undefined, act({ guestId: 'ghost' }))).toBe('skipped');
    expect(db.read('activities', 'a1')).not.toHaveProperty('residentUid');
    expect(await stampResidentUid(asFirestore(db), 'a1', act(), undefined)).toBe('unchanged');
    db.seed('activities', 'a1', act({ guestId: 'g2' }));
    expect(await stampResidentUid(asFirestore(db), 'a1', undefined, act())).toBe('skipped');
  });

  it('logs ids only', async () => {
    const info = jest.spyOn(logger, 'info');
    await deliver(undefined, act());
    expect(JSON.stringify(info.mock.calls)).toContain('resident_stamp.stamped');
    expect(JSON.stringify(info.mock.calls)).not.toContain('res1');
  });
});

describe('helpers', () => {
  it('needsResidentStamp: on create, a guest change, or a missing stamp', () => {
    expect(needsResidentStamp(undefined, act())).toBe(true);
    expect(needsResidentStamp(act({ residentUid: 'res1' }), act({ residentUid: 'res1' }))).toBe(
      false,
    );
    expect(
      needsResidentStamp(act({ residentUid: 'res1' }), act({ guestId: 'g2', residentUid: 'res1' })),
    ).toBe(true);
    expect(needsResidentStamp(act(), undefined)).toBe(false);
  });

  it('residentUidFrom: the userId, else null', () => {
    expect(residentUidFrom({ userId: 'u' })).toBe('u');
    expect(residentUidFrom({ userId: '' })).toBeNull();
    expect(residentUidFrom(undefined)).toBeNull();
  });
});
