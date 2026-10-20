// src/__tests__/triggers/houseTombstone.test.ts

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: jest.fn((_opts: unknown, handler: unknown) => handler),
}));

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn((_id: string) => ({ set: mockSet }));
jest.mock('../../api/firestore', () => ({
  houseTombstoneCollection: { doc: (id: string) => mockDoc(id) },
}));

import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onHouseDeleted } from '../../triggers/firestore/houseTombstone';

// Captured at import time: jest's clearMocks wipes call history before each test.
const registration = (onDocumentDeleted as jest.Mock).mock.calls[0];

describe('onHouseDeleted', () => {
  it('listens for deletes on houses/{houseId}', () => {
    expect(registration).toEqual([
      expect.objectContaining({ document: '/houses/{houseId}' }),
      expect.any(Function),
    ]);
  });

  it('is retried on failure (the tombstone set is idempotent)', () => {
    expect(registration[0]).toMatchObject({ retry: true });
  });

  it('writes houseTombstones/{houseId} with deletedAt', async () => {
    await (onHouseDeleted as unknown as Function)({
      params: { houseId: 'house-1' },
      data: undefined,
    });
    expect(mockDoc).toHaveBeenCalledWith('house-1');
    expect(mockSet).toHaveBeenCalledWith({ deletedAt: expect.any(String) });
    const { deletedAt } = mockSet.mock.calls[0][0];
    expect(Number.isNaN(Date.parse(deletedAt))).toBe(false);
  });

  it('propagates a write failure so the retry policy redelivers the event', async () => {
    mockSet.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      (onHouseDeleted as unknown as Function)({ params: { houseId: 'house-2' }, data: undefined }),
    ).rejects.toThrow('unavailable');
  });
});
