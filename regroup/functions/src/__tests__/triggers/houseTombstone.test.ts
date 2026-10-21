// src/__tests__/triggers/houseTombstone.test.ts

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: jest.fn((_opts: unknown, handler: unknown) => handler),
}));

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn((_id: string) => ({ set: mockSet }));
// Owner user docs, read and updated through the fake transaction.
let mockUsers: Record<string, Record<string, unknown>> = {};
const mockTxUpdate = jest.fn((ref: { id: string }, data: Record<string, unknown>) => {
  mockUsers[ref.id] = { ...mockUsers[ref.id], ...data };
});
jest.mock('../../api/firestore', () => ({
  houseTombstoneCollection: { doc: (id: string) => mockDoc(id) },
  userCollection: { doc: (id: string) => ({ id }) },
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: async (ref: { id: string }) => ({
          exists: ref.id in mockUsers,
          data: () => mockUsers[ref.id],
        }),
        update: mockTxUpdate,
      }),
  },
}));

import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { deletedAtFor, onHouseDeleted } from '../../triggers/firestore/houseTombstone';

// Captured at import time: jest's clearMocks wipes call history before each test.
const registration = (onDocumentDeleted as jest.Mock).mock.calls[0];

const deletedHouse = (houseId: string, data: Record<string, unknown> | undefined) => ({
  params: { houseId },
  time: '2026-10-20T12:00:00.000Z',
  data: data ? { data: () => data } : undefined,
});

beforeEach(() => {
  mockUsers = {};
});

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

  it('uses the event time for deletedAt, so a redelivery rewrites the same value', async () => {
    const event = { params: { houseId: 'house-3' }, time: '2026-10-20T12:34:56.789Z' };
    await (onHouseDeleted as unknown as Function)(event);
    await (onHouseDeleted as unknown as Function)(event);
    expect(mockSet).toHaveBeenNthCalledWith(1, { deletedAt: '2026-10-20T12:34:56.789Z' });
    expect(mockSet).toHaveBeenNthCalledWith(2, { deletedAt: '2026-10-20T12:34:56.789Z' });
  });

  it('falls back to now when the event time is missing or invalid', () => {
    for (const t of [undefined, 'not-a-date']) {
      expect(Number.isNaN(Date.parse(deletedAtFor(t)))).toBe(false);
    }
  });

  it('propagates a write failure so the retry policy redelivers the event', async () => {
    mockSet.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      (onHouseDeleted as unknown as Function)({ params: { houseId: 'house-2' }, data: undefined }),
    ).rejects.toThrow('unavailable');
  });

  it("frees the house's slot in its owner's subscription map", async () => {
    mockUsers['owner-1'] = {
      subscriptionMetadata: {
        tier: 'professional',
        houses: { 'house-1': { numberOfGuests: 2 }, 'house-9': { numberOfGuests: 0 } },
      },
    };
    await (onHouseDeleted as unknown as Function)(deletedHouse('house-1', { ownerId: 'owner-1' }));
    const meta = mockUsers['owner-1'].subscriptionMetadata as Record<string, unknown>;
    expect(meta.houses).toEqual({ 'house-9': { numberOfGuests: 0 } });
    expect(meta.tier).toBe('professional');
  });

  it.each([
    ['the house is not in the map', { subscriptionMetadata: { houses: { other: {} } } }],
    ['the owner has no subscription', {}],
  ])('writes nothing to the owner when %s', async (_label, ownerDoc) => {
    mockUsers['owner-1'] = ownerDoc;
    await (onHouseDeleted as unknown as Function)(deletedHouse('house-1', { ownerId: 'owner-1' }));
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing to users when the owner doc is gone or the house had no ownerId', async () => {
    await (onHouseDeleted as unknown as Function)(deletedHouse('house-1', { ownerId: 'gone' }));
    await (onHouseDeleted as unknown as Function)(deletedHouse('house-2', {}));
    expect(mockTxUpdate).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledTimes(2);
  });
});
