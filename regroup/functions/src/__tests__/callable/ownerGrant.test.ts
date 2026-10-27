// Ranks are strict for every grant (#145 round 6, I5): only the primary owner
// (rank 4) may make someone an owner; a superAdmin co-owner (rank 3) holds the
// owner tier but may not. Harness as in narrTiers.test.ts.
const mockSetClaims = jest.fn(async (uid: string, c: Record<string, unknown>) => {
  mockUsers[uid] = JSON.parse(JSON.stringify(c));
});
const mockAddHouseRoles = jest.fn();
// LIVE claims per account: tier checks read these (getUser), never the token.
const mockUsers: Record<string, Record<string, unknown>> = {};
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async (uid: string) => ({ uid, customClaims: mockUsers[uid] ?? {} }),
    getUserByEmail: async () => {
      throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    },
    setCustomUserClaims: (uid: string, c: Record<string, unknown>) => mockSetClaims(uid, c),
  }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (_o: unknown, h?: unknown) => (typeof _o === 'function' ? _o : h),
}));
jest.mock('../../util/residentCapacity', () => ({
  roleConsumesResidentSlot: (r: string) => r !== 'admin',
  assertResidentCapacityAvailable: jest.fn(),
  recordResidentAccepted: jest.fn(),
}));
jest.mock('../../util/entitlement', () => ({ enforceHouseEntitlement: jest.fn() }));
jest.mock('../../util/inviteEmails', () => ({ sendOneInviteEmail: jest.fn() }));
jest.mock('../../util/authGuard', () => ({ assertCanGrantClaimForHouses: jest.fn() }));
jest.mock('../../util/claims', () => ({
  createClaims: jest.fn(async () => ({})),
  deleteClaim: jest.fn(async (uid: string, houses: string[], role: string) => {
    const c = JSON.parse(JSON.stringify(mockUsers[uid] ?? {}));
    for (const h of houses) delete (c[role] ?? {})[h];
    return c;
  }),
  addHouseRoles: (...a: unknown[]) => mockAddHouseRoles(...a),
}));
jest.mock('../../util/user', () => ({
  getGuestsAsUsers: jest.fn(async (guests: Array<{ userId: string }>) =>
    guests.map((g) => ({ uid: g.userId })),
  ),
  _verifyUserEmail: jest.fn(),
}));

import { mem } from '../helpers/memFirestore';
import { addAdminAuthorization } from '../../callable/auth';
import { assertMayGrantTier } from '../../util/houseRoles';

const H = 'h';
const as = (uid: string, claims: Record<string, unknown> = {}) => {
  mockUsers[uid] = claims;
  return { uid, token: claims };
};
const makeOwner = (caller: { uid: string }, target: string) =>
  (addAdminAuthorization as unknown as Function)({
    data: { userId: target, houseIds: [H], superAdmin: [H] },
    auth: caller,
  });
const denied = { code: 'permission-denied' };

beforeEach(() => {
  for (const k of Object.keys(mockUsers)) delete mockUsers[k];
  mem.reset();
  mockSetClaims.mockClear();
  mockAddHouseRoles.mockReset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'co', houseType: 'traditional' });
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
  mem.seed(`house-roles/${H}_co`, { houseId: H, tier: 'owner', via: 'addAdminAuthorization' });
});

it('a co-owner cannot make someone an owner, even with ownerId pointing at them', async () => {
  const CO = as('co', { admin: { [H]: true }, superAdmin: { [H]: true } });
  await expect(makeOwner(CO, 'x')).rejects.toMatchObject(denied);
  expect(mockAddHouseRoles).not.toHaveBeenCalled();
  expect(mem.get(`house-roles/${H}_x`)).toBeUndefined();
  // A co-owner still makes managers.
  await expect(
    assertMayGrantTier({ callerUid: 'co', houseId: H, grant: 'manager', callableName: 't' }),
  ).resolves.toBeUndefined();
});

it('the primary owner may make someone an owner', async () => {
  const OWNER = as('owner');
  await expect(makeOwner(OWNER, 'x')).resolves.toBe(true);
  expect(mem.get(`house-roles/${H}_x`)).toMatchObject({ tier: 'owner', grantedBy: 'owner' });
});

it('with no primary owner record nobody may grant owner', async () => {
  mem.reset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'co' });
  as('co', { admin: { [H]: true }, superAdmin: { [H]: true } });
  await expect(
    assertMayGrantTier({ callerUid: 'co', houseId: H, grant: 'owner', callableName: 't' }),
  ).rejects.toMatchObject(denied);
});
