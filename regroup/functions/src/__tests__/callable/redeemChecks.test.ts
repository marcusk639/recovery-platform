// Invitation checks from the third #145 review round, on an in-memory store:
//   B1 / I1  invitations redeemed before #145 (no grantPending) never regrant;
//   B3       no self-invites, no invitation to someone already living here,
//            and a used admission ticket is never overwritten;
//   item 4   the inviter must still rank high enough when the invitee redeems;
//   I4       a stranded redeem re-checks capacity and records occupancy.
const users: Record<string, Record<string, unknown>> = {};
const emails: Record<string, string> = {};
const mockSetClaims = jest.fn(async (uid: string, c: Record<string, unknown>) => {
  users[uid] = JSON.parse(JSON.stringify(c));
});
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async (uid: string) => ({ uid, customClaims: users[uid] ?? {} }),
    getUserByEmail: async (email: string) => {
      if (!(email in emails))
        throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      return { uid: emails[email] };
    },
    setCustomUserClaims: (uid: string, c: Record<string, unknown>) => mockSetClaims(uid, c),
  }),
}));
jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (_o: unknown, h?: unknown) => (typeof _o === 'function' ? _o : h),
}));
const mockCapacity = jest.fn();
const mockRecordAccepted = jest.fn();
jest.mock('../../util/residentCapacity', () => ({
  roleConsumesResidentSlot: (r: string) => r !== 'admin',
  assertResidentCapacityAvailable: (...a: unknown[]) => mockCapacity(...a),
  recordResidentAccepted: (...a: unknown[]) => mockRecordAccepted(...a),
}));
jest.mock('../../util/entitlement', () => ({ enforceHouseEntitlement: jest.fn() }));
jest.mock('../../api/firestore', () => ({ getHouse: jest.fn(async () => ({ ownerId: 'owner' })) }));
jest.mock('../../util/inviteEmails', () => ({ sendOneInviteEmail: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { createInvitation, redeemInvitation } from '../../callable/invitations';

const H = 'h';
const call = (fn: unknown, data: unknown, uid: string, email: string) =>
  (fn as Function)({ data, auth: { uid, token: { email, ...(users[uid] ?? {}) } } });
const redeem = (token: string, uid = 'alice', email = 'alice@x.com') =>
  call(redeemInvitation, { token }, uid, email);
const invitation = (role: string, extra: Record<string, unknown> = {}) => ({
  token: 'T',
  inviterUid: 'owner',
  houseId: H,
  role,
  invitedEmail: 'alice@x.com',
  expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  createdAt: new Date().toISOString(),
  ...extra,
});
const failed = { code: 'failed-precondition' };

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(users)) delete users[k];
  for (const k of Object.keys(emails)) delete emails[k];
  mockSetClaims.mockClear();
  mockCapacity.mockReset();
  mockRecordAccepted.mockReset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner' });
  mem.seed(`house-roles/${H}_owner`, { tier: 'owner', primary: true });
});

describe('invitations redeemed before #145 never regrant (B1 / I1)', () => {
  // Redeemed by the pre-#145 code: redeemedAt + redeemedByUid, no grantPending.
  const mainEra = (role: string) =>
    mem.seed(
      'invitations/T',
      invitation(role, {
        redeemedAt: new Date(Date.now() - 86400_000).toISOString(),
        redeemedByUid: 'alice',
      }),
    );

  it('a manager demoted since cannot get the role back by re-redeeming', async () => {
    mainEra('admin');
    users.alice = {}; // the owner removed the admin claim
    await expect(redeem('T')).resolves.toEqual({ houseId: H, role: 'admin' });
    expect(mockSetClaims).not.toHaveBeenCalled();
    expect(mem.get(`house-roles/${H}_alice`)).toBeUndefined();
  });

  it('a discharged resident cannot get the guest claim or a fresh ticket back', async () => {
    mainEra('guest');
    users.alice = { guest: {} };
    await redeem('T');
    expect(mockSetClaims).not.toHaveBeenCalled();
    expect(mem.get(`admission-tickets/alice_${H}`)).toBeUndefined();
  });
});

describe('no self-invites; nobody who already lives here (B3)', () => {
  const invite = (uid: string, email: string, to: string, role = 'guest') =>
    call(createInvitation, { email: to, houseId: H, role }, uid, email);

  it('a peer leader cannot invite their own email (any case or spacing)', async () => {
    users.pl = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed(`house-roles/${H}_pl`, { tier: 'peerLeader' });
    await expect(invite('pl', 'pl@x.com', 'PL@X.com')).rejects.toMatchObject(failed);
  });

  it('nobody can invite an account that already has an active record in the house', async () => {
    emails['res@x.com'] = 'res';
    mem.seed('guests/res-doc', { houseId: H, userId: 'res', status: 'active' });
    await expect(invite('owner', 'owner@x.com', 'res@x.com')).rejects.toMatchObject(failed);
    // A discharged record does not block a new invitation.
    mem.seed('guests/res-doc', { houseId: H, userId: 'res', status: 'discharged' });
    await expect(invite('owner', 'owner@x.com', 'res@x.com')).resolves.toHaveProperty('token');
  });

  it('a redeem never overwrites a used ticket: refused with a clear error', async () => {
    mem.seed(`admission-tickets/alice_${H}`, { used: true, usedByGuestId: 'g0', role: 'guest' });
    mem.seed('invitations/T', invitation('guest'));
    await expect(redeem('T')).rejects.toMatchObject(failed);
    expect(mem.get(`admission-tickets/alice_${H}`)).toMatchObject({
      used: true,
      usedByGuestId: 'g0',
    });
    expect(mem.get('invitations/T')?.redeemedAt).toBeUndefined();
    expect(mockSetClaims).not.toHaveBeenCalled();
  });
});

describe('the inviter must still rank high enough at redeem time (item 4)', () => {
  it('a senior-peer invitation from a manager demoted since is refused', async () => {
    users.mgr = { admin: { [H]: true } }; // record gone: now a peer leader at most
    mem.seed('invitations/T', invitation('senior-peer', { inviterUid: 'mgr' }));
    await expect(redeem('T')).rejects.toMatchObject(failed);
    expect(mockSetClaims).not.toHaveBeenCalled();
  });

  it("the owner's admin invitation promotes an existing peer leader record to manager", async () => {
    users.alice = { admin: { [H]: true } };
    mem.seed(`house-roles/${H}_alice`, { tier: 'peerLeader', via: 'backfill' });
    mem.seed('invitations/T', invitation('admin'));
    await redeem('T');
    expect(mem.get(`house-roles/${H}_alice`)).toMatchObject({ tier: 'manager', via: 'invitation' });
  });
});

it('a stranded redeem re-checks capacity and records occupancy (I4)', async () => {
  mem.seed(
    'invitations/T',
    invitation('guest', {
      redeemedAt: new Date().toISOString(),
      redeemedByUid: 'alice',
      grantPending: true,
    }),
  );
  await redeem('T');
  expect(mockCapacity).toHaveBeenCalledWith('owner', H);
  expect(mockRecordAccepted).toHaveBeenCalledWith('owner', H);

  mockCapacity.mockReset();
  mockRecordAccepted.mockReset();
  mem.seed('invitations/T', {
    ...(mem.get('invitations/T') as object),
    grantCompletedAt: new Date().toISOString(),
  });
  await redeem('T'); // completed: no capacity check, no second occupancy record
  expect(mockCapacity).not.toHaveBeenCalled();
  expect(mockRecordAccepted).not.toHaveBeenCalled();
});
