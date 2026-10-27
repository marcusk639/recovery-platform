// redeemInvitation and admission tickets, on an in-memory store with
// optimistic transactions: the ticket is written with the redemption, only
// one of two concurrent redeems of a token grants, and a failed grant
// releases the invitation.
const users: Record<string, Record<string, unknown>> = {};
const mockSetClaims = jest.fn(async (uid: string, c: Record<string, unknown>) => {
  users[uid] = JSON.parse(JSON.stringify(c));
});
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async (uid: string) => ({ uid, customClaims: users[uid] ?? {} }),
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
jest.mock('../../util/residentCapacity', () => ({
  roleConsumesResidentSlot: (r: string) => r !== 'admin',
  assertResidentCapacityAvailable: jest.fn(),
  recordResidentAccepted: jest.fn(),
}));
jest.mock('../../api/firestore', () => ({ getHouse: jest.fn(async () => ({ ownerId: 'owner' })) }));
jest.mock('../../util/inviteEmails', () => ({ sendOneInviteEmail: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { redeemInvitation } from '../../callable/invitations';

const redeem = (token: string, uid = 'alice', email = 'alice@x.com') =>
  (redeemInvitation as unknown as Function)({ data: { token }, auth: { uid, token: { email } } });
const invitation = (role: string, extra: Record<string, unknown> = {}) => ({
  token: 'T',
  inviterUid: 'owner',
  houseId: 'h',
  role,
  invitedEmail: 'alice@x.com',
  expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  createdAt: new Date().toISOString(),
  ...extra,
});
const ticket = () => mem.get('admission-tickets/alice_h') as any;

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(users)) delete users[k];
  mockSetClaims.mockClear();
});

it('a resident invitation writes an unused, 7-day admission ticket with the redemption', async () => {
  mem.seed('invitations/T', invitation('guest', { initialPhase: 'phase-1' }));

  await redeem('T');

  expect(ticket()).toMatchObject({
    invitationId: 'T',
    role: 'guest',
    initialPhase: 'phase-1',
    used: false,
  });
  const ttlMs = ticket().expiresAt._seconds * 1000 - ticket().createdAt._seconds * 1000;
  expect(ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
  expect(mem.get('invitations/T')).toMatchObject({ redeemedByUid: 'alice' });
  expect(users.alice.guest).toEqual({ h: true });
});

it('records an empty initialPhase when the invitation has none (what the app sends)', async () => {
  mem.seed('invitations/T', invitation('guest'));
  await redeem('T');
  expect(ticket().initialPhase).toBe('');
});

it('a senior-peer invitation writes a senior-peer ticket; an admin invitation writes none', async () => {
  mem.seed('invitations/T', invitation('senior-peer'));
  await redeem('T');
  expect(ticket().role).toBe('senior-peer');

  mem.reset();
  mem.seed('invitations/T', invitation('admin'));
  await redeem('T');
  expect(ticket()).toBeUndefined();
});

it('of two concurrent redeems of one token, exactly one grants', async () => {
  mem.seed('invitations/T', invitation('guest'));

  const results = await Promise.allSettled([redeem('T'), redeem('T')]);

  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: expect.objectContaining({ message: 'Invitation already redeemed' }),
  });
  expect(mockSetClaims).toHaveBeenCalledTimes(1);
});

it('a failed claim grant releases the invitation and the ticket, so the invitee can retry', async () => {
  mem.seed('invitations/T', invitation('guest'));
  mockSetClaims.mockRejectedValueOnce(new Error('auth down'));

  await expect(redeem('T')).rejects.toThrow('auth down');
  expect(mem.get('invitations/T')?.redeemedByUid).toBeUndefined();
  expect(ticket()).toBeUndefined();

  await redeem('T');
  expect(users.alice.guest).toEqual({ h: true });
  expect(ticket().used).toBe(false);
});

it('a redeemed or expired invitation writes no ticket', async () => {
  mem.seed('invitations/T', invitation('guest', { redeemedAt: '2026-01-01T00:00:00Z' }));
  await expect(redeem('T')).rejects.toThrow('Invitation already redeemed');
  mem.seed('invitations/T', invitation('guest', { expiresAt: '2020-01-01T00:00:00Z' }));
  await expect(redeem('T')).rejects.toThrow('Invitation has expired');
  expect(ticket()).toBeUndefined();
});
