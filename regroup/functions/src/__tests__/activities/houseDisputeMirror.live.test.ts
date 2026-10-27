// src/__tests__/activities/houseDisputeMirror.live.test.ts
//
// PR #141 review round 5: house-disputes/{houseId} is the authoritative live
// list (server-only); houses/{id}.disputes is a legacy display mirror that
// admins can rewrite. An activity id that cannot be a map key still gets its
// decision logged and archived. The decision log never rewrites an entry,
// and logs a conflicting one. A reopened older-build dispute gets its
// disputer back.

import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { mirrorHouseDispute } from '../../activities/houseDisputeMirror';
import { disputeStamp } from '../../activities/disputeDecisions';
import { NOW, active, approved, disputed, mirrorHelpers } from './mirrorKit';

let db: FakeFirestore;
const { house, live, archives, deliver, commit } = mirrorHelpers(() => db);
const T1 = Timestamp.fromDate(new Date('2026-01-15T10:00:00.000Z'));
const T2 = Timestamp.fromDate(new Date('2026-01-15T11:00:00.000Z'));
const decisions = (id = 'a1') => [
  ...(db.collections.get(`activities/${id}/dispute-decisions`) ?? new Map()).entries(),
];

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'resident-uid' });
  db.seed('houses', 'h1', { name: 'H', disputes: {} });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('the live list, house-disputes/{houseId}', () => {
  it('holds the open dispute, mirrored into the legacy houses/{id}.disputes', async () => {
    commit(disputed);
    await deliver(active, disputed);
    expect(live()).toMatchObject({
      houseId: 'h1',
      disputes: { a1: { status: 'pending', disputedBy: 'peer-uid' } },
    });
    expect(house().disputes.a1).toEqual(live()!.disputes.a1);

    commit({ ...approved, disputeResolvedAt: T1 });
    await deliver(disputed, { ...approved, disputeResolvedAt: T1 });
    expect(live()!.disputes).toEqual({});
    expect(house().disputes).toEqual({});
  });

  it('is unaffected by an admin deleting the legacy entry: the close still archives it', async () => {
    commit(disputed);
    await deliver(active, disputed);
    house().disputes = {}; // an admin's whole-house save drops it
    commit({ ...approved, disputeResolvedAt: T1 });
    await deliver(disputed, { ...approved, disputeResolvedAt: T1 });
    expect(archives().map(([, a]) => [a.resolutionMessage, a.disputedBy])).toEqual([
      ['approved', 'peer-uid'],
    ]);
    expect(live()!.disputes).toEqual({});
  });

  it('copies an entry that only the legacy map has (opened before the live list) into it', async () => {
    house().disputes = {
      a1: { id: 'a1', activityId: 'a1', status: 'pending', disputeStamp: disputeStamp(disputed) },
    };
    commit(disputed);
    await deliver(active, disputed);
    expect(live()!.disputes.a1).toMatchObject({
      status: 'pending',
      disputeStamp: disputeStamp(disputed),
    });
  });
});

describe('an activity id that cannot be a map key', () => {
  it('BREAK 3: still logs and archives its decision, leaves both lists alone, and says so', async () => {
    const warn = jest.spyOn(logger, 'warn');
    db.seed('activities', 'ev.il', { ...approved, disputeResolvedAt: T1 });
    const r = await mirrorHouseDispute(
      asFirestore(db),
      'ev.il',
      disputed,
      { ...approved, disputeResolvedAt: T1 },
      { now: NOW },
    );
    expect(r.logged).toBe(1);
    expect(decisions('ev.il').map(([id]) => id)).toEqual([`decided_${T1.toMillis()}`]);
    const archived = [...(db.collections.get('disputes') ?? new Map()).entries()];
    expect(archived).toHaveLength(1);
    expect(archived[0][0].startsWith('ev.il_')).toBe(true);
    expect(house().disputes).toEqual({});
    expect(JSON.stringify(warn.mock.calls)).toContain('dispute_mirror.unsafe_activity_id');
  });
});

describe('the decision log', () => {
  it('never rewrites an entry, and warns (ids only) when a redelivery disagrees with it', async () => {
    const warn = jest.spyOn(logger, 'warn');
    const key = `decided_${T1.toMillis()}`;
    db.seed('activities/a1/dispute-decisions', key, { event: 'rejected', disputeStamp: 'other' });
    commit({ ...approved, disputeResolvedAt: T1 });
    expect((await deliver(disputed, { ...approved, disputeResolvedAt: T1 })).logged).toBe(0);
    expect(decisions()[0][1]).toEqual({ event: 'rejected', disputeStamp: 'other' });
    expect(JSON.stringify(warn.mock.calls)).toContain('dispute_decisions.conflict');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Kitchen');
  });
});

describe("reopening an older build's dispute (no disputedBy)", () => {
  it('S4: gets its disputer back from the decision log, onto the activity, with the same stamp', async () => {
    const { disputedBy: _d, ...oldPending } = { ...disputed, disputeResolvedBy: 'peer-uid' };
    commit(oldPending);
    await deliver(active, oldPending);
    const stamp = live()!.disputes.a1.disputeStamp;
    const decided = {
      ...oldPending,
      status: 'resolved',
      disputeResolvedBy: 'mgr',
      disputeResolvedAt: T1,
    };
    commit(decided);
    await deliver(oldPending, decided);
    expect(decisions()[0][1]).toMatchObject({ event: 'kept', disputedBy: 'peer-uid' });

    const reopened = {
      ...decided,
      status: 'disputed',
      disputeResolvedBy: null,
      disputeResolvedAt: null,
      reopenedBy: 'owner',
      reopenedAt: T2,
    };
    commit(reopened);
    await deliver(decided, reopened);
    expect(db.read('activities', 'a1')!.disputedBy).toBe('peer-uid');
    expect(live()!.disputes.a1).toMatchObject({
      disputedBy: 'peer-uid',
      disputeStamp: stamp,
      status: 'pending',
    });
    expect(decisions().find(([id]) => id.startsWith('reopened_'))![1]).toMatchObject({
      disputedBy: 'peer-uid',
      disputeStamp: stamp,
    });
  });
});
