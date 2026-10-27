// src/__tests__/activities/houseDisputeMirror.test.ts
//
// house.disputes is maintained server-side (residents used to replace the
// whole map). It reconciles from the activity's CURRENT state, so redelivered
// and out-of-order events converge: one entry while the activity is disputed,
// none (archived) once it is not.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { mirrorHouseDispute, outcomeOf } from '../../activities/houseDisputeMirror';

let db: FakeFirestore;
const NOW = '2026-01-15T12:00:00.000Z';
type Data = Record<string, unknown>;

const active = {
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'resident-uid',
};
const disputed = {
  ...active,
  status: 'disputed',
  disputeReason: 'Kitchen not cleaned',
  disputedBy: 'peer-uid',
};
const approved = {
  ...disputed,
  status: 'resolved',
  disputed: 'successful',
  incomplete: true,
  disputeResolvedBy: 'mgr',
};
const rejected = {
  ...disputed,
  status: 'resolved',
  disputed: 'rejected',
  incomplete: false,
  disputeResolvedBy: 'mgr',
};
const house = () => db.read('houses', 'h1')!;
/** Archived disputes for activity a1 (ids are {key}[_{stamp}][_{decision id}]). */
const archives = () =>
  [...(db.collections.get('disputes') ?? new Map()).entries()].filter(
    ([id]) => id.startsWith('a1') || id.includes('uuid'),
  );
const archiveOf = (prefix: string) => archives().find(([id]) => id.startsWith(prefix))?.[1];

/** Deliver an event whose payload is before/after; `committed` is the doc NOW. */
const deliver = (before: Data | undefined, after: Data | undefined, now = NOW) =>
  mirrorHouseDispute(asFirestore(db), 'a1', before, after, { now });
const commit = (state: Data | undefined) => {
  if (state) db.seed('activities', 'a1', state);
  else db.collections.get('activities')?.delete('a1');
};

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
  it('adds one entry keyed by the activity id, with the disputer this write set', async () => {
    commit(disputed);
    const r = await deliver(active, disputed);

    expect(r).toEqual({ added: 1, removed: 0, logged: 0 });
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

  it('never touches other entries or fields (no whole-map rewrite)', async () => {
    commit(disputed);
    await deliver(active, disputed);
    expect(house().disputes.other).toEqual({
      id: 'other',
      activityId: 'a9',
      status: 'pending',
      message: 'keep me',
    });
    expect(house().name).toBe('H');
  });

  it('is idempotent across a redelivered event (keeps existing challenges)', async () => {
    commit(disputed);
    await deliver(active, disputed);
    house().disputes.a1.challenges = [{ challenger: 'x', message: 'y' }];
    expect(await deliver(active, disputed, 'later')).toMatchObject({ added: 0, removed: 0 });
    expect(house().disputes.a1.challenges).toHaveLength(1);
    expect(house().disputes.a1.createdAt).toBe(NOW);
  });

  it("adds nothing when an older build's uuid-keyed entry for the activity exists", async () => {
    house().disputes['0b7c-uuid'] = {
      id: '0b7c-uuid',
      activityId: 'a1',
      status: 'pending',
      message: 'Kitchen not cleaned', // older builds stored the reason as message
    };
    commit(disputed);
    expect(await deliver(active, disputed)).toMatchObject({ added: 0, removed: 0 });
    expect(house().disputes.a1).toBeUndefined();
  });

  it("uses the guest doc's house, not the activity's", async () => {
    db.seed('houses', 'evil', { disputes: {} });
    const claimsEvil = { ...disputed, houseId: 'evil' };
    commit(claimsEvil);
    await deliver(active, claimsEvil);
    expect(db.read('houses', 'evil')!.disputes).toEqual({});
    expect(house().disputes.a1).toBeDefined();
  });

  it('skips (logging ids) when the guest or house is missing', async () => {
    commit({ ...disputed, guestId: 'ghost' });
    expect(await deliver(active, { ...disputed, guestId: 'ghost' })).toMatchObject({
      added: 0,
      removed: 0,
    });
    db.seed('guests', 'g2', { houseId: 'gone', userId: 'u2' });
    commit({ ...disputed, guestId: 'g2' });
    expect(await deliver(active, { ...disputed, guestId: 'g2' })).toMatchObject({
      added: 0,
      removed: 0,
    });
  });
});

describe('leaving a dispute', () => {
  beforeEach(async () => {
    commit(disputed);
    await deliver(active, disputed);
    // An older app build also mirrored it, under a random uuid key.
    house().disputes['0b7c1a2e-uuid'] = {
      id: '0b7c1a2e-uuid',
      activityId: 'a1',
      status: 'pending',
      message: 'Kitchen not cleaned',
    };
  });

  it.each([
    ['approved', approved],
    ['rejected', rejected],
    ['deleted', { ...disputed, status: 'deleted' }],
  ])('removes every entry for the activity and archives it as %s', async (outcome, after) => {
    commit(after);
    const r = await deliver(disputed, after);

    expect(r).toEqual({ added: 0, removed: 2, logged: 1 });
    expect(Object.keys(house().disputes)).toEqual(['other']);
    expect(archiveOf('a1_')).toMatchObject({
      status: 'resolved',
      resolutionMessage: outcome,
      houseId: 'h1',
    });
    expect(archiveOf('0b7c1a2e-uuid_decided_')).toMatchObject({ resolutionMessage: outcome });
  });

  it('handles a hard delete of the activity', async () => {
    commit(undefined);
    expect((await deliver(disputed, undefined)).removed).toBe(2);
  });
});

describe('redelivery and reordering converge on the current state', () => {
  it('an "open" event redelivered after the close re-adds nothing', async () => {
    commit(disputed);
    await deliver(active, disputed);
    commit(approved);
    await deliver(disputed, approved);

    // The open event is retried late; the dispute is already resolved.
    expect(await deliver(active, disputed)).toMatchObject({ added: 0, removed: 0 });
    expect(house().disputes.a1).toBeUndefined();
  });

  it('a close processed before its open still ends with no entry', async () => {
    commit(rejected); // both writes are committed before either event runs
    await deliver(disputed, rejected);
    await deliver(active, disputed);
    expect(house().disputes.a1).toBeUndefined();
    expect(Object.keys(house().disputes)).toEqual(['other']);
  });

  it('an open processed after a stale close still ends with the entry while disputed', async () => {
    // Disputed, deleted by the owner... then an admin restored and it was
    // disputed again: the old close event arrives last.
    commit(disputed);
    await deliver(active, disputed);
    await deliver(disputed, { ...disputed, status: 'deleted' });
    expect(house().disputes.a1).toBeDefined();
  });

  it('double redelivery of both events changes nothing more', async () => {
    commit(disputed);
    await deliver(active, disputed);
    commit(approved);
    await deliver(disputed, approved);
    const archived = archiveOf('a1_');
    for (let i = 0; i < 2; i++) {
      expect(await deliver(active, disputed)).toMatchObject({ added: 0, removed: 0 });
      expect(await deliver(disputed, approved)).toEqual({ added: 0, removed: 0, logged: 0 });
    }
    expect(house().disputes.a1).toBeUndefined();
    expect(archiveOf('a1_')).toBe(archived);
    expect(archives()).toHaveLength(1);
  });
});

describe('each entry belongs to one dispute (a legacy restore, then a re-dispute)', () => {
  const d1 = {
    ...active,
    status: 'disputed',
    disputeReason: 'A says',
    disputedBy: 'A',
    disputeResolvedBy: 'A',
  };
  const closed1 = {
    ...d1,
    status: 'resolved',
    disputed: 'rejected',
    incomplete: false,
    disputeResolvedBy: 'mgr',
  };
  const restored = { ...closed1, status: 'active' };
  const d2 = {
    ...restored,
    status: 'disputed',
    disputeReason: 'B says',
    disputedBy: 'B',
    disputeResolvedBy: 'B',
  };

  it('a stale OPEN of dispute #1, retried after the restore and dispute #2, is not credited to #2', async () => {
    commit(d2); // #2 is committed; #1's events are retried late
    await deliver(active, d1);
    await deliver(d1, closed1);
    await deliver(restored, d2);

    const e = house().disputes.a1;
    expect(e.disputedBy).toBe('B');
    expect(e.message).toBe('B says');
    expect(Object.values(house().disputes).filter((x: any) => x.activityId === 'a1')).toHaveLength(
      1,
    );
  });

  it('a stale CLOSE of dispute #1 after the open of #2 archives #1 with its real outcome and keeps #2', async () => {
    commit(d1);
    await deliver(active, d1);
    commit(d2);
    await deliver(restored, d2);
    await deliver(d1, closed1); // late

    const e = house().disputes.a1;
    expect(e.message).toBe('B says');
    expect(e.disputedBy).toBe('B');
    const ofA = archives()
      .map(([, v]) => v)
      .filter((v: any) => v.message === 'A says');
    expect(ofA).toContainEqual(expect.objectContaining({ resolutionMessage: 'superseded' }));
    expect(ofA).toContainEqual(
      expect.objectContaining({
        resolutionMessage: 'rejected',
        resolvedBy: 'mgr',
        disputedBy: 'A',
      }),
    );
  });

  it('builds the entry from the current state, dated by the dispute write', async () => {
    const at = { toDate: () => new Date('2026-01-14T19:00:00.000Z') };
    commit({ ...d1, loggedAt: at });
    await deliver(active, { ...d1, disputedBy: 'stale-event-value' });
    expect(house().disputes.a1).toMatchObject({
      disputedBy: 'A',
      createdAt: '2026-01-14T19:00:00.000Z',
    });
  });
});

describe('ignored writes and outcome labels', () => {
  it.each([
    ['a plain create', undefined, active],
    ['an edit of an open dispute', disputed, { ...disputed, loggedAt: 'x' }],
    ['a delete of an undisputed activity', active, { ...active, status: 'deleted' }],
  ])('ignores %s', async (_l, before, after) => {
    expect(await mirrorHouseDispute(asFirestore(db), 'a1', before, after)).toEqual({
      added: 0,
      removed: 0,
      logged: 0,
    });
    expect(db.transactions).toBe(0);
  });

  it("labels an old build's keep (no outcome fields) as kept", () => {
    expect(outcomeOf({ status: 'resolved' })).toBe('kept');
    expect(outcomeOf(undefined)).toBe('deleted');
  });

  it('never logs the reason', async () => {
    const info = jest.spyOn(logger, 'info');
    commit(disputed);
    await deliver(active, disputed);
    expect(JSON.stringify(info.mock.calls)).toContain('dispute_mirror.updated');
    expect(JSON.stringify(info.mock.calls)).not.toContain('Kitchen');
  });
});
