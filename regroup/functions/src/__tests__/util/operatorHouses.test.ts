const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockWhere = jest.fn();
const mockGet = jest.fn();

jest.mock('firebase-admin', () => {
  const firestore = Object.assign(
    () => ({
      collection: () => ({ where: (...args: unknown[]) => (mockWhere(...args), { get: mockGet }) }),
      batch: () => ({ update: mockBatchUpdate, commit: mockBatchCommit }),
    }),
    {
      FieldValue: {
        delete: () => '__delete__',
        serverTimestamp: () => '__now__',
      },
    },
  );
  return { firestore };
});
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

import { setOperatorHousesStatus } from '../../util/operatorHouses';

const houses = (...ids: string[]) =>
  mockGet.mockResolvedValue({ docs: ids.map((id) => ({ id, ref: { path: `houses/${id}` } })) });

describe('setOperatorHousesStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes the status to the operator's houses and ends any grace when live", async () => {
    houses('h1', 'h2');

    await expect(setOperatorHousesStatus('uid_1', 'active')).resolves.toBe(2);

    expect(mockWhere).toHaveBeenCalledWith('ownerId', '==', 'uid_1');
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      { path: 'houses/h1' },
      { subscriptionStatus: 'active', guestGraceEndsAt: '__delete__', updatedAt: '__now__' },
    );
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes a lapsed status without touching grace', async () => {
    houses('h1');

    await setOperatorHousesStatus('uid_1', 'past_due');

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      { path: 'houses/h1' },
      { subscriptionStatus: 'past_due', updatedAt: '__now__' },
    );
  });

  it("leaves the houses alone for a status houses don't know", async () => {
    houses('h1');

    await expect(setOperatorHousesStatus('uid_1', 'incomplete')).resolves.toBe(0);

    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});
