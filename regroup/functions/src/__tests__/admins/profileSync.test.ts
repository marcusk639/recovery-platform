// src/__tests__/admins/profileSync.test.ts
//
// EditUserInfoForm copies the profile to the admins record only once that
// record has loaded, so a save made before it loads left the copy's name and
// phone stale. syncAdminProfile (run by onUserAdminProfileSync) copies the
// CURRENT users/{uid} name and phone onto every admins record with that
// userId.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from '../activities/fakeFirestore';
import { profileChanged, profilePatch, syncAdminProfile } from '../../admins/profileSync';

let db: FakeFirestore;
type Data = Record<string, unknown>;

const profile = (o: Data = {}) => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber: '555-0100',
  email: 'ada@example.com',
  ...o,
});
const sync = (before: Data | undefined, after: Data | undefined, uid = 'u1') =>
  syncAdminProfile(asFirestore(db), uid, before, after);
const adminDoc = (id: string) => db.read('admins', id)!;

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('users', 'u1', profile({ phoneNumber: '555-0199' }));
  // Stale copy: the form saved before the admins record loaded.
  db.seed('admins', 'a1', { userId: 'u1', houseIds: ['h1'], ...profile(), avatar: 'kept' });
  db.seed('admins', 'other', { userId: 'u2', ...profile({ firstName: 'Bob' }) });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('profileChanged', () => {
  it('is true when firstName, lastName or phoneNumber changed', () => {
    expect(profileChanged(profile(), profile({ firstName: 'Augusta' }))).toBe(true);
    expect(profileChanged(profile(), profile({ lastName: 'King' }))).toBe(true);
    expect(profileChanged(profile(), profile({ phoneNumber: '555-0199' }))).toBe(true);
    expect(profileChanged(undefined, profile())).toBe(true);
  });

  it('is false when only other fields changed, or the user doc is gone', () => {
    expect(profileChanged(profile(), profile({ avatar: 'new', messagingToken: ['t'] }))).toBe(
      false,
    );
    expect(profileChanged(profile(), profile())).toBe(false);
    expect(profileChanged(profile(), undefined)).toBe(false);
  });
});

describe('profilePatch', () => {
  it('copies only string fields that differ, never blanking a legacy copy', () => {
    expect(
      profilePatch({ firstName: 'Ada', phoneNumber: '' }, profile({ firstName: 'Ada' })),
    ).toEqual({ phoneNumber: '' });
    expect(profilePatch({ lastName: null }, profile())).toEqual({});
  });
});

describe('syncAdminProfile', () => {
  it('copies a changed phone onto the admins record, leaving other fields alone', async () => {
    const r = await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(r).toEqual({ matched: 1, updated: 1 });
    expect(adminDoc('a1')).toMatchObject({
      ...profile({ phoneNumber: '555-0199' }),
      userId: 'u1',
      houseIds: ['h1'],
      avatar: 'kept',
    });
    expect(adminDoc('other').firstName).toBe('Bob');
  });

  it('copies changed names', async () => {
    db.seed('users', 'u1', profile({ firstName: 'Augusta', lastName: 'King' }));
    await sync(profile(), profile({ firstName: 'Augusta', lastName: 'King' }));
    expect(adminDoc('a1')).toMatchObject({ firstName: 'Augusta', lastName: 'King' });
  });

  it('does nothing, not even a query, when no synced field changed', async () => {
    const r = await sync(profile(), profile({ avatar: 'new' }));
    expect(r).toEqual({ matched: 0, updated: 0 });
    expect(db.queries).toHaveLength(0);
    expect(db.transactions).toBe(0);
    expect(adminDoc('a1').phoneNumber).toBe('555-0100');
  });

  it('does nothing for a user with no admins record', async () => {
    db.seed('users', 'u3', profile({ phoneNumber: '555-0300' }));
    const r = await sync(profile(), profile({ phoneNumber: '555-0300' }), 'u3');
    expect(r).toEqual({ matched: 0, updated: 0 });
    expect(db.transactions).toBe(0);
    expect(db.writes).toHaveLength(0);
  });

  it('updates every admins record the user has', async () => {
    db.seed('admins', 'a2', { userId: 'u1', ...profile({ phoneNumber: 'old' }) });
    db.seed('admins', 'a3', { userId: 'u1', firstName: 'A' });
    const r = await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(r).toEqual({ matched: 3, updated: 3 });
    for (const id of ['a1', 'a2', 'a3']) {
      expect(adminDoc(id)).toMatchObject({
        firstName: 'Ada',
        lastName: 'Lovelace',
        phoneNumber: '555-0199',
      });
    }
    // email is not a synced field.
    expect(adminDoc('a3').email).toBeUndefined();
  });

  it('writes the CURRENT user doc, not the event, so out-of-order events converge', async () => {
    // Two saves: 555-0100 -> 555-0150 -> 555-0199. The second event arrives
    // first, then the first one, carrying the older value in its after.
    await sync(profile({ phoneNumber: '555-0150' }), profile({ phoneNumber: '555-0199' }));
    const r = await sync(profile(), profile({ phoneNumber: '555-0150' }));
    expect(adminDoc('a1').phoneNumber).toBe('555-0199');
    expect(r).toEqual({ matched: 1, updated: 0 });
  });

  it('writes nothing when the user doc is gone by the time it runs', async () => {
    db.collections.get('users')!.delete('u1');
    const r = await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(r.updated).toBe(0);
    expect(adminDoc('a1').phoneNumber).toBe('555-0100');
  });

  it('skips a record re-pointed at another user or deleted after the query', async () => {
    db.seed('admins', 'a2', { userId: 'u1', ...profile() });
    // Between the query and each record's transaction, a1 moves to u2 and
    // a2 is deleted: the transaction's re-read must catch both.
    const run = db.runTransaction.bind(db);
    jest.spyOn(db, 'runTransaction').mockImplementation(async (fn, options) => {
      db.seed('admins', 'a1', { ...adminDoc('a1'), userId: 'u2' });
      db.collections.get('admins')!.delete('a2');
      return run(fn, options);
    });
    const r = await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(r).toEqual({ matched: 2, updated: 0 });
    expect(adminDoc('a1').phoneNumber).toBe('555-0100');
    expect(db.writes).toHaveLength(0);
  });

  it('keeps a legacy copy when the user doc has no such field', async () => {
    db.seed('users', 'u1', { firstName: 'Ada', phoneNumber: '555-0199' });
    await sync(profile(), { firstName: 'Ada', phoneNumber: '555-0199' });
    expect(adminDoc('a1')).toMatchObject({ lastName: 'Lovelace', phoneNumber: '555-0199' });
  });

  it('is retry-safe: a failed record throws for a retry, and the retry finishes the job', async () => {
    db.seed('admins', 'a2', { userId: 'u1', ...profile() });
    db.failTransactions = 1; // the first record's transaction fails
    await expect(sync(profile(), profile({ phoneNumber: '555-0199' }))).rejects.toThrow(
      'unavailable',
    );
    // The other record was still updated.
    const phones = () => ['a1', 'a2'].map((id) => adminDoc(id).phoneNumber);
    expect(phones().filter((p) => p === '555-0199')).toHaveLength(1);

    const retry = await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(retry).toEqual({ matched: 2, updated: 1 });
    expect(phones()).toEqual(['555-0199', '555-0199']);

    const writes = db.writes.length;
    const again = await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(again).toEqual({ matched: 2, updated: 0 });
    expect(db.writes).toHaveLength(writes);
  });

  it('logs ids and counts only, never names or phone numbers', async () => {
    await sync(profile(), profile({ phoneNumber: '555-0199' }));
    expect(logger.info).toHaveBeenCalledWith('admin_profile_sync.done', {
      uid: 'u1',
      matched: 1,
      updated: 1,
      failed: false,
    });
    const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
    for (const value of ['Ada', 'Lovelace', '555-0199', 'ada@example.com']) {
      expect(logged).not.toContain(value);
    }
  });
});
