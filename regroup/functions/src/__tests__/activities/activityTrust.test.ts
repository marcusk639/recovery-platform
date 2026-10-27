// src/__tests__/activities/activityTrust.test.ts
//
// Security of the week-summary recompute. The activity document is
// client-written, so the trigger must not trust its guestId/houseId/loggedBy:
//   (A) anyone could inflate another resident's week by logging an activity
//       with the victim's guestId;
//   (B) an activity's houseId could re-parent the victim's summary to another
//       house, hiding it from the victim's admins and reports.
// (C) — a resident reactivating their own disputed activity or moving its
// timestamp — is closed in firestore.rules (activities update), tested in
// regroup/mobile/firebase/__tests__/activities.rules.test.ts.

import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';
import {
  claimsHouseAdminCheck,
  trustedActivities,
  trustedGuestFrom,
} from '../../activities/activityTrust';

const WEEK = '2026-01-12';
const SUMMARY = `victim_${WEEK}`;
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const deps = {
  isHouseAdmin: async (uid: string, houseId: string) => uid === 'admin-uid' && houseId === 'h1',
};

let db: FakeFirestore;

const activity = (overrides: Record<string, unknown> = {}) => ({
  guestId: 'victim',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'victim-uid',
  timestamp: ts('2026-01-14T18:00:00Z'),
  data: {},
  ...overrides,
});

async function write(id: string, data: Record<string, unknown>) {
  db.seed('activities', id, data);
  return syncWeekSummariesForActivityWrite(asFirestore(db), id, undefined, data, deps);
}

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('houses', 'h1', { timezone: 'America/Chicago' });
  db.seed('guests', 'victim', { houseId: 'h1', userId: 'victim-uid' });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('(A) forged activities for another guest are not counted', () => {
  it('ignores an activity logged by a stranger with the victim\'s guestId', async () => {
    await write('legit', activity());
    await write('forged', activity({ loggedBy: 'attacker-uid' }));

    expect(db.read('week-summaries', SUMMARY)!.stats.choresCompleted).toBe(1);
    expect(db.read('week-summaries', SUMMARY)!.activityCount).toBe(1);
  });

  it('ignores one logged by an admin of a different house', async () => {
    await write('forged', activity({ loggedBy: 'other-house-admin' }));
    expect(db.read('week-summaries', SUMMARY)!.activityCount).toBe(0);
  });

  it('counts one logged on the resident\'s behalf by an admin of their house', async () => {
    await write('by-admin', activity({ loggedBy: 'admin-uid', type: 'meeting' }));
    expect(db.read('week-summaries', SUMMARY)!.stats.meetingsAttended).toBe(1);
  });

  it('does not count a guest-without-account\'s activity unless an admin logged it', async () => {
    db.seed('guests', 'victim', { houseId: 'h1' });
    await write('a', activity({ loggedBy: '' }));
    await write('b', activity({ loggedBy: 'admin-uid' }));
    expect(db.read('week-summaries', SUMMARY)!.activityCount).toBe(1);
  });
});

describe('(B) an activity cannot re-parent the summary', () => {
  it('keeps the guest\'s houseId and does not count an activity claiming another house', async () => {
    await write('legit', activity());
    await write('reparent', activity({ houseId: 'evil-house' }));

    const s = db.read('week-summaries', SUMMARY)!;
    expect(s.houseId).toBe('h1');
    expect(s.activityCount).toBe(1);
  });

  it('takes the summary houseId from the guest even when it is created by a foreign-house activity', async () => {
    await write('reparent', activity({ houseId: 'evil-house', loggedBy: 'victim-uid' }));
    expect(db.read('week-summaries', SUMMARY)!.houseId).toBe('h1');
    expect(db.read('week-summaries', SUMMARY)!.activityCount).toBe(0);
  });

  it('repairs a summary that an earlier version re-parented', async () => {
    db.seed('week-summaries', SUMMARY, { guestId: 'victim', houseId: 'evil-house', stats: {} });
    await write('legit', activity());
    expect(db.read('week-summaries', SUMMARY)!.houseId).toBe('h1');
  });
});

describe('missing guest', () => {
  it('skips, writes nothing and logs ids only', async () => {
    const warn = jest.spyOn(logger, 'warn');
    const r = await write('orphan', activity({ guestId: 'ghost' }));

    expect(r).toEqual({ recomputed: [] });
    expect(db.read('week-summaries', `ghost_${WEEK}`)).toBeUndefined();
    expect(db.transactions).toBe(0);
    expect(JSON.stringify(warn.mock.calls)).toContain('ghost');
  });

  it('treats a guest doc with no houseId as missing', () => {
    expect(trustedGuestFrom('g', { userId: 'u' })).toBeNull();
    expect(trustedGuestFrom('g', { houseId: 'h', userId: 'u' })).toEqual({
      guestId: 'g',
      houseId: 'h',
      residentUid: 'u',
    });
  });
});

describe('trustedActivities', () => {
  it('tallies exclusions for active activities only, and never checks inactive ones', async () => {
    const isHouseAdmin = jest.fn(deps.isHouseAdmin);
    const { trusted, excluded } = await trustedActivities(
      [
        activity(),
        activity({ houseId: 'x' }),
        activity({ loggedBy: 'attacker' }),
        activity({ loggedBy: 'attacker', status: 'deleted' }),
      ],
      { guestId: 'victim', houseId: 'h1', residentUid: 'victim-uid' },
      isHouseAdmin,
    );
    expect(trusted).toHaveLength(1);
    expect(excluded).toEqual({ otherHouse: 1, untrustedLogger: 1 });
    expect(isHouseAdmin).toHaveBeenCalledTimes(1);
  });
});

describe('claimsHouseAdminCheck (mirrors the rules\' isAdmin)', () => {
  const users: Record<string, Record<string, unknown>> = {
    admin: { admin: { h1: true } },
    owner: { superAdmin: { h1: true } },
    resident: { guest: { h1: true } },
    elsewhere: { admin: { h2: true } },
  };
  const getUser = jest.fn(async (uid: string) => {
    if (uid === 'broken') throw Object.assign(new Error('boom'), { code: 'auth/internal-error' });
    if (!(uid in users)) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
    return { customClaims: users[uid] };
  });

  it('accepts admin and superAdmin claims for the house only', async () => {
    const check = claimsHouseAdminCheck(getUser);
    expect(await check('admin', 'h1')).toBe(true);
    expect(await check('owner', 'h1')).toBe(true);
    expect(await check('resident', 'h1')).toBe(false);
    expect(await check('elsewhere', 'h1')).toBe(false);
    expect(await check('', 'h1')).toBe(false);
  });

  it('treats a deleted Auth user as not an admin, and caches one lookup per uid', async () => {
    getUser.mockClear();
    const check = claimsHouseAdminCheck(getUser);
    expect(await check('gone', 'h1')).toBe(false);
    await check('admin', 'h1');
    await check('admin', 'h2');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('rethrows other Auth failures so the event is retried', async () => {
    await expect(claimsHouseAdminCheck(getUser)('broken', 'h1')).rejects.toThrow('boom');
  });
});
