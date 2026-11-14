// A removed manager comes out of the house doc's adminIds / superAdminIds,
// which isHouseAdmin reads, so server callables stop treating them as staff.
const mockUpdate = jest.fn((..._args: any[]) => Promise.resolve());
const mockDoc = jest.fn((_id: string) => ({ update: (data: any) => mockUpdate(_id, data) }));
// adminIds / superAdminIds hold admins doc ids, not uids (security review).
const mockAdminDocIds: Record<string, string[]> = { u1: ['adm-a', 'adm-b'] };
const mockWhere = jest.fn((_f: string, _op: string, uid: string) => ({
  get: async () => ({ docs: (mockAdminDocIds[uid] ?? []).map(id => ({ id })) }),
}));
jest.mock('firebase-admin', () => {
  const firestore: any = () => ({
    collection: (name: string) =>
      name === 'admins' ? { where: mockWhere } : { doc: mockDoc },
  });
  firestore.FieldValue = { arrayRemove: (...v: string[]) => ({ __remove: v }) };
  return { firestore };
});
jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

import { removeStaffFromHouses } from '../../util/houseAuth';

describe('removeStaffFromHouses', () => {
  beforeEach(() => jest.clearAllMocks());

  it("looks up the user's own admins doc ids, by uid", async () => {
    await removeStaffFromHouses('u1', ['h1'], []);
    expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'u1');
  });

  it('does nothing when the user has no admins doc', async () => {
    await removeStaffFromHouses('nobody', ['h1'], []);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('takes the user out of adminIds for admin houses and superAdminIds for super-admin houses', async () => {
    await removeStaffFromHouses('u1', ['h1'], ['h2']);
    expect(mockUpdate).toHaveBeenCalledWith('h1', { adminIds: { __remove: ['adm-a', 'adm-b'] } });
    expect(mockUpdate).toHaveBeenCalledWith('h2', { superAdminIds: { __remove: ['adm-a', 'adm-b'] } });
  });

  it('does both in one write when a house is in both lists', async () => {
    await removeStaffFromHouses('u1', ['h1'], ['h1']);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('h1', {
      adminIds: { __remove: ['adm-a', 'adm-b'] },
      superAdminIds: { __remove: ['adm-a', 'adm-b'] },
    });
  });

  it('skips a house that no longer exists', async () => {
    mockUpdate.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 5 }));
    await expect(removeStaffFromHouses('u1', ['gone', 'h1'], [])).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith('h1', { adminIds: { __remove: ['adm-a', 'adm-b'] } });
  });

  it('passes on any other failure', async () => {
    mockUpdate.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 14 }));
    await expect(removeStaffFromHouses('u1', ['h1'], [])).rejects.toThrow('unavailable');
  });
});
