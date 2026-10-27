// House tiers (util/houseRoles) end to end on an in-memory store: tiers come
// only from house-roles records (the owner: the primary record) and live
// claims, never guest docs, admins docs, ownerId or houseType. Claim writes
// land in mockUsers, so revokes re-derive records from the claims left.
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
jest.mock('../../api/firestore', () => ({ getHouse: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { createInvitation } from '../../callable/invitations';
import {
  addAdminAuthorization,
  addGuestAuthorization,
  deleteAdminAuthorization,
  promoteGuestsToAdmin,
  removePrivilegesForGuests,
} from '../../callable/auth';
import { houseTierOf } from '../../util/houseRoles';

const H = 'h';
type Caller = { uid: string; token: Record<string, unknown> };
const as = (uid: string, claims: Record<string, unknown> = {}): Caller => {
  mockUsers[uid] = claims;
  return { uid, token: claims };
};
const OWNER = as('owner');
const MANAGER = as('manager', { admin: { [H]: true } });
const PEER = as('peer', { admin: { [H]: true }, guest: { [H]: true } });
const invite = (caller: Caller, role: string) =>
  (createInvitation as unknown as Function)({
    data: { email: 'new@x.com', houseId: H, role },
    auth: caller,
  });
const run = (fn: unknown, data: unknown, caller: Caller) =>
  (fn as Function)({ data, auth: caller });
const denied = { code: 'permission-denied' };
const roleOf = (uid: string) => mem.get(`house-roles/${H}_${uid}`) as any;
const tier = (c: Caller) => houseTierOf(c.uid, H);

let baseline: string | undefined;
beforeEach(() => {
  // Every test starts from the claims registered by as() at load time.
  baseline = baseline ?? JSON.stringify(mockUsers);
  for (const k of Object.keys(mockUsers)) delete mockUsers[k];
  Object.assign(mockUsers, JSON.parse(baseline));
  mem.reset();
  mockSetClaims.mockClear();
  mockAddHouseRoles.mockReset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'traditional' });
  // The owner is the server-only primary owner record (createHouses / backfill).
  mem.seed(`house-roles/${H}_owner`, { houseId: H, tier: 'owner', primary: true });
  mem.seed(`house-roles/${H}_manager`, { tier: 'manager', via: 'invitation' });
  mem.seed(`house-roles/${H}_peer`, { tier: 'peerLeader', via: 'invitation' });
  mem.seed('guests/peer-doc', { houseId: H, userId: 'peer', status: 'active' });
  mem.seed('guests/res-doc', { houseId: H, userId: 'resident', status: 'active' });
});

describe('createInvitation', () => {
  it.each([
    ['owner', OWNER, ['admin', 'senior-peer', 'guest'], []],
    ['manager', MANAGER, ['senior-peer', 'guest'], ['admin']],
    ['peer leader', PEER, ['guest'], ['admin', 'senior-peer']],
  ])('%s may invite only their tier', async (_label, caller, allowed, refused) => {
    for (const role of allowed) await expect(invite(caller, role)).resolves.toHaveProperty('token');
    for (const role of refused) await expect(invite(caller, role)).rejects.toMatchObject(denied);
  });

  it('an admin-claim holder with no role record is a peer leader (least privilege)', async () => {
    const legacy = as('legacy', { admin: { [H]: true } });
    await expect(tier(legacy)).resolves.toBe('peerLeader');
    await expect(invite(legacy, 'senior-peer')).rejects.toMatchObject(denied);
    await expect(invite(legacy, 'guest')).resolves.toHaveProperty('token');
  });

  it('Oxford houses apply the same tiers (no "any admin may invite anyone")', async () => {
    mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'oxford' });
    await expect(invite(PEER, 'admin')).rejects.toMatchObject(denied);
    await expect(invite(PEER, 'senior-peer')).rejects.toMatchObject(denied);
  });
});

describe('a peer leader cannot change their own tier through client data (probes C1, B1-B3)', () => {
  it.each([
    [
      'marks their resident doc inactive',
      async () => mem.seed('guests/peer-doc', { houseId: H, userId: 'peer', status: 'inactive' }),
    ],
    [
      'rewrites the userId on their resident doc',
      async () =>
        mem.seed('guests/peer-doc', { houseId: H, userId: 'someone-else', status: 'active' }),
    ],
    ['deletes their resident doc', () => memDb.doc('guests/peer-doc').delete()],
    [
      'writes an admins doc listing the house',
      async () => mem.seed('admins/peer', { userId: 'peer', houseIds: [H], superAdmin: [] }),
    ],
    [
      'flips the house to Oxford',
      async () => mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'oxford' }),
    ],
  ])('still a peer leader after it %s', async (_label, act) => {
    await act();
    await expect(tier(PEER)).resolves.toBe('peerLeader');
    await expect(invite(PEER, 'senior-peer')).rejects.toMatchObject(denied);
    await expect(invite(PEER, 'admin')).rejects.toMatchObject(denied);
  });

  it("removing a peer leader's guest claim does not change the tier", async () => {
    await run(
      removePrivilegesForGuests,
      { guests: [{ userId: 'peer', houseId: H }], role: 'guest' },
      OWNER,
    );
    expect(roleOf('peer').tier).toBe('peerLeader');
  });
});

describe('every grant path records the tier', () => {
  it('the owner is the primary owner record, not houses.ownerId (review I3)', async () => {
    // A superAdmin co-owner rewrites ownerId to themselves (allowed by the
    // rules until #145's rules deploy).
    const CO2 = as('co2', { admin: { [H]: true }, superAdmin: { [H]: true } });
    mem.seed(`houses/${H}`, { id: H, ownerId: 'co2', houseType: 'traditional' });
    await expect(houseTierOf('owner', H)).resolves.toBe('owner');
    // The co-owner still cannot remove the real owner.
    await expect(
      run(
        deleteAdminAuthorization,
        { admin: { userId: 'owner' }, adminHouseIds: [H], superAdminHouseIds: [H] },
        CO2,
      ),
    ).rejects.toMatchObject(denied);
  });

  it('addAdminAuthorization by the owner makes a manager (or owner for superAdmin); nobody else may', async () => {
    await expect(
      run(addAdminAuthorization, { userId: 'm2', houseIds: [H], superAdmin: [] }, OWNER),
    ).resolves.toBe(true);
    expect(roleOf('m2')).toMatchObject({
      tier: 'manager',
      grantedBy: 'owner',
      via: 'addAdminAuthorization',
    });
    await expect(
      run(addAdminAuthorization, { userId: 'o2', houseIds: [H], superAdmin: [H] }, OWNER),
    ).resolves.toBe(true);
    expect(roleOf('o2').tier).toBe('owner');
    for (const c of [MANAGER, PEER]) {
      await expect(
        run(addAdminAuthorization, { userId: 'resident', houseIds: [H], superAdmin: [] }, c),
      ).rejects.toMatchObject(denied);
    }
    expect(roleOf('resident')).toBeUndefined();
  });

  it('promoteGuestsToAdmin makes a peer leader; owner or manager only', async () => {
    const promote = (c: Caller) =>
      run(promoteGuestsToAdmin, [{ userId: 'resident', houseId: H }], c);
    await expect(promote(PEER)).rejects.toMatchObject(denied);
    expect(mockSetClaims).not.toHaveBeenCalled();
    await expect(promote(MANAGER)).resolves.toBe('success');
    expect(roleOf('resident')).toMatchObject({ tier: 'peerLeader', via: 'promoteGuestsToAdmin' });
  });

  it('addGuestAuthorization with isAdmin needs a manager or above and makes a peer leader', async () => {
    const grant = (c: Caller) =>
      run(addGuestAuthorization, { userId: 'new', houseId: H, isAdmin: true }, c);
    await expect(grant(PEER)).rejects.toMatchObject(denied);
    expect(mockAddHouseRoles).not.toHaveBeenCalled();
    await expect(grant(MANAGER)).resolves.toBe(true);
    expect(mockAddHouseRoles).toHaveBeenCalledWith('new', [H], ['guest', 'admin']);
    expect(roleOf('new')).toMatchObject({ tier: 'peerLeader', via: 'addGuestAuthorization' });
  });

  it('a grant never lowers a stored tier', async () => {
    await run(addGuestAuthorization, { userId: 'manager', houseId: H, isAdmin: false }, OWNER);
    expect(roleOf('manager').tier).toBe('manager');
  });
});

describe('revocations update the record', () => {
  it('removing admin: a manager loses the record, a peer leader becomes a resident', async () => {
    await run(
      deleteAdminAuthorization,
      { admin: { userId: 'manager' }, adminHouseIds: [H], superAdminHouseIds: [] },
      OWNER,
    );
    expect(roleOf('manager')).toBeUndefined();
    await run(
      removePrivilegesForGuests,
      { guests: [{ userId: 'peer', houseId: H }], role: 'admin' },
      OWNER,
    );
    expect(roleOf('peer').tier).toBe('resident');
  });

  it('removing owner access leaves a manager', async () => {
    mem.seed(`house-roles/${H}_o2`, { tier: 'owner', via: 'addAdminAuthorization' });
    mockUsers.o2 = { admin: { [H]: true }, superAdmin: { [H]: true } };
    await run(
      deleteAdminAuthorization,
      { admin: { userId: 'o2' }, adminHouseIds: [], superAdminHouseIds: [H] },
      OWNER,
    );
    expect(roleOf('o2').tier).toBe('manager');
  });
});

describe('removals need a tier strictly above the target (verifier V2)', () => {
  const removeAdmin = (c: Caller, userId: string, superAdmin: string[] = []) =>
    run(
      deleteAdminAuthorization,
      { admin: { userId }, adminHouseIds: [H], superAdminHouseIds: superAdmin },
      c,
    );
  const removeRole = (c: Caller, userId: string, role: string) =>
    run(removePrivilegesForGuests, { guests: [{ userId, houseId: H }], role }, c);
  const CO = as('co', { admin: { [H]: true }, superAdmin: { [H]: true } });
  as('owner', { admin: { [H]: true }, superAdmin: { [H]: true } });
  as('resident', { guest: { [H]: true } });

  it('a peer leader removes no manager and does not touch the owner', async () => {
    await expect(removeRole(PEER, 'manager', 'admin')).rejects.toMatchObject(denied);
    await expect(removeAdmin(PEER, 'owner', [H])).rejects.toMatchObject(denied);
    expect(roleOf('manager').tier).toBe('manager');
  });

  it('only an owner removes a manager; a manager may remove a peer leader', async () => {
    await expect(
      removeAdmin(as('manager2', { admin: { [H]: true } }), 'manager'),
    ).rejects.toMatchObject(denied);
    await expect(removeAdmin(MANAGER, 'peer')).resolves.toBeUndefined();
    await expect(removeAdmin(OWNER, 'manager')).resolves.toBeUndefined();
  });

  it('the primary owner can be demoted only by themselves, not by a superAdmin co-owner', async () => {
    await expect(removeAdmin(CO, 'owner', [H])).rejects.toMatchObject(denied);
    await expect(removeAdmin(OWNER, 'owner', [H])).resolves.toBeUndefined();
  });

  it("removing a resident's guest claim needs any staff above them; a resident cannot", async () => {
    await expect(removeRole(PEER, 'resident', 'guest')).resolves.toBe('success');
    await expect(
      removeRole(as('r2', { guest: { [H]: true } }), 'resident', 'guest'),
    ).rejects.toMatchObject(denied);
  });

  it("a just-revoked staff member's token cannot act: the live claims decide", async () => {
    const stale = { uid: 'peer', token: { admin: { [H]: true }, superAdmin: { [H]: true } } };
    await expect(removeRole(stale, 'manager', 'admin')).rejects.toMatchObject(denied);
  });
});
