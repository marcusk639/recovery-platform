jest.mock('firebase-functions', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockHouseGet = jest.fn();
jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: () => ({ doc: () => ({ get: mockHouseGet }) }),
  }),
}));

const mockEnforceHouseEntitlement = jest.fn();
jest.mock('../entitlement', () => ({
  enforceHouseEntitlement: (...args: any[]) => mockEnforceHouseEntitlement(...args),
}));

import { assertCanGrantClaimForHouses } from '../authGuard';

const houseData = {
  ownerId: 'owner-uid',
  subscriptionStatus: 'active',
};

const base = {
  callerUid: 'owner-uid',
  callerToken: {},
  targetUid: 'target-uid',
  houseIds: ['house-1'],
  callableName: 'test',
};

beforeEach(() => {
  mockHouseGet.mockReset();
  mockEnforceHouseEntitlement.mockReset();
  mockHouseGet.mockResolvedValue({ exists: true, data: () => houseData });
  mockEnforceHouseEntitlement.mockResolvedValue({
    entitled: true,
    reason: 'active',
  });
});

describe('assertCanGrantClaimForHouses — entitlement opt-in', () => {
  it('checks entitlement when enforceEntitlement is set (a grant)', async () => {
    await assertCanGrantClaimForHouses({ ...base, enforceEntitlement: true });

    expect(mockEnforceHouseEntitlement).toHaveBeenCalledWith(houseData, 'house-1');
  });

  it('does NOT check entitlement by default (a revocation)', async () => {
    // Revocations must keep working while billing is lapsed: blocking an
    // operator from removing someone's access is a safety problem.
    await assertCanGrantClaimForHouses(base);

    expect(mockEnforceHouseEntitlement).not.toHaveBeenCalled();
  });

  it('propagates a denial from the gate on a grant', async () => {
    mockEnforceHouseEntitlement.mockRejectedValue(
      Object.assign(new Error('no subscription'), {
        code: 'failed-precondition',
      }),
    );

    let caught: { code?: string } | undefined;
    try {
      await assertCanGrantClaimForHouses({ ...base, enforceEntitlement: true });
    } catch (err) {
      caught = err as { code?: string };
    }
    expect(caught?.code).toBe('failed-precondition');
  });

  it('denies on permission before consulting entitlement', async () => {
    // An unauthorized caller must not learn the house's subscription state.
    let caught: { code?: string } | undefined;
    try {
      await assertCanGrantClaimForHouses({
        ...base,
        callerUid: 'stranger-uid',
        targetUid: 'stranger-uid',
        enforceEntitlement: true,
      });
    } catch (err) {
      caught = err as { code?: string };
    }
    expect(caught?.code).toBe('permission-denied');
    expect(mockEnforceHouseEntitlement).not.toHaveBeenCalled();
  });
});
