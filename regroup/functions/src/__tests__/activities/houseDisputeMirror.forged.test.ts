// src/__tests__/activities/houseDisputeMirror.forged.test.ts
//
// PR #141 review round 6 (review C1, verifier D): admins can write the legacy
// houses/{id}.disputes map, so the mirror never copies anything from it. Live
// entries are built from the activity, archives from the decision and the
// activity payload under the decision's id (written once), and legacy keys
// are only used to find entries to delete.

import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from './fakeFirestore';
import { disputeStamp } from '../../activities/disputeDecisions';
import { active, approved, disputed, mirrorHelpers } from './mirrorKit';

let db: FakeFirestore;
const { house, live, deliver, commit } = mirrorHelpers(() => db);
const T1 = Timestamp.fromDate(new Date('2026-01-15T10:00:00.000Z'));
const T2 = Timestamp.fromDate(new Date('2026-01-15T11:00:00.000Z'));
const decided = { ...approved, disputeResolvedAt: T1 };
const reopened = {
  ...decided,
  status: 'disputed',
  disputed: null,
  incomplete: null,
  disputeResult: null,
  disputeOutcome: null,
  disputeResolvedBy: null,
  disputeResolvedAt: null,
  reopenedBy: 'owner',
  reopenedAt: T2,
};
const archive = () => [...(db.collections.get('dispute-archive') ?? new Map()).entries()];

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'resident-uid' });
  db.seed('houses', 'h1', { name: 'H', disputes: {} });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

it('C1: planted legacy entries (forged, forged2) reach neither the archive nor the live list', async () => {
  commit(disputed);
  await deliver(active, disputed);
  house().disputes.forged = {
    activityId: 'a1',
    disputeStamp: disputeStamp(disputed),
    disputedBy: 'framed-uid',
    message: 'forged text',
  };
  commit(decided);
  await deliver(disputed, decided);
  expect(archive().map(([id, a]) => [id, a.disputedBy, a.message, a.resolutionMessage])).toEqual([
    [`a1_decided_${T1.toMillis()}`, 'peer-uid', 'Kitchen not cleaned', 'approved'],
  ]);
  expect(house().disputes.forged).toBeUndefined();

  house().disputes.forged2 = {
    activityId: 'a1',
    message: 'Kitchen not cleaned',
    disputedBy: 'framed-uid',
    challenges: [{ challenger: 'x', message: 'fake' }],
  };
  db.seed('activities/a1/dispute-decisions', `decided_${T1.toMillis()}`, {
    event: 'approved',
    disputedBy: 'peer-uid',
  });
  commit(reopened);
  await deliver(decided, reopened);
  expect(
    Object.entries(live()!.disputes).map(([k, e]: any) => [k, e.disputedBy, e.challenges]),
  ).toEqual([['a1', 'peer-uid', []]]);
  expect(house().disputes.forged2).toBeUndefined();
  expect(house().disputes.a1).toMatchObject({ disputedBy: 'peer-uid' });
});

it('D: a planted entry carrying the archived stamp cannot overwrite the legitimate archive', async () => {
  commit(disputed);
  await deliver(active, disputed);
  commit(decided);
  await deliver(disputed, decided);
  const legit = archive();
  house().disputes.a1 = {
    activityId: 'a1',
    disputeStamp: `x_decided_${T1.toMillis()}`,
    message: 'FORGED',
    disputedBy: 'victim',
  };
  house().disputes.Zinj = {
    activityId: 'a1',
    message: 'INJECTED',
    disputedBy: 'victim',
    guestId: 'gP',
  };
  commit(reopened);
  await deliver(decided, reopened);
  // Redelivering the close (as a retry would) cannot rewrite it either.
  await deliver(disputed, decided);
  expect(archive()).toEqual(legit);
  expect(Object.keys(live()!.disputes)).toEqual(['a1']);
  expect(live()!.disputes.a1.message).toBe('Kitchen not cleaned');
  expect(house().disputes.Zinj).toBeUndefined();
});

it('an archive is written once; a redelivery that disagrees is logged as a conflict, not written', async () => {
  const warn = jest.spyOn(logger, 'warn');
  db.seed('dispute-archive', `a1_decided_${T1.toMillis()}`, {
    resolutionMessage: 'rejected',
    resolvedBy: 'someone',
  });
  commit(decided);
  await deliver(disputed, decided);
  expect(archive()[0][1]).toEqual({ resolutionMessage: 'rejected', resolvedBy: 'someone' });
  expect(JSON.stringify(warn.mock.calls)).toContain('dispute_archive.conflict');
});

it("an older build's batch overwriting house.disputes with uuid keys does not change the live entry", async () => {
  commit(disputed);
  await deliver(active, disputed);
  const entry = live()!.disputes.a1;
  // main's old-build resolve batch: the whole map, uuid-keyed, as the app saw it.
  house().disputes = {
    '0b7c-uuid': { id: '0b7c-uuid', activityId: 'a1', status: 'resolved', message: 'x' },
  };
  expect(live()!.disputes.a1).toBe(entry);
  commit(decided);
  await deliver(disputed, decided);
  expect(live()!.disputes).toEqual({});
  expect(archive().map(([, a]) => a.disputedBy)).toEqual(['peer-uid']);
});
