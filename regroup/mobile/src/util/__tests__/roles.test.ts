// src/util/__tests__/roles.test.ts
// Unit tests for src/util/roles.ts

// Mock camelCaseToDisplayForm to avoid react-native transitive deps in display.tsx
jest.mock('../../util/display', () => ({
  camelCaseToDisplayForm: jest.fn((s: string) => {
    // simple capitalise first letter
    return s.charAt(0).toUpperCase() + s.slice(1);
  }),
}));

// Claims and RoleToken are interfaces only — no runtime code, no mock needed.
// Role is also a type-only import.

import {
  fillRoleFromClaim,
  getRolesFromClaims,
  isAdmin,
  displayRole,
  isSameUser,
} from '../roles';
import { camelCaseToDisplayForm } from '../../util/display';

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── fillRoleFromClaim ───────────────────────────────────────────────────────

describe('fillRoleFromClaim', () => {
  it('assigns the claim value to each houseId key in the roles object', () => {
    const claims: any = { guest: { 'house-1': true, 'house-2': true } };
    const roles: any = {};
    fillRoleFromClaim(claims, 'guest', roles);
    expect(roles['house-1']).toBe('guest');
    expect(roles['house-2']).toBe('guest');
  });

  it('does nothing when the claim map is empty', () => {
    const claims: any = { guest: {} };
    const roles: any = {};
    fillRoleFromClaim(claims, 'guest', roles);
    expect(Object.keys(roles)).toHaveLength(0);
  });

  it('does nothing when the claim property is falsy', () => {
    const claims: any = {};
    const roles: any = {};
    fillRoleFromClaim(claims, 'guest', roles);
    expect(Object.keys(roles)).toHaveLength(0);
  });

  it('overwrites an existing role when a higher-privilege claim is applied', () => {
    const claims: any = { admin: { 'house-1': true } };
    const roles: any = { 'house-1': 'guest' };
    fillRoleFromClaim(claims, 'admin', roles);
    expect(roles['house-1']).toBe('admin');
  });

  it('tolerates the legacy array shape (pre-P0-1 tokens)', () => {
    const claims: any = { guest: ['house-1', 'house-2'] };
    const roles: any = {};
    fillRoleFromClaim(claims, 'guest', roles);
    expect(roles['house-1']).toBe('guest');
    expect(roles['house-2']).toBe('guest');
  });
});

// ─── getRolesFromClaims ──────────────────────────────────────────────────────

describe('getRolesFromClaims', () => {
  it('builds a roles map from all three claim types', () => {
    const claims: any = {
      guest: { 'house-g': true },
      admin: { 'house-a': true },
      superAdmin: { 'house-sa': true },
    };
    const roles = getRolesFromClaims(claims);
    expect(roles['house-g']).toBe('guest');
    expect(roles['house-a']).toBe('admin');
    expect(roles['house-sa']).toBe('superAdmin');
  });

  it('gives higher privilege precedence (superAdmin overwrites guest for same house)', () => {
    const claims: any = {
      guest: { 'house-1': true },
      admin: {},
      superAdmin: { 'house-1': true },
    };
    const roles = getRolesFromClaims(claims);
    // guest is applied first, then superAdmin overwrites it
    expect(roles['house-1']).toBe('superAdmin');
  });

  it('returns an empty object when all claim maps are empty', () => {
    const claims: any = { guest: {}, admin: {}, superAdmin: {} };
    const roles = getRolesFromClaims(claims);
    expect(roles).toEqual({});
  });
});

// ─── isAdmin ─────────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('returns true when role is "admin"', () => {
    const token: any = { role: { 'house-1': 'admin' } };
    expect(isAdmin(token, 'house-1')).toBe(true);
  });

  it('returns true when role is "superAdmin"', () => {
    const token: any = { role: { 'house-1': 'superAdmin' } };
    expect(isAdmin(token, 'house-1')).toBe(true);
  });

  it('returns false when role is "guest"', () => {
    const token: any = { role: { 'house-1': 'guest' } };
    expect(isAdmin(token, 'house-1')).toBe(false);
  });

  it('returns false when houseId is not in the token', () => {
    const token: any = { role: {} };
    expect(isAdmin(token, 'house-999')).toBe(false);
  });
});

// ─── displayRole ─────────────────────────────────────────────────────────────

describe('displayRole', () => {
  it('returns "Operator" for superAdmin role regardless of guest.isAdmin', () => {
    const token: any = { role: { 'house-1': 'superAdmin' } };
    const guest: any = { isAdmin: false };
    expect(displayRole(token, 'house-1', guest)).toBe('Operator');
  });

  it('returns "Guest Administrator" when guest.isAdmin is true and role is not superAdmin', () => {
    const token: any = { role: { 'house-1': 'admin' } };
    const guest: any = { isAdmin: true };
    expect(displayRole(token, 'house-1', guest)).toBe('Guest Administrator');
  });

  it('calls camelCaseToDisplayForm for non-superAdmin, non-admin-guest roles', () => {
    const token: any = { role: { 'house-1': 'guest' } };
    const guest: any = { isAdmin: false };
    displayRole(token, 'house-1', guest);
    expect(camelCaseToDisplayForm).toHaveBeenCalledWith('guest');
  });

  it('returns transformed role string via camelCaseToDisplayForm for a guest role', () => {
    const token: any = { role: { 'house-1': 'guest' } };
    const guest: any = { isAdmin: false };
    const result = displayRole(token, 'house-1', guest);
    // our mock capitalises first letter: 'guest' -> 'Guest'
    expect(result).toBe('Guest');
  });
});

// ─── isSameUser ──────────────────────────────────────────────────────────────

describe('isSameUser', () => {
  it('returns true when member.userId matches the provided userId', () => {
    const member: any = { userId: 'user-123' };
    expect(isSameUser(member, 'user-123')).toBe(true);
  });

  it('returns false when member.userId does not match', () => {
    const member: any = { userId: 'user-123' };
    expect(isSameUser(member, 'user-456')).toBe(false);
  });
});
