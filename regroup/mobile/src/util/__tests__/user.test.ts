// src/util/__tests__/user.test.ts
//
// Unit tests for user.ts.
// Exports tested:
//   - userIsAnonymous(user) → boolean
//   - mapValuesToUser(values, newUser, signUpRole?) → void (mutates newUser)
//   - isDemo(username) → boolean
//   - getFirebaseUserFromUserCredential(credential) → credential or internal user
//
// user.ts imports @react-native-firebase/auth — jest.setup.js already mocks it globally.

import { userIsAnonymous, mapValuesToUser, isDemo, getFirebaseUserFromUserCredential } from '../user';
import { User } from '../../entities/User';

// ─── userIsAnonymous ─────────────────────────────────────────────────────────

describe('userIsAnonymous', () => {
  it('returns false when user has a non-empty email', () => {
    const user = new User('uid-1');
    user.email = 'test@example.com';
    expect(userIsAnonymous(user)).toBe(false);
  });

  it('returns true when user email is null', () => {
    const user = new User('uid-anon');
    (user as any).email = null;
    expect(userIsAnonymous(user)).toBe(true);
  });

  it('returns true when user email is undefined', () => {
    const user = new User('uid-anon2');
    (user as any).email = undefined;
    expect(userIsAnonymous(user)).toBe(true);
  });

  it('returns false when email is an empty string (falsy but not null/undefined)', () => {
    // The function checks === null || === undefined — empty string passes through
    const user = new User('uid-empty');
    user.email = '';
    expect(userIsAnonymous(user)).toBe(false);
  });
});

// ─── isDemo ──────────────────────────────────────────────────────────────────

describe('isDemo', () => {
  it('returns true for the exact demo username', () => {
    expect(isDemo('demo_user@appdemo.net')).toBe(true);
  });

  it('returns false for a different email', () => {
    expect(isDemo('admin@example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isDemo('')).toBe(false);
  });

  it('is case-sensitive — returns false for upper-cased demo email', () => {
    expect(isDemo('Demo_User@appdemo.net')).toBe(false);
  });

  it('returns false for a partial match of the demo email', () => {
    expect(isDemo('demo_user@appdemo')).toBe(false);
  });
});

// ─── mapValuesToUser ─────────────────────────────────────────────────────────

describe('mapValuesToUser', () => {
  it('copies standard fields from values onto newUser', () => {
    const values: Partial<User> = {
      email: 'alice@example.com',
      password: 'secret123',
      termsOfService: true,
      keepUpdated: false,
      firstName: 'Alice',
      lastName: 'Smith',
    };
    const newUser: Partial<User> = {};
    mapValuesToUser(values, newUser);

    expect(newUser.email).toBe('alice@example.com');
    expect(newUser.password).toBe('secret123');
    expect(newUser.termsOfService).toBe(true);
    expect(newUser.keepUpdated).toBe(false);
    expect(newUser.firstName).toBe('Alice');
    expect(newUser.lastName).toBe('Smith');
  });

  it('always sets orgSetupCompleted to false', () => {
    const newUser: Partial<User> = {};
    mapValuesToUser({}, newUser);
    expect(newUser.orgSetupCompleted).toBe(false);
  });

  it('sets potentialSuperAdmin to true when signUpRole is "superAdmin"', () => {
    const newUser: Partial<User> = {};
    mapValuesToUser({}, newUser, 'superAdmin');
    expect(newUser.potentialSuperAdmin).toBe(true);
  });

  it('sets potentialSuperAdmin to false when signUpRole is "admin"', () => {
    const newUser: Partial<User> = {};
    mapValuesToUser({}, newUser, 'admin');
    expect(newUser.potentialSuperAdmin).toBe(false);
  });

  it('sets potentialSuperAdmin to undefined when no signUpRole provided', () => {
    const newUser: Partial<User> = {};
    mapValuesToUser({}, newUser);
    // signUpRole is undefined → undefined && ... short-circuits to undefined
    expect(newUser.potentialSuperAdmin).toBeUndefined();
  });

  it('copies undefined field values verbatim from values', () => {
    const newUser: Partial<User> = { email: 'old@test.com' };
    mapValuesToUser({ email: undefined }, newUser);
    expect(newUser.email).toBeUndefined();
  });
});

// ─── getFirebaseUserFromUserCredential ───────────────────────────────────────

describe('getFirebaseUserFromUserCredential', () => {
  it('returns the internal _user when present on the user object', () => {
    const internalUser = { uid: 'internal-uid', email: 'a@b.com' };
    const credential: any = {
      user: { _user: internalUser, uid: 'outer-uid' },
    };
    expect(getFirebaseUserFromUserCredential(credential)).toBe(internalUser);
  });

  it('returns the full credential when user has no _user property', () => {
    const credential: any = {
      user: { uid: 'real-uid' },
    };
    expect(getFirebaseUserFromUserCredential(credential)).toBe(credential);
  });

  it('returns the full credential when user._user is falsy (null)', () => {
    const credential: any = {
      user: { _user: null, uid: 'real-uid' },
    };
    expect(getFirebaseUserFromUserCredential(credential)).toBe(credential);
  });
});
