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

import { mem, memDb } from '../helpers/memFirestore';
import { redeemInvitation } from '../../callable/invitations';
import { entitlingDocs, settleTicket } from '../../util/admission';

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

it('a resident invitation writes an unused admission ticket with the redemption', async () => {
  mem.seed(
    'invitations/T',
    invitation('guest', {
      initialPhase: 'phase-1',
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    }),
  );

  await redeem('T');

  expect(ticket()).toMatchObject({
    invitationId: 'T',
    role: 'guest',
    initialPhase: 'phase-1',
    used: false,
  });
  // 7 days after the redeem when the invitation outlives that.
  const ttlMs = ticket().expiresAt._seconds * 1000 - ticket().createdAt._seconds * 1000;
  expect(ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
  expect(mem.get('house-roles/h_alice')).toMatchObject({ tier: 'resident', via: 'invitation' });
});

it('a ticket lasts at most 24h past the invitation expiry', async () => {
  const invExpires = Date.now() + 86400_000; // invitation expires tomorrow
  mem.seed('invitations/T', invitation('guest', { expiresAt: new Date(invExpires).toISOString() }));
  await redeem('T');
  const expiresMs = ticket().expiresAt._seconds * 1000;
  expect(Math.abs(expiresMs - (invExpires + 86400_000))).toBeLessThan(1000);
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

it('of two concurrent redeems of one token by two accounts, exactly one grants', async () => {
  mem.seed('invitations/T', invitation('guest'));

  const results = await Promise.allSettled([redeem('T'), redeem('T', 'mallory', 'alice@x.com')]);

  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: expect.objectContaining({ message: 'Invitation already redeemed' }),
  });
  expect(mockSetClaims).toHaveBeenCalledTimes(1);
});

it('two concurrent redeems by the SAME account both succeed and grant once', async () => {
  mem.seed('invitations/T', invitation('guest'));

  const results = await Promise.allSettled([redeem('T'), redeem('T')]);

  expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  expect(mockSetClaims).toHaveBeenCalledTimes(1);
});

it('a repeat redeem by the same account succeeds without granting again', async () => {
  mem.seed('invitations/T', invitation('guest'));
  await redeem('T');
  mockSetClaims.mockClear();

  await expect(redeem('T')).resolves.toEqual({ houseId: 'h', role: 'guest' });
  expect(mockSetClaims).not.toHaveBeenCalled();
});

it('a completed redeem records grantCompletedAt; a repeat never re-writes a missing ticket', async () => {
  mem.seed('invitations/T', invitation('guest'));
  await redeem('T');
  expect(mem.get('invitations/T')?.grantCompletedAt).toEqual(expect.any(String));
  // E.g. the resident was removed; an old token must not let them self-create again.
  await memDb.doc('admission-tickets/alice_h').delete();
  await redeem('T');
  expect(ticket()).toBeUndefined();
});

describe('a same-account retry never brings back a revoked tier (verifier V1)', () => {
  it('an ex-manager re-redeeming their old admin token (even long expired) gets nothing back', async () => {
    mem.seed('invitations/T', invitation('admin'));
    await redeem('T');
    expect(mem.get('house-roles/h_alice')).toMatchObject({ tier: 'manager' });
    // The owner removes the manager.
    users.alice = { admin: {}, guest: {}, superAdmin: {} };
    await memDb.doc('house-roles/h_alice').delete();
    await memDb
      .doc('invitations/T')
      .update({ expiresAt: new Date(Date.now() - 90 * 86400_000).toISOString() });
    mockSetClaims.mockClear();

    await expect(redeem('T')).resolves.toEqual({ houseId: 'h', role: 'admin' });
    expect(mockSetClaims).not.toHaveBeenCalled();
    expect(users.alice.admin).toEqual({});
    expect(mem.get('house-roles/h_alice')).toBeUndefined();
  });

  const stranded = (expiresAt: string) =>
    mem.seed(
      'invitations/T',
      invitation('guest', {
        expiresAt,
        redeemedAt: new Date().toISOString(),
        redeemedByUid: 'alice',
      }),
    );

  it('a stranded redeem (grant and release both failed) recovers while the invitation is valid', async () => {
    stranded(new Date(Date.now() + 86400_000).toISOString());

    await redeem('T');

    expect(users.alice.guest).toEqual({ h: true });
    expect(ticket()).toMatchObject({ used: false });
    expect(mem.get('house-roles/h_alice')).toMatchObject({ tier: 'resident' });
    expect(mem.get('invitations/T')?.grantCompletedAt).toEqual(expect.any(String));
  });

  it('an expired stranded retry (past the 24h grace) is refused and grants nothing', async () => {
    stranded(new Date(Date.now() - 2 * 86400_000).toISOString());

    await expect(redeem('T')).rejects.toThrow('Invitation has expired');
    expect(mockSetClaims).not.toHaveBeenCalled();
    expect(mem.get('house-roles/h_alice')).toBeUndefined();
  });
});

it('a senior-peer redeem grants guest and admin in ONE claims write; if it fails, nothing is granted', async () => {
  mem.seed('invitations/T', invitation('senior-peer'));
  mockSetClaims.mockRejectedValueOnce(new Error('auth down'));
  await expect(redeem('T')).rejects.toThrow('auth down');
  expect(users.alice).toBeUndefined();
  expect(mem.get('invitations/T')?.redeemedByUid).toBeUndefined();
  expect(mem.get('house-roles/h_alice')).toBeUndefined();

  await redeem('T');
  expect(mockSetClaims).toHaveBeenCalledTimes(2); // the failed one and the retry
  expect(users.alice).toMatchObject({ guest: { h: true }, admin: { h: true } });
  expect(mem.get('house-roles/h_alice')).toMatchObject({ tier: 'peerLeader' });
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

describe('one ticket, several docs (probe I2 / B4)', () => {
  const seedTicket = () =>
    mem.seed('admission-tickets/alice_h', {
      invitationId: 'T',
      role: 'guest',
      initialPhase: '',
      used: false,
      createdAt: { _seconds: 0, toMillis: () => 0 },
    });
  const guest = (id: string, extra: Record<string, unknown> = {}) =>
    mem.seed(`guests/${id}`, { userId: 'alice', houseId: 'h', status: 'active', ...extra });

  it('binds the ticket to the first doc and flags the other self-creates (one batch)', async () => {
    seedTicket();
    guest('dup1', { createdBy: 'alice' });
    guest('dup2', { createdBy: 'alice' });
    guest('legacy3'); // an old build sends no createdBy

    expect((await settleTicket('alice', 'h')).sort()).toEqual(['dup2', 'legacy3']);
    expect(ticket()).toMatchObject({ used: true, usedByGuestId: 'dup1' });
    expect(mem.get('guest-flags/dup2')).toMatchObject({
      reason: 'extra-self-create',
      ticketId: 'alice_h',
    });
    expect(mem.get('guest-flags/dup1')).toBeUndefined();
  });

  it('is idempotent and never moves the binding (sequential creates, triggers out of order)', async () => {
    seedTicket();
    guest('first', { createdBy: 'alice' });
    await settleTicket('alice', 'h');
    guest('second', { createdBy: 'alice' });
    await settleTicket('alice', 'h');
    expect(await settleTicket('alice', 'h')).toEqual([]);
    expect(ticket().usedByGuestId).toBe('first');
    expect(mem.get('guest-flags/second')).toBeDefined();
  });

  it('a staff-created doc is never flagged', async () => {
    seedTicket();
    guest('self', { createdBy: 'alice' });
    guest('intake', { createdBy: 'manager' });
    expect(await settleTicket('alice', 'h')).toEqual([]);
  });

  it('only the bound doc, staff docs and legacy docs keep the claims', async () => {
    seedTicket();
    guest('dup1', { createdBy: 'alice' });
    guest('dup2', { createdBy: 'alice' });
    guest('intake', { createdBy: 'manager' });
    await settleTicket('alice', 'h');
    const docs = (await memDb.collection('guests').where('userId', '==', 'alice').get()).docs;
    const kept = (await entitlingDocs('alice', 'h', docs)).map((d: { id: string }) => d.id);
    expect(kept.sort()).toEqual(['dup1', 'intake']);
  });
});
