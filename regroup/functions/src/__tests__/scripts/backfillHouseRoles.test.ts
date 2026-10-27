// Backfill of house-roles records for existing staff-claim holders
// (scripts/backfillHouseRoles). In-memory Firestore and a fake Auth;
// scriptBootstrap is stubbed so importing is inert.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { backfillHouseRoles } from '../../scripts/backfillHouseRoles';

const H = 'h';
const users = [
  { uid: 'owner', customClaims: { admin: { [H]: true }, superAdmin: { [H]: true } } },
  { uid: 'op2', customClaims: { admin: [H] } }, // legacy array shape
  { uid: 'peer', customClaims: { admin: { [H]: true }, guest: { [H]: true } } },
  { uid: 'exPeer', customClaims: { admin: { [H]: true } } },
  { uid: 'resident', customClaims: { guest: { [H]: true } } },
];
// Two pages, to cover paging.
const authClient = {
  listUsers: jest.fn(async (_max: number, token?: string) =>
    token ? { users: users.slice(3) } : { users: users.slice(0, 3), pageToken: 'p2' },
  ),
};

beforeEach(() => {
  mem.reset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner' });
  mem.seed('guests/peer-doc', { houseId: H, userId: 'peer', status: 'active', isAdmin: true });
  mem.seed('guests/ex-doc', { houseId: H, userId: 'exPeer', status: 'discharged', isAdmin: true });
});

it('classifies staff-claim holders; residents get no record', async () => {
  const report = await backfillHouseRoles(memDb, authClient, { apply: false });
  const tiers = Object.fromEntries(report.toWrite.map((r) => [r.uid, r.tier]));
  expect(tiers).toEqual({ owner: 'owner', op2: 'manager', peer: 'peerLeader', exPeer: 'manager' });
  // A manager with another guest doc in the house is listed for review.
  expect(report.ambiguous.map((r) => r.uid)).toEqual(['exPeer']);
});

it('dry run writes nothing; apply writes once and never overwrites', async () => {
  await backfillHouseRoles(memDb, authClient, { apply: false });
  expect(mem.get(`house-roles/${H}_peer`)).toBeUndefined();

  mem.seed(`house-roles/${H}_op2`, { tier: 'peerLeader', via: 'invitation' });
  const first = await backfillHouseRoles(memDb, authClient, { apply: true });
  expect(first.existing).toBe(1);
  expect(mem.get(`house-roles/${H}_peer`)).toMatchObject({ tier: 'peerLeader', via: 'backfill' });
  expect(mem.get(`house-roles/${H}_op2`)).toMatchObject({ tier: 'peerLeader', via: 'invitation' });

  const second = await backfillHouseRoles(memDb, authClient, { apply: true });
  expect(second.toWrite).toEqual([]);
});
