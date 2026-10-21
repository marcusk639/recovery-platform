// src/__tests__/util/claims.test.ts

// Must mock firebase-admin before importing anything that uses it
const mockGetUser = jest.fn();
// Stable ref so grantHouseRoles tests can assert on the single write.
const mockSetCustomUserClaims = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({
    getUser: mockGetUser,
    setCustomUserClaims: mockSetCustomUserClaims,
  })),
}));

import { createClaims, deleteClaim, grantHouseRoles } from '../../util/claims';

const mockUser = (claims: Record<string, any> = {}) => ({
  customClaims: claims,
});

beforeEach(() => jest.clearAllMocks());

describe('createClaims', () => {
  it('creates new role claims as a map keyed by houseId when user has none', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual({ 'house-1': true });
  });

  it('merges new houseIds with existing claims of the same role', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: { 'house-1': true } }));
    const result = await createClaims('user-1', ['house-2'], 'guest');
    expect(result.guest).toEqual({ 'house-1': true, 'house-2': true });
  });

  it('deduplicates when adding an already-existing houseId', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: { 'house-1': true } }));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual({ 'house-1': true });
  });

  it('preserves other role claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({ admin: { 'house-99': true } }));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect(result.admin).toEqual({ 'house-99': true });
  });

  it('migrates legacy array-shaped claims to the map shape', async () => {
    // Production tokens written before P0-1 used arrays. Reading + rewriting
    // them must transparently upgrade the shape to the map the rules require.
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await createClaims('user-1', ['house-2'], 'guest');
    expect(result.guest).toEqual({ 'house-1': true, 'house-2': true });
  });

  it('sets potentialSuperAdmin when specified', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', [], 'guest', true);
    expect(result.potentialSuperAdmin).toBe(true);
  });

  // Contract test: the shape createClaims emits MUST be the map shape that
  // firestore.rules consumes (`houseId in token.role`, `token.role.keys()`).
  // A regression to arrays here silently disables every role-scoped rule.
  it('emits the map shape required by firestore.rules (contract)', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', ['house-1', 'house-2'], 'admin');
    // Map, not array — `houseId in map` is a key lookup; on an array it would
    // be an index lookup and `.keys()` would not exist.
    expect(Array.isArray(result.admin)).toBe(false);
    expect(result.admin).toEqual({ 'house-1': true, 'house-2': true });
    expect(Object.keys(result.admin)).toEqual(['house-1', 'house-2']);
    expect('house-1' in result.admin).toBe(true);
  });
});

describe('deleteClaim', () => {
  it('removes the specified houseId from role claims', async () => {
    mockGetUser.mockResolvedValue(
      mockUser({ guest: { 'house-1': true, 'house-2': true } })
    );
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual({ 'house-2': true });
  });

  it('leaves claims unchanged when houseId does not exist', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: { 'house-1': true } }));
    const result = await deleteClaim('user-1', ['house-99'], 'guest');
    expect(result.guest).toEqual({ 'house-1': true });
  });

  it('handles user with no existing claims gracefully', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual({});
  });

  it('migrates legacy array-shaped claims while removing', async () => {
    mockGetUser.mockResolvedValue(
      mockUser({ guest: ['house-1', 'house-2'] })
    );
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual({ 'house-2': true });
  });
});
describe('grantHouseRoles', () => {
  it('adds the houses to both admin and superAdmin', async () => {
    mockGetUser.mockResolvedValue(mockUser({ admin: { a: true } }));
    await grantHouseRoles('user-1', ['h1']);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      admin: { a: true, h1: true },
      superAdmin: { h1: true },
      guest: {},
    });
  });

  it('preserves guest claims and potentialSuperAdmin', async () => {
    mockGetUser.mockResolvedValue(
      mockUser({ guest: { g: true }, potentialSuperAdmin: true })
    );
    await grantHouseRoles('user-1', ['h1']);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      admin: { h1: true },
      superAdmin: { h1: true },
      guest: { g: true },
      potentialSuperAdmin: true,
    });
  });

  it('writes claims exactly once and reads the user once', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    await grantHouseRoles('user-1', ['h1', 'h2']);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(1);
  });

  it('migrates a legacy array-shaped claim to the map shape', async () => {
    mockGetUser.mockResolvedValue(mockUser({ admin: ['a'] }));
    await grantHouseRoles('user-1', ['h1']);
    expect(mockSetCustomUserClaims.mock.calls[0][1].admin).toEqual({
      a: true,
      h1: true,
    });
  });

  it('does not write an undefined potentialSuperAdmin key', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    await grantHouseRoles('user-1', ['h1']);
    expect(mockSetCustomUserClaims.mock.calls[0][1]).not.toHaveProperty(
      'potentialSuperAdmin'
    );
  });
});
