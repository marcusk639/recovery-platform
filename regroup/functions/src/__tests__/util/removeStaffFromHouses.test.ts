// A removed manager comes out of the house doc's adminIds / superAdminIds,
// which isHouseAdmin reads, so server callables stop treating them as staff.
const mockUpdate = jest.fn((..._args: any[]) => Promise.resolve());
const mockDoc = jest.fn((_id: string) => ({ update: (data: any) => mockUpdate(_id, data) }));
jest.mock('firebase-admin', () => {
  const firestore: any = () => ({ collection: () => ({ doc: mockDoc }) });
  firestore.FieldValue = { arrayRemove: (v: string) => ({ __remove: v }) };
  return { firestore };
});
jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

import { removeStaffFromHouses } from '../../util/houseAuth';

describe('removeStaffFromHouses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('takes the user out of adminIds for admin houses and superAdminIds for super-admin houses', async () => {
    await removeStaffFromHouses('u1', ['h1'], ['h2']);
    expect(mockUpdate).toHaveBeenCalledWith('h1', { adminIds: { __remove: 'u1' } });
    expect(mockUpdate).toHaveBeenCalledWith('h2', { superAdminIds: { __remove: 'u1' } });
  });

  it('does both in one write when a house is in both lists', async () => {
    await removeStaffFromHouses('u1', ['h1'], ['h1']);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('h1', {
      adminIds: { __remove: 'u1' },
      superAdminIds: { __remove: 'u1' },
    });
  });

  it('skips a house that no longer exists', async () => {
    mockUpdate.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 5 }));
    await expect(removeStaffFromHouses('u1', ['gone', 'h1'], [])).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith('h1', { adminIds: { __remove: 'u1' } });
  });

  it('passes on any other failure', async () => {
    mockUpdate.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 14 }));
    await expect(removeStaffFromHouses('u1', ['h1'], [])).rejects.toThrow('unavailable');
  });
});
