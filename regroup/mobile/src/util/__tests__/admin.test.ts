// src/util/__tests__/admin.test.ts
// Unit tests for src/util/admin.ts
// No mocks needed — admin.ts only uses lodash and plain entity types.

import { mapUserToAdmin, isSuperAdmin, houseIdsRemoved } from '../admin';

// Admin is a class with a constructor; use plain objects cast as `any` for test data.

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mapUserToAdmin', () => {
  it('maps all user fields onto the admin object', () => {
    const user = {
      firstName: 'Alice',
      lastName: 'Smith',
      uid: 'user-123',
      phoneNumber: '5551234567',
      email: 'alice@example.com',
    };
    const admin: any = {};
    const result = mapUserToAdmin(user, admin);
    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Smith');
    expect(result.userId).toBe('user-123');
    expect(result.phoneNumber).toBe('5551234567');
    expect(result.email).toBe('alice@example.com');
  });

  it('fills empty strings for missing user fields', () => {
    const user = {};
    const admin: any = {};
    const result = mapUserToAdmin(user, admin);
    expect(result.firstName).toBe('');
    expect(result.lastName).toBe('');
    expect(result.userId).toBe('');
    expect(result.phoneNumber).toBe('');
    expect(result.email).toBe('');
  });

  it('returns the same admin object (mutates in place)', () => {
    const user = { firstName: 'Bob' };
    const admin: any = {};
    const result = mapUserToAdmin(user, admin);
    expect(result).toBe(admin);
  });
});

describe('isSuperAdmin', () => {
  it('returns truthy when the admin has the given houseId in superAdmin', () => {
    const admin = { superAdmin: ['house-1', 'house-2'] };
    expect(isSuperAdmin(admin, 'house-1')).toBeTruthy();
  });

  it('returns falsy when the houseId is not in superAdmin', () => {
    const admin = { superAdmin: ['house-1'] };
    expect(isSuperAdmin(admin, 'house-999')).toBeFalsy();
  });

  it('returns falsy when superAdmin is an empty array', () => {
    const admin = { superAdmin: [] };
    expect(isSuperAdmin(admin, 'house-1')).toBeFalsy();
  });

  it('returns falsy when admin is null', () => {
    expect(isSuperAdmin(null, 'house-1')).toBeFalsy();
  });

  it('returns falsy when admin has no superAdmin property', () => {
    const admin = {};
    expect(isSuperAdmin(admin, 'house-1')).toBeFalsy();
  });
});

describe('houseIdsRemoved', () => {
  it('returns removed house ids when a house is removed from before to after', () => {
    const before: any = { houseIds: ['house-1', 'house-2', 'house-3'] };
    const after: any = { houseIds: ['house-1'] };
    const [removedSuperAdmin, removedAdmin] = houseIdsRemoved(before, after);
    expect(removedSuperAdmin).toEqual(['house-2', 'house-3']);
    expect(removedAdmin).toEqual(['house-2', 'house-3']);
  });

  it('returns empty arrays when no house ids are removed', () => {
    const before: any = { houseIds: ['house-1'] };
    const after: any = { houseIds: ['house-1', 'house-2'] };
    const [removedSuperAdmin, removedAdmin] = houseIdsRemoved(before, after);
    expect(removedSuperAdmin).toEqual([]);
    expect(removedAdmin).toEqual([]);
  });

  it('returns empty arrays when before or after is falsy', () => {
    const [r1, r2] = houseIdsRemoved(null as any, null as any);
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
  });

  it('returns empty arrays when houseIds are undefined', () => {
    const before: any = {};
    const after: any = {};
    const [r1, r2] = houseIdsRemoved(before, after);
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
  });
});
