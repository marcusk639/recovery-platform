import type { Role, Roles } from '../Roles';

describe('Role type', () => {
  it('accepts "admin" as a valid Role', () => {
    const role: Role = 'admin';
    expect(role).toBe('admin');
  });

  it('accepts "superAdmin" as a valid Role', () => {
    const role: Role = 'superAdmin';
    expect(role).toBe('superAdmin');
  });

  it('accepts "guest" as a valid Role', () => {
    const role: Role = 'guest';
    expect(role).toBe('guest');
  });

  it('accepts "supporter" as a valid Role', () => {
    const role: Role = 'supporter';
    expect(role).toBe('supporter');
  });

  it('accepts "anonymous" as a valid Role', () => {
    const role: Role = 'anonymous';
    expect(role).toBe('anonymous');
  });

  it('has exactly 5 valid role values', () => {
    const validRoles: Role[] = ['admin', 'superAdmin', 'guest', 'supporter', 'anonymous'];
    expect(validRoles).toHaveLength(5);
  });
});

describe('Roles interface structural conformance', () => {
  it('constructs a valid Roles object with a houses map', () => {
    const roles: Roles = {
      houses: {
        'house-001': 'admin',
      },
    };
    expect(roles).toBeDefined();
    expect(roles.houses).toBeDefined();
  });

  it('houses map can hold a single house-to-role mapping', () => {
    const roles: Roles = {
      houses: {
        'house-abc': 'guest',
      },
    };
    expect(roles.houses['house-abc']).toBe('guest');
  });

  it('houses map can hold multiple house-to-role mappings', () => {
    const roles: Roles = {
      houses: {
        'house-001': 'admin',
        'house-002': 'guest',
        'house-003': 'superAdmin',
      },
    };
    expect(Object.keys(roles.houses)).toHaveLength(3);
    expect(roles.houses['house-001']).toBe('admin');
    expect(roles.houses['house-002']).toBe('guest');
    expect(roles.houses['house-003']).toBe('superAdmin');
  });

  it('houses map can be empty', () => {
    const roles: Roles = { houses: {} };
    expect(Object.keys(roles.houses)).toHaveLength(0);
  });

  it('a user can be a supporter in a house', () => {
    const roles: Roles = {
      houses: { 'house-x': 'supporter' },
    };
    expect(roles.houses['house-x']).toBe('supporter');
  });

  it('a user can be anonymous in a house', () => {
    const roles: Roles = {
      houses: { 'house-y': 'anonymous' },
    };
    expect(roles.houses['house-y']).toBe('anonymous');
  });

  it('looking up a non-existent house returns undefined', () => {
    const roles: Roles = { houses: { 'house-001': 'guest' } };
    expect(roles.houses['non-existent-house']).toBeUndefined();
  });

  it('role can be updated in the houses map', () => {
    const roles: Roles = {
      houses: { 'house-001': 'guest' },
    };
    roles.houses['house-001'] = 'admin';
    expect(roles.houses['house-001']).toBe('admin');
  });

  it('two Roles objects are independent', () => {
    const r1: Roles = { houses: { 'house-A': 'admin' } };
    const r2: Roles = { houses: { 'house-A': 'guest' } };
    expect(r1.houses['house-A']).toBe('admin');
    expect(r2.houses['house-A']).toBe('guest');
  });

  it('houses map entries can be deleted', () => {
    const roles: Roles = {
      houses: { 'house-001': 'admin', 'house-002': 'guest' },
    };
    delete roles.houses['house-001'];
    expect(roles.houses['house-001']).toBeUndefined();
    expect(Object.keys(roles.houses)).toHaveLength(1);
  });
});
