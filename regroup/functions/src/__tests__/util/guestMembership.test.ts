// src/__tests__/util/guestMembership.test.ts
//
// A guest doc only counts toward a house's money math (EES split) when the
// account it names actually holds a role claim for that house. Claims are set
// only server-side (redeemInvitation / addGuestAuthorization), so they are a
// signal a client cannot forge by writing a guest doc.

jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => {
    throw new Error('tests pass an explicit auth client');
  }),
}));

import {
  holdsHouseRole,
  classifyGuestMembership,
  fetchClaimsByUid,
  selectLegitimateGuests,
} from '../../util/guestMembership';

const HOUSE = 'house-1';

function fakeAuth(users: Record<string, Record<string, unknown> | undefined>) {
  const getUsers = jest.fn(async (ids: { uid: string }[]) => ({
    users: ids
      .filter((i) => i.uid in users)
      .map((i) => ({ uid: i.uid, customClaims: users[i.uid] })),
    notFound: ids.filter((i) => !(i.uid in users)),
  }));
  return { getUsers };
}

describe('holdsHouseRole', () => {
  it.each([
    ['guest map', { guest: { [HOUSE]: true } }, true],
    ['admin map', { admin: { [HOUSE]: true } }, true],
    ['superAdmin map', { superAdmin: { [HOUSE]: true } }, true],
    ['legacy guest array', { guest: [HOUSE] }, true],
    ['claim for another house only', { guest: { 'house-2': true } }, false],
    ['no claims', {}, false],
    ['undefined claims', undefined, false],
  ])('%s -> %s', (_label, claims, expected) => {
    expect(holdsHouseRole(claims as any, HOUSE)).toBe(expected);
  });
});

describe('classifyGuestMembership', () => {
  const claims = new Map<string, Record<string, unknown> | null>([
    ['resident', { guest: { [HOUSE]: true } }],
    ['stranger', { guest: { 'house-2': true } }],
    ['deleted', null],
  ]);

  it('treats a doc with no userId as an admin-entered resident', () => {
    // Intake and CSV import create guest docs with no account behind them,
    // and only a house admin can create a doc without one.
    expect(classifyGuestMembership({ houseId: HOUSE }, claims)).toBe('no-account');
    expect(classifyGuestMembership({ houseId: HOUSE, userId: '' }, claims)).toBe('no-account');
  });

  it('accepts a doc whose account holds a claim for the house', () => {
    expect(classifyGuestMembership({ houseId: HOUSE, userId: 'resident' }, claims)).toBe('member');
  });

  it('flags a doc whose account has no claim for the house', () => {
    expect(classifyGuestMembership({ houseId: HOUSE, userId: 'stranger' }, claims)).toBe(
      'no-claim',
    );
  });

  it('flags a doc whose account no longer exists', () => {
    expect(classifyGuestMembership({ houseId: HOUSE, userId: 'deleted' }, claims)).toBe(
      'account-missing',
    );
  });

  it('flags a doc with no houseId', () => {
    expect(classifyGuestMembership({ userId: 'resident' }, claims)).toBe('no-house');
  });
});

describe('fetchClaimsByUid', () => {
  it('looks up each uid once and maps missing accounts to null', async () => {
    const authClient = fakeAuth({ a: { guest: { [HOUSE]: true } } });
    const result = await fetchClaimsByUid(['a', 'b', 'a'], authClient);
    expect(authClient.getUsers).toHaveBeenCalledTimes(1);
    expect(authClient.getUsers).toHaveBeenCalledWith([{ uid: 'a' }, { uid: 'b' }]);
    expect(result.get('a')).toEqual({ guest: { [HOUSE]: true } });
    expect(result.get('b')).toBeNull();
  });

  it("chunks lookups at the Admin SDK's 100-identifier limit", async () => {
    const uids = Array.from({ length: 150 }, (_, i) => `u${i}`);
    const authClient = fakeAuth({});
    await fetchClaimsByUid(uids, authClient);
    expect(authClient.getUsers).toHaveBeenCalledTimes(2);
    expect(authClient.getUsers.mock.calls[0][0]).toHaveLength(100);
    expect(authClient.getUsers.mock.calls[1][0]).toHaveLength(50);
  });

  it('makes no Auth call when there are no uids', async () => {
    const authClient = fakeAuth({});
    await fetchClaimsByUid([], authClient);
    expect(authClient.getUsers).not.toHaveBeenCalled();
  });
});

describe('selectLegitimateGuests', () => {
  const authClient = () =>
    fakeAuth({
      r1: { guest: { [HOUSE]: true } },
      r2: { guest: { [HOUSE]: true }, admin: { [HOUSE]: true } },
      ghost: { guest: { 'house-2': true } },
    });

  it('drops a self-created ghost doc and keeps real residents', async () => {
    const guests = [
      { id: 'g1', houseId: HOUSE, userId: 'r1' },
      { id: 'g2', houseId: HOUSE, userId: 'r2' },
      { id: 'g3', houseId: HOUSE }, // admin intake, no account
      { id: 'g4', houseId: HOUSE, userId: 'ghost' },
      { id: 'g5', houseId: HOUSE, userId: 'unknown-uid' },
    ];
    const kept = await selectLegitimateGuests(guests, HOUSE, authClient());
    expect(kept.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('counts one account once even if it has two guest docs in the house', async () => {
    const guests = [
      { id: 'g1', houseId: HOUSE, userId: 'r1' },
      { id: 'g1-dupe', houseId: HOUSE, userId: 'r1' },
    ];
    const kept = await selectLegitimateGuests(guests, HOUSE, authClient());
    expect(kept.map((g) => g.id)).toEqual(['g1']);
  });

  it("checks claims against the house being computed, not the doc's own field", async () => {
    const guests = [{ id: 'g1', houseId: 'house-2', userId: 'ghost' }];
    const kept = await selectLegitimateGuests(guests, HOUSE, authClient());
    expect(kept).toEqual([]);
  });

  it('propagates an Auth failure instead of guessing', async () => {
    const failing = { getUsers: jest.fn().mockRejectedValue(new Error('auth down')) };
    await expect(
      selectLegitimateGuests([{ houseId: HOUSE, userId: 'r1' }], HOUSE, failing),
    ).rejects.toThrow('auth down');
  });
});
