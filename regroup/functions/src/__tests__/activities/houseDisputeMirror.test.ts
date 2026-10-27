// src/__tests__/activities/houseDisputeMirror.test.ts
//
// house.disputes is now maintained server-side (residents used to replace the
// whole map). One entry per disputed activity, added on entering `disputed`,
// removed and archived on leaving it, idempotently.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { mirrorHouseDispute, outcomeOf } from '../../activities/houseDisputeMirror';

let db: FakeFirestore;
const NOW = '2026-01-15T12:00:00.000Z';

const active = { guestId: 'g1', houseId: 'h1', type: 'chore', status: 'active', loggedBy: 'resident-uid' };
const disputed = { ...active, status: 'disputed', disputeReason: 'Kitchen not cleaned' };
const house = () => db.read('houses', 'h1')!;

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'resident-uid' });
  db.seed('houses', 'h1', {
    name: 'H',
    disputes: { other: { id: 'other', activityId: 'a9', status: 'pending', message: 'keep me' } },
  });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('entering a dispute', () => {
  it('adds one entry keyed by the activity id, with the server-side disputer', async () => {
    const r = await mirrorHouseDispute(asFirestore(db), 'a1', active, disputed, { disputerUid: 'peer-uid', now: NOW });

    expect(r).toEqual({ added: 1, removed: 0 });
    expect(house().disputes.a1).toMatchObject({
      id: 'a1',
      activityId: 'a1',
      guestId: 'g1',
      houseId: 'h1',
      type: 'chore',
      message: 'Kitchen not cleaned',
      disputedBy: 'peer-uid',
      status: 'pending',
      challenges: [],
      createdAt: NOW,
    });
  });

  it('never touches other entries (no whole-map rewrite)', async () => {
    await mirrorHouseDispute(asFirestore(db), 'a1', active, disputed, { now: NOW });
    expect(house().disputes.other).toEqual({ id: 'other', activityId: 'a9', status: 'pending', message: 'keep me' });
    expect(house().name).toBe('H');
  });

  it('is idempotent across a redelivered event (keeps existing challenges)', async () => {
    await mirrorHouseDispute(asFirestore(db), 'a1', active, disputed, { now: NOW });
    db.read('houses', 'h1')!.disputes.a1.challenges = [{ challenger: 'x', message: 'y' }];
    const again = await mirrorHouseDispute(asFirestore(db), 'a1', active, disputed, { now: 'later' });
    expect(again).toEqual({ added: 0, removed: 0 });
    expect(house().disputes.a1.challenges).toHaveLength(1);
    expect(house().disputes.a1.createdAt).toBe(NOW);
  });

  it('uses the guest doc\'s house, not the activity\'s', async () => {
    db.seed('houses', 'evil', { disputes: {} });
    await mirrorHouseDispute(asFirestore(db), 'a1', active, { ...disputed, houseId: 'evil' }, { now: NOW });
    expect(db.read('houses', 'evil')!.disputes).toEqual({});
    expect(house().disputes.a1).toBeDefined();
  });

  it('skips (logging ids) when the guest or house is missing', async () => {
    expect(await mirrorHouseDispute(asFirestore(db), 'a1', active, { ...disputed, guestId: 'ghost' })).toEqual({
      added: 0,
      removed: 0,
    });
    db.seed('guests', 'g2', { houseId: 'gone', userId: 'u2' });
    expect(await mirrorHouseDispute(asFirestore(db), 'a2', active, { ...disputed, guestId: 'g2' })).toEqual({
      added: 0,
      removed: 0,
    });
  });
});

describe('leaving a dispute', () => {
  beforeEach(async () => {
    await mirrorHouseDispute(asFirestore(db), 'a1', active, disputed, { now: NOW });
    // An older app build also mirrored it, under a random uuid key.
    db.read('houses', 'h1')!.disputes['0b7c1a2e-uuid'] = { id: '0b7c1a2e-uuid', activityId: 'a1', status: 'pending' };
  });

  it.each([
    ['approved', { ...disputed, status: 'resolved', disputed: 'successful', incomplete: true, disputeResolvedBy: 'mgr' }],
    ['rejected', { ...disputed, status: 'resolved', disputed: 'rejected', incomplete: false, disputeResolvedBy: 'mgr' }],
    ['deleted', { ...disputed, status: 'deleted' }],
  ])('removes every entry for the activity and archives it as %s', async (outcome, after) => {
    const r = await mirrorHouseDispute(asFirestore(db), 'a1', disputed, after, { now: NOW });

    expect(r).toEqual({ added: 0, removed: 2 });
    expect(Object.keys(house().disputes)).toEqual(['other']);
    expect(db.read('disputes', 'a1')).toMatchObject({ status: 'resolved', resolutionMessage: outcome, houseId: 'h1' });
    expect(db.read('disputes', '0b7c1a2e-uuid')).toMatchObject({ resolutionMessage: outcome });
  });

  it('handles a hard delete of the activity', async () => {
    const r = await mirrorHouseDispute(asFirestore(db), 'a1', disputed, undefined, { now: NOW });
    expect(r.removed).toBe(2);
  });

  it('is idempotent across a redelivered resolution', async () => {
    const after = { ...disputed, status: 'resolved', disputed: 'rejected' };
    await mirrorHouseDispute(asFirestore(db), 'a1', disputed, after, { now: NOW });
    expect(await mirrorHouseDispute(asFirestore(db), 'a1', disputed, after, { now: NOW })).toEqual({
      added: 0,
      removed: 0,
    });
  });
});

describe('ignored writes and outcome labels', () => {
  it.each([
    ['a plain create', undefined, active],
    ['an edit of an open dispute', disputed, { ...disputed, loggedAt: 'x' }],
    ['a delete of an undisputed activity', active, { ...active, status: 'deleted' }],
  ])('ignores %s', async (_l, before, after) => {
    expect(await mirrorHouseDispute(asFirestore(db), 'a1', before, after)).toEqual({ added: 0, removed: 0 });
    expect(db.transactions).toBe(0);
  });

  it('labels legacy resolutions as closed', () => {
    expect(outcomeOf({ status: 'resolved' })).toBe('closed');
    expect(outcomeOf(undefined)).toBe('deleted');
  });

  it('never logs the reason', async () => {
    const info = jest.spyOn(logger, 'info');
    await mirrorHouseDispute(asFirestore(db), 'a1', active, disputed, { now: NOW });
    expect(JSON.stringify(info.mock.calls)).toContain('dispute_mirror.updated');
    expect(JSON.stringify(info.mock.calls)).not.toContain('Kitchen');
  });
});
