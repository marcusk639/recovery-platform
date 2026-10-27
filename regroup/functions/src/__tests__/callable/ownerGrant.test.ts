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
import {
  addAdminAuthorization,
  addGuestAuthorization,
  promoteGuestsToAdmin,
} from '../../callable/auth';
import { assertMayGrantTier, houseTierOf } from '../../util/houseRoles';

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

describe('record before claims (verifier N-B): a failed claims write leaves a ranked record, never an unranked claim', () => {
  const recordAt = (uid: string) => () => mem.get(`house-roles/${H}_${uid}`);
  const OWNER = { uid: 'owner', token: {} };

  it('addAdminAuthorization and addGuestAuthorization write the record before the claims', async () => {
    as('owner');
    const seen: unknown[] = [];
    mockAddHouseRoles.mockImplementation(async (uid: string) => {
      seen.push(recordAt(uid)());
    });
    await (addAdminAuthorization as unknown as Function)({
      data: { userId: 'm', houseIds: [H], superAdmin: [] },
      auth: OWNER,
    });
    await (addGuestAuthorization as unknown as Function)({
      data: { userId: 'p', houseId: H, isAdmin: true },
      auth: OWNER,
    });
    expect(seen).toEqual([
      expect.objectContaining({ tier: 'manager' }),
      expect.objectContaining({ tier: 'peerLeader' }),
    ]);
  });

  it('promoteGuestsToAdmin writes the record before the claims', async () => {
    as('owner');
    let atClaims: unknown;
    mockSetClaims.mockImplementationOnce(async () => {
      atClaims = recordAt('r')();
    });
    await (promoteGuestsToAdmin as unknown as Function)({
      data: [{ userId: 'r', houseId: H }],
      auth: OWNER,
    });
    expect(atClaims).toMatchObject({ tier: 'peerLeader' });
  });

  it('when the claims write fails, the record stays and grants nothing on its own', async () => {
    as('owner');
    mockAddHouseRoles.mockRejectedValueOnce(new Error('claims down'));
    await expect(
      (addAdminAuthorization as unknown as Function)({
        data: { userId: 'm', houseIds: [H], superAdmin: [] },
        auth: OWNER,
      }),
    ).rejects.toMatchObject({ code: 'internal' });
    expect(recordAt('m')()).toMatchObject({ tier: 'manager' });
    // No admin claim: the record alone is no tier (util/houseRoles needs the live claim).
    await expect(houseTierOf('m', H)).resolves.toBe('none');
  });

  it('addGuestAuthorization: a failed claims write is reported as internal; the record stays and grants nothing', async () => {
    as('owner');
    mockAddHouseRoles.mockRejectedValueOnce(new Error('claims down'));
    await expect(
      (addGuestAuthorization as unknown as Function)({
        data: { userId: 'p', houseId: H, isAdmin: true },
        auth: OWNER,
      }),
    ).rejects.toMatchObject({ code: 'internal' });
    expect(recordAt('p')()).toMatchObject({ tier: 'peerLeader' });
    await expect(houseTierOf('p', H)).resolves.toBe('none');
  });

  it('promoteGuestsToAdmin with several guests: one failed claims write is reported as internal', async () => {
    as('owner');
    const restore = mockSetClaims.getMockImplementation()!;
    mockSetClaims.mockImplementation(async (uid: string, c: Record<string, unknown>) => {
      if (uid === 'r2') throw new Error('claims down');
      mockUsers[uid] = JSON.parse(JSON.stringify(c));
    });
    await expect(
      (promoteGuestsToAdmin as unknown as Function)({
        data: [
          { userId: 'r1', houseId: H },
          { userId: 'r2', houseId: H },
        ],
        auth: OWNER,
      }),
    ).rejects.toMatchObject({ code: 'internal', message: '1 of 2 promoted; retry the rest' });
    expect(recordAt('r1')()).toMatchObject({ tier: 'peerLeader' });
    expect(recordAt('r2')()).toMatchObject({ tier: 'peerLeader' });
    expect(mockSetClaims).toHaveBeenCalledWith('r1', expect.any(Object));
    expect(mockUsers.r1).toBeDefined(); // r1's claims were written
    expect(mockUsers.r2).toBeUndefined();
    mockSetClaims.mockImplementation(restore);
  });

  it('a revoke that lowers the record while the claims are written is undone by the second record write (verifier B2)', async () => {
    as('owner');
    as('m', { admin: { [H]: true } });
    mem.seed(`house-roles/${H}_m`, { houseId: H, tier: 'manager' });
    mockAddHouseRoles.mockImplementation(async (_uid: string, _h: string[], roles: string[]) => {
      // A concurrent recordRoleRevoke read M's claims (admin only) after the
      // owner record was written and lowered it back to manager.
      if (roles.includes('superAdmin'))
        mem.seed(`house-roles/${H}_m`, { houseId: H, tier: 'manager' });
    });
    await (addAdminAuthorization as unknown as Function)({
      data: { userId: 'm', houseIds: [H], superAdmin: [H] },
      auth: OWNER,
    });
    expect(recordAt('m')()).toMatchObject({ tier: 'owner' });
  });
});
