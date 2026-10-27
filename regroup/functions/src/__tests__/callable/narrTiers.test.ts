// House tiers (util/houseRoles), end to end on an in-memory store. A tier
// comes ONLY from the server-only house-roles/{houseId}_{uid} record plus
// ownerId / the superAdmin claim. Guest docs, admins docs and houseType are
// never read, so no client write can raise or keep a tier.
//   owner -> owner, manager, peer leader, resident
//   manager -> peer leader, resident
//   peer leader -> resident only (also: an admin-claim holder with no record)
const mockSetClaims = jest.fn();
const mockAddHouseRoles = jest.fn();
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({ setCustomUserClaims: (...a: unknown[]) => mockSetClaims(...a) }),
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
  deleteClaim: jest.fn(async () => ({})),
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
import { houseTierOf, recordOwnerRoles } from '../../util/houseRoles';

const H = 'h';
type Caller = { uid: string; token: Record<string, unknown> };
const as = (uid: string, claims: Record<string, unknown> = {}): Caller => ({ uid, token: claims });
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
const tier = (c: Caller) => houseTierOf(c.uid, c.token, H, { ownerId: 'owner' });

beforeEach(() => {
  mem.reset();
  mockSetClaims.mockReset();
  mockAddHouseRoles.mockReset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'traditional' });
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
  it('createHouses / finishOperatorSetup record the owner', async () => {
    await recordOwnerRoles('op', [H], 'createHouses');
    expect(roleOf('op')).toMatchObject({ tier: 'owner', grantedBy: 'op', via: 'createHouses' });
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
    await recordOwnerRoles('o2', [H], 'createHouses');
    await run(
      deleteAdminAuthorization,
      { admin: { userId: 'o2' }, adminHouseIds: [], superAdminHouseIds: [H] },
      OWNER,
    );
    expect(roleOf('o2').tier).toBe('manager');
  });
});
