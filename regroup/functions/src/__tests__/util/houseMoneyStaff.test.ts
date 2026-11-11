// Who may see and act on a house's money on the server (owner, 2026-11-10):
// the owner fields isHouseAdmin reads, or a live house-roles tier of owner or
// manager. Peer leaders hold the same admin claim and stay out.
const mockReadRoleTier = jest.fn((..._args: any[]): Promise<string | null> => Promise.resolve(null));
jest.mock('../../util/houseRoleStore', () => ({
  readRoleTier: (...args: any[]) => mockReadRoleTier(...args),
}));
jest.mock('firebase-admin', () => ({ firestore: () => ({}) }));
jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

import { assertHouseMoneyStaff, isHouseMoneyStaff } from '../../util/houseAuth';

const house = { ownerId: 'owner-uid', adminIds: ['admin-doc-1'], superAdminIds: [] };

describe('isHouseMoneyStaff', () => {
  beforeEach(() => mockReadRoleTier.mockReset().mockResolvedValue(null));

  it('passes the owner by the house doc, without reading roles', async () => {
    expect(await isHouseMoneyStaff('owner-uid', 'h1', house)).toBe(true);
    expect(mockReadRoleTier).not.toHaveBeenCalled();
  });

  it('passes an invited manager by their house-roles tier', async () => {
    mockReadRoleTier.mockResolvedValue('manager');
    expect(await isHouseMoneyStaff('manager-uid', 'h1', house)).toBe(true);
    expect(mockReadRoleTier).toHaveBeenCalledWith('h1', 'manager-uid');
  });

  it('passes a co-owner by their tier', async () => {
    mockReadRoleTier.mockResolvedValue('owner');
    expect(await isHouseMoneyStaff('co-owner', 'h1', house)).toBe(true);
  });

  it('refuses a peer leader, a resident and someone with no record', async () => {
    for (const tier of ['peerLeader', 'resident', null]) {
      mockReadRoleTier.mockResolvedValue(tier);
      expect(await isHouseMoneyStaff('someone', 'h1', house)).toBe(false);
    }
  });

  it('asserts with permission-denied and the given message', async () => {
    mockReadRoleTier.mockResolvedValue('peerLeader');
    await expect(assertHouseMoneyStaff('someone', 'h1', house, 'No.')).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'No.',
    });
  });
});
