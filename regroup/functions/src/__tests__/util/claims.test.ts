// src/__tests__/util/claims.test.ts

// Must mock firebase-admin before importing anything that uses it
const mockGetUser = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({ getUser: mockGetUser })),
}));

import { createClaims, deleteClaim } from '../../util/claims';

const mockUser = (claims: Record<string, any> = {}) => ({
  customClaims: claims,
});

beforeEach(() => jest.clearAllMocks());

describe('createClaims', () => {
  it('creates new role claims when user has none', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual(['house-1']);
  });

  it('merges new houseIds with existing claims of the same role', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await createClaims('user-1', ['house-2'], 'guest');
    expect(result.guest).toContain('house-1');
    expect(result.guest).toContain('house-2');
  });

  it('deduplicates when adding an already-existing houseId', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    const guestClaims = result.guest as string[];
    expect(guestClaims.filter(id => id === 'house-1')).toHaveLength(1);
  });

  it('preserves other role claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({ admin: ['house-99'] }));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect((result as any).admin).toEqual(['house-99']);
  });

  it('sets potentialSuperAdmin when specified', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', [], 'guest', true);
    expect(result.potentialSuperAdmin).toBe(true);
  });
});

describe('deleteClaim', () => {
  it('removes the specified houseId from role claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1', 'house-2'] }));
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).not.toContain('house-1');
    expect(result.guest).toContain('house-2');
  });

  it('leaves claims unchanged when houseId does not exist', async () => {
    // When the houseId is not found, deleteClaim should not modify the array.
    // Previously, splice(-1, 1) was called on a -1 index, incorrectly removing
    // the last element. The fix uses filter(), so non-existent ids are a no-op.
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await deleteClaim('user-1', ['house-99'], 'guest');
    expect(result.guest).toEqual(['house-1']);
  });

  it('handles user with no existing claims gracefully', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual([]);
  });
});
