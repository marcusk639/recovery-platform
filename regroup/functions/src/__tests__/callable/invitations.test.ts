// src/__tests__/callable/invitations.test.ts

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) => (typeof _opts === 'function' ? _opts : handler),
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// The CF reads houses + writes invitations via admin.firestore().
const mockHouseGet = jest.fn();
const mockInvitationsSet = jest.fn();
const mockInvitationsDocGet = jest.fn();
const mockInvitationsDocUpdate = jest.fn();
// Stable refs so redeem tests can assert on these — the `auth: jest.fn(() => …)`
// pattern would otherwise return a fresh setCustomUserClaims jest.fn per call,
// making assertions impossible. mockCreateClaims is mocked via its own
// jest.mock factory below.
const mockSetCustomUserClaims = jest.fn();
const mockCreateClaims = jest.fn();

jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
  firestore: () => ({
    collection: (name: string) => {
      if (name === 'houses') return { doc: (_id: string) => ({ get: mockHouseGet }) };
      if (name === 'invitations')
        return {
          doc: (_id: string) => ({
            get: mockInvitationsDocGet,
            set: mockInvitationsSet,
            update: mockInvitationsDocUpdate,
          }),
        };
      return {};
    },
  }),
}));

jest.mock('../../util/claims', () => ({
  createClaims: (...args: unknown[]) => mockCreateClaims(...args),
}));

// Resident-capacity dependencies (util/residentCapacity.ts -> api/firestore.ts).
// Defaults resolve to "unresolvable limit" for every test unless a test
// explicitly configures subscription metadata — see beforeEach below.
const mockGetHouse = jest.fn();
const mockGetUser = jest.fn();
const mockGetInvitationsForHouse = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('../../api/firestore', () => ({
  getHouse: (...args: unknown[]) => mockGetHouse(...args),
  getUser: (...args: unknown[]) => mockGetUser(...args),
  getInvitationsForHouse: (...args: unknown[]) => mockGetInvitationsForHouse(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

// Token util — deterministic for testing.
jest.mock('../../util/tokens', () => ({
  generateInvitationToken: () => 'TEST_TOKEN_FIXED',
}));

// Email helper — verify the CF calls it with the right args, don't
// actually send mail.
const mockSendOneInviteEmail = jest.fn();
jest.mock('../../util/inviteEmails', () => ({
  sendOneInviteEmail: (...args: unknown[]) => mockSendOneInviteEmail(...args),
}));

import { createInvitation, redeemInvitation } from '../../callable/invitations';

const fakeAuth = { uid: 'inviter-uid', token: { email: 'inviter@x.com' } };
const call = (fn: unknown, data: unknown, auth: object | null = fakeAuth) =>
  (fn as Function)({ data, auth: auth ?? undefined });

beforeEach(() => {
  jest.clearAllMocks();
  // Default: capacity check resolves nothing -> "unresolvable limit, allow"
  // for every test that doesn't touch resident capacity directly.
  mockGetHouse.mockResolvedValue(undefined);
  mockGetUser.mockResolvedValue(undefined);
  mockGetInvitationsForHouse.mockResolvedValue([]);
});

describe('createInvitation — happy path', () => {
  it('admin of the house writes an invitation doc and returns the token', async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ownerId: 'someone-else',
        adminIds: ['inviter-admin-id'],
      }),
    });

    const result = await call(
      createInvitation,
      {
        email: 'newadmin@x.com',
        houseId: 'house-1',
        role: 'admin',
      },
      { uid: 'inviter-uid', token: { admin: { 'house-1': true } } },
    );

    expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
    expect(mockInvitationsSet).toHaveBeenCalledTimes(1);
    const [doc] = mockInvitationsSet.mock.calls[0];
    expect(doc).toMatchObject({
      token: 'TEST_TOKEN_FIXED',
      inviterUid: 'inviter-uid',
      houseId: 'house-1',
      role: 'admin',
      invitedEmail: 'newadmin@x.com',
    });
    expect(doc.expiresAt).toEqual(expect.any(String));
    expect(mockSendOneInviteEmail).toHaveBeenCalledTimes(1);
  });

  it('omits initialPhase from the doc when not provided (Firestore rejects undefined values)', async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: 'owner-uid' }),
    });
    await call(
      createInvitation,
      { email: 'x@x.com', houseId: 'h', role: 'admin' },
      { uid: 'owner-uid', token: {} },
    );
    const [doc] = mockInvitationsSet.mock.calls[0];
    expect(doc).not.toHaveProperty('initialPhase');
    expect(doc).toMatchObject({
      token: 'TEST_TOKEN_FIXED',
      inviterUid: 'owner-uid',
      houseId: 'h',
      role: 'admin',
      invitedEmail: 'x@x.com',
    });
  });

  it('includes initialPhase in the doc when provided', async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: 'owner-uid' }),
    });
    await call(
      createInvitation,
      {
        email: 'guest@x.com',
        houseId: 'h',
        role: 'guest',
        initialPhase: 'Phase 1',
      },
      { uid: 'owner-uid', token: {} },
    );
    const [doc] = mockInvitationsSet.mock.calls[0];
    expect(doc).toHaveProperty('initialPhase', 'Phase 1');
    expect(doc).toMatchObject({
      token: 'TEST_TOKEN_FIXED',
      inviterUid: 'owner-uid',
      houseId: 'h',
      role: 'guest',
      invitedEmail: 'guest@x.com',
    });
  });
});

describe('createInvitation — denials', () => {
  it('DENY unauthenticated caller', async () => {
    await expect(
      call(createInvitation, { email: 'x@x.com', houseId: 'h', role: 'admin' }, null),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockInvitationsSet).not.toHaveBeenCalled();
  });

  it('DENY caller who is neither owner nor admin/superAdmin of the house', async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: 'someone-else' }),
    });
    await expect(
      call(
        createInvitation,
        { email: 'x@x.com', houseId: 'house-1', role: 'admin' },
        { uid: 'random-uid', token: { admin: { 'house-OTHER': true } } },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockInvitationsSet).not.toHaveBeenCalled();
  });

  it('DENY house that does not exist', async () => {
    mockHouseGet.mockResolvedValue({ exists: false });
    await expect(
      call(createInvitation, { email: 'x@x.com', houseId: 'ghost', role: 'admin' }, fakeAuth),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('REJECT invalid role at schema boundary', async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: 'inviter-uid' }),
    });
    await expect(
      call(
        createInvitation,
        { email: 'x@x.com', houseId: 'h', role: 'superAdmin' as any },
        fakeAuth,
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('ALLOW owner (token admin claim absent) — owner is the setup-wizard self-service path', async () => {
    mockHouseGet.mockResolvedValue({
      exists: true,
      data: () => ({ ownerId: 'owner-uid' }),
    });
    const result = await call(
      createInvitation,
      { email: 'x@x.com', houseId: 'h', role: 'admin' },
      { uid: 'owner-uid', token: {} }, // no admin claim yet
    );
    expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
  });
});

describe('peekInvitation', () => {
  it('returns role/email/houseId/initialPhase for a valid token', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        token: 'TEST_TOKEN_FIXED',
        inviterUid: 'inviter-uid',
        houseId: 'house-1',
        role: 'guest',
        invitedEmail: 'guest@x.com',
        initialPhase: 'Phase 1',
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    });

    const { peekInvitation } = require('../../callable/invitations');
    const result = await call(
      peekInvitation,
      { token: 'TEST_TOKEN_FIXED' },
      null, // peek is unauthenticated — the token IS the credential
    );
    expect(result).toEqual({
      houseId: 'house-1',
      role: 'guest',
      invitedEmail: 'guest@x.com',
      initialPhase: 'Phase 1',
      expiresAt: expect.any(String),
    });
  });

  it('DENY: token does not exist (404 with generic message)', async () => {
    mockInvitationsDocGet.mockResolvedValue({ exists: false });
    const { peekInvitation } = require('../../callable/invitations');
    await expect(call(peekInvitation, { token: 'MISSING' }, null)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('DENY: token already redeemed', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        token: 'T',
        inviterUid: 'i',
        houseId: 'h',
        role: 'guest',
        invitedEmail: 'x@x.com',
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        createdAt: new Date().toISOString(),
        redeemedAt: new Date().toISOString(),
        redeemedByUid: 'someone',
      }),
    });
    const { peekInvitation } = require('../../callable/invitations');
    await expect(call(peekInvitation, { token: 'T' }, null)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('DENY: token expired', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        token: 'T',
        inviterUid: 'i',
        houseId: 'h',
        role: 'guest',
        invitedEmail: 'x@x.com',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    });
    const { peekInvitation } = require('../../callable/invitations');
    await expect(call(peekInvitation, { token: 'T' }, null)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('redeemInvitation', () => {
  const VALID = {
    token: 'TEST_TOKEN_FIXED',
    inviterUid: 'inviter-uid',
    houseId: 'house-1',
    role: 'admin' as const,
    invitedEmail: 'alice@x.com',
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  it('happy path: sets claims from the invitation doc and marks redeemed', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID }),
    });
    mockCreateClaims.mockResolvedValue({ admin: ['house-1'] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(
      redeemInvitation,
      { token: 'TEST_TOKEN_FIXED' },
      { uid: 'alice-uid', token: { email: 'alice@x.com' } },
    );

    expect(mockCreateClaims).toHaveBeenCalledWith('alice-uid', ['house-1'], 'admin', false);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      'alice-uid',
      expect.objectContaining({ admin: ['house-1'] }),
    );
    expect(mockInvitationsDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        redeemedAt: expect.any(String),
        redeemedByUid: 'alice-uid',
      }),
    );
    expect(result).toEqual({ houseId: 'house-1', role: 'admin' });
  });

  it('DENY: caller email does not match invitation email (case-insensitive)', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID }),
    });
    await expect(
      call(
        redeemInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        { uid: 'attacker-uid', token: { email: 'attacker@x.com' } },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockInvitationsDocUpdate).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it('DENY: already redeemed', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ...VALID,
        redeemedAt: new Date().toISOString(),
        redeemedByUid: 'someone-else',
      }),
    });
    await expect(
      call(
        redeemInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('DENY: expired', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        ...VALID,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    await expect(
      call(
        redeemInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('DENY: unauthenticated', async () => {
    await expect(call(redeemInvitation, { token: 'T' }, null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('DENY: token not found', async () => {
    mockInvitationsDocGet.mockResolvedValue({ exists: false });
    await expect(
      call(
        redeemInvitation,
        { token: 'GHOST' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('role=guest maps to a guest claim (not admin)', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID, role: 'guest' }),
    });
    mockCreateClaims.mockResolvedValue({ guest: ['house-1'] });
    await call(
      redeemInvitation,
      { token: 'T' },
      { uid: 'alice-uid', token: { email: 'alice@x.com' } },
    );
    expect(mockCreateClaims).toHaveBeenCalledWith('alice-uid', ['house-1'], 'guest', false);
  });

  it('role=senior-peer maps to BOTH guest and admin claims', async () => {
    mockInvitationsDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID, role: 'senior-peer' }),
    });
    mockCreateClaims.mockResolvedValue({ guest: ['house-1'] });
    await call(
      redeemInvitation,
      { token: 'T' },
      { uid: 'alice-uid', token: { email: 'alice@x.com' } },
    );
    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(1, 'alice-uid', ['house-1'], 'guest', false);
    expect(mockCreateClaims).toHaveBeenNthCalledWith(2, 'alice-uid', ['house-1'], 'admin', false);
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(2);
  });
});

describe('resident capacity enforcement', () => {
  const future = () => new Date(Date.now() + 86400_000).toISOString();

  // existing = accepted residents already tracked on the subscription;
  // maxResidents = the persisted plan cap (null = unlimited).
  const ownerMeta = (maxResidents: number | null, existing: number) => ({
    tier: 'starter',
    maxResidents,
    houses: { 'house-1': { numberOfGuests: existing } },
  });

  describe('createInvitation', () => {
    it('DENY: refused when existing residents are already at the limit', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 10) });

      await expect(
        call(
          createInvitation,
          { email: 'x@x.com', houseId: 'house-1', role: 'guest' },
          { uid: 'owner-uid', token: {} },
        ),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mockInvitationsSet).not.toHaveBeenCalled();
    });

    it('ALLOW: succeeds when one resident below the limit', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 9) });

      const result = await call(
        createInvitation,
        { email: 'x@x.com', houseId: 'house-1', role: 'guest' },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
      expect(mockInvitationsSet).toHaveBeenCalledTimes(1);
    });

    it('DENY: pending invitations count toward the limit (bypass check)', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      // 8 accepted + 2 pending == 10, already at the cap of 10.
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 8) });
      mockGetInvitationsForHouse.mockResolvedValue([
        { role: 'guest', expiresAt: future() },
        { role: 'senior-peer', expiresAt: future() },
      ]);

      await expect(
        call(
          createInvitation,
          { email: 'x@x.com', houseId: 'house-1', role: 'guest' },
          { uid: 'owner-uid', token: {} },
        ),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mockInvitationsSet).not.toHaveBeenCalled();
    });

    it('ALLOW: expired and already-redeemed invitations do not count as pending', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 8) });
      mockGetInvitationsForHouse.mockResolvedValue([
        { role: 'guest', expiresAt: new Date(Date.now() - 1000).toISOString() },
        { role: 'guest', redeemedAt: new Date().toISOString(), expiresAt: future() },
        // admin invites never consume a resident slot, regardless of state.
        { role: 'admin', expiresAt: future() },
      ]);

      const result = await call(
        createInvitation,
        { email: 'x@x.com', houseId: 'house-1', role: 'guest' },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
    });

    it('ALLOW: maxResidents null (Enterprise/Network) is unlimited, never refused', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockGetUser.mockResolvedValue({
        subscriptionMetadata: { tier: 'enterprise', maxResidents: null, houses: {} },
      });

      const result = await call(
        createInvitation,
        { email: 'x@x.com', houseId: 'house-1', role: 'guest' },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
      // Unlimited tiers must short-circuit before touching invitation counts.
      expect(mockGetInvitationsForHouse).not.toHaveBeenCalled();
    });

    it('ALLOW: unresolvable limit (no subscriptionMetadata) allows and logs the anomaly', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockGetUser.mockResolvedValue(undefined);
      const { logger } = require('firebase-functions');

      const result = await call(
        createInvitation,
        { email: 'x@x.com', houseId: 'house-1', role: 'guest' },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unresolvable'),
        expect.objectContaining({ ownerId: 'owner-uid' }),
      );
    });

    it('ALLOW: admin-role invitations skip the resident cap entirely', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 10) });

      const result = await call(
        createInvitation,
        { email: 'x@x.com', houseId: 'house-1', role: 'admin' },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  describe('redeemInvitation', () => {
    const VALID_GUEST = {
      token: 'TEST_TOKEN_FIXED',
      inviterUid: 'inviter-uid',
      houseId: 'house-1',
      role: 'guest' as const,
      invitedEmail: 'alice@x.com',
      expiresAt: future(),
      createdAt: new Date().toISOString(),
    };

    it('DENY: acceptance re-check refuses when the house is already at capacity', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID_GUEST }),
      });
      mockGetHouse.mockResolvedValue({ ownerId: 'owner-uid' });
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 10) });

      await expect(
        call(
          redeemInvitation,
          { token: 'TEST_TOKEN_FIXED' },
          { uid: 'alice-uid', token: { email: 'alice@x.com' } },
        ),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
      expect(mockInvitationsDocUpdate).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('ALLOW: accepting under the cap records the new resident occupancy', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID_GUEST }),
      });
      mockGetHouse.mockResolvedValue({ ownerId: 'owner-uid' });
      mockGetUser.mockResolvedValue({ subscriptionMetadata: ownerMeta(10, 5) });
      mockCreateClaims.mockResolvedValue({ guest: ['house-1'] });

      const result = await call(
        redeemInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      );
      expect(result).toEqual({ houseId: 'house-1', role: 'guest' });
      expect(mockUpdateUser).toHaveBeenCalledWith(
        'owner-uid',
        expect.objectContaining({
          subscriptionMetadata: expect.objectContaining({
            houses: expect.objectContaining({ 'house-1': { numberOfGuests: 6 } }),
          }),
        }),
      );
    });

    it('ALLOW: admin-role redemption skips the resident cap and occupancy recording', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID_GUEST, role: 'admin' }),
      });
      mockCreateClaims.mockResolvedValue({ admin: ['house-1'] });

      const result = await call(
        redeemInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      );
      expect(result).toEqual({ houseId: 'house-1', role: 'admin' });
      expect(mockGetHouse).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });
});
