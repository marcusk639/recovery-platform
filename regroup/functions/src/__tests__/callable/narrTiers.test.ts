// NARR invitation and promotion tiers (util/houseRoles), end to end on an
// in-memory store. "Is a resident" comes from server state: an active guest
// doc of that account in the house.
//   owner -> manager, peer leader, resident
//   manager (admin claim, not a resident) -> peer leader, resident
//   peer leader (admin claim, a resident) -> resident only
const mockSetClaims = jest.fn();
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
  deleteClaim: jest.fn(),
}));
jest.mock('../../util/user', () => ({
  getGuestsAsUsers: jest.fn(async (guests: Array<{ userId: string }>) =>
    guests.map((g) => ({ uid: g.userId })),
  ),
  _verifyUserEmail: jest.fn(),
}));
jest.mock('../../api/firestore', () => ({ getHouse: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { createInvitation } from '../../callable/invitations';
import { addAdminAuthorization, promoteGuestsToAdmin } from '../../callable/auth';

const H = 'h';
const as = (uid: string, claims: Record<string, unknown> = {}) => ({ uid, token: claims });
const OWNER = as('owner');
const MANAGER = as('manager', { admin: { [H]: true } });
const PEER = as('peer', { admin: { [H]: true } });
const invite = (caller: { uid: string; token: unknown }, role: string) =>
  (createInvitation as unknown as Function)({
    data: { email: 'new@x.com', houseId: H, role },
    auth: caller,
  });
const denied = { code: 'permission-denied' };

beforeEach(() => {
  mem.reset();
  mockSetClaims.mockReset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'traditional' });
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

  it('a former peer leader whose resident doc is discharged counts as a manager-tier admin', async () => {
    mem.seed('guests/peer-doc', { houseId: H, userId: 'peer', status: 'discharged' });
    await expect(invite(PEER, 'senior-peer')).resolves.toHaveProperty('token');
  });

  it("a resident field on the inviter's own client data cannot raise the tier", async () => {
    // Server state says "resident" (active guest doc); no client field is read.
    await expect(
      invite(as('peer', { admin: { [H]: true }, resident: false }), 'admin'),
    ).rejects.toMatchObject(denied);
  });

  it('Oxford houses keep their current behaviour for now', async () => {
    mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'oxford' });
    await expect(invite(PEER, 'admin')).resolves.toHaveProperty('token');
  });
});

describe('promoteGuestsToAdmin', () => {
  const promote = (caller: { uid: string; token: unknown }) =>
    (promoteGuestsToAdmin as unknown as Function)({
      data: [{ userId: 'resident', houseId: H, isAdmin: false }],
      auth: caller,
    });

  it('the owner or a manager may make a resident a peer leader', async () => {
    await expect(promote(OWNER)).resolves.toBe('success');
    await expect(promote(MANAGER)).resolves.toBe('success');
  });

  it('a peer leader may not promote anyone', async () => {
    await expect(promote(PEER)).rejects.toMatchObject(denied);
    expect(mockSetClaims).not.toHaveBeenCalled();
  });

  it('promoting someone who is not a resident here (a manager) is owner-only', async () => {
    const promoteOutsider = (caller: { uid: string; token: unknown }) =>
      (promoteGuestsToAdmin as unknown as Function)({
        data: [{ userId: 'outsider', houseId: H, isAdmin: false }],
        auth: caller,
      });
    await expect(promoteOutsider(MANAGER)).rejects.toMatchObject(denied);
    await expect(promoteOutsider(OWNER)).resolves.toBe('success');
  });
});

describe('addAdminAuthorization', () => {
  const grant = (
    caller: { uid: string; token: unknown },
    userId: string,
    superAdmin: string[] = [],
  ) =>
    (addAdminAuthorization as unknown as Function)({
      data: { userId, houseIds: [H], superAdmin },
      auth: caller,
    });

  it('only the owner may make a manager', async () => {
    await expect(grant(OWNER, 'outsider')).resolves.toBe(true);
    await expect(grant(MANAGER, 'outsider')).rejects.toMatchObject(denied);
    await expect(grant(PEER, 'outsider')).rejects.toMatchObject(denied);
  });

  it('a manager may make a resident a peer leader; a peer leader may not', async () => {
    await expect(grant(MANAGER, 'resident')).resolves.toBe(true);
    await expect(grant(PEER, 'resident')).rejects.toMatchObject(denied);
  });

  it('owner (superAdmin) access is owner-only', async () => {
    await expect(grant(MANAGER, 'resident', [H])).rejects.toMatchObject(denied);
    await expect(grant(OWNER, 'outsider', [H])).resolves.toBe(true);
  });
});
