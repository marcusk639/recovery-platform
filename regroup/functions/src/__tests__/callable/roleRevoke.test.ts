// A revoke re-derives the role record from the account's live claims
// (util/houseRoleStore recordRoleRevoke): it reflects the highest claim left.
const users: Record<string, Record<string, unknown>> = {};
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({ getUser: async (uid: string) => ({ uid, customClaims: users[uid] ?? {} }) }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { mem } from '../helpers/memFirestore';
import { recordRoleRevoke } from '../../util/houseRoles';

const H = 'h';
const record = (uid: string) => mem.get(`house-roles/${H}_${uid}`) as any;

beforeEach(() => mem.reset());

it("removing only a co-owner's admin claim keeps the owner record while superAdmin remains (X3)", async () => {
  mem.seed(`house-roles/${H}_co`, { houseId: H, tier: 'owner' });
  users.co = { superAdmin: { [H]: true }, admin: {} };
  await recordRoleRevoke(H, 'co', 'admin');
  expect(record('co').tier).toBe('owner');
});

it('lowers to the highest claim left, and removes the record when none is left', async () => {
  mem.seed(`house-roles/${H}_co`, { houseId: H, tier: 'owner' });
  users.co = { admin: { [H]: true } };
  await recordRoleRevoke(H, 'co', 'superAdmin');
  expect(record('co').tier).toBe('manager');

  mem.seed(`house-roles/${H}_pl`, { houseId: H, tier: 'peerLeader' });
  users.pl = { guest: { [H]: true } };
  await recordRoleRevoke(H, 'pl', 'admin');
  expect(record('pl').tier).toBe('resident');

  users.pl = {};
  await recordRoleRevoke(H, 'pl', 'guest');
  expect(record('pl')).toBeUndefined();
});

it('never lowers the primary owner record', async () => {
  mem.seed(`house-roles/${H}_own`, { houseId: H, tier: 'owner', primary: true });
  users.own = {};
  await recordRoleRevoke(H, 'own', 'superAdmin');
  expect(record('own')).toMatchObject({ tier: 'owner', primary: true });
});
