/**
 * EnhancedAuthService sign-up, password reset and email verification against
 * the firebase-modular mocks (sign-in, sign-out and reload:
 * EnhancedAuthService.oplog.test.ts).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10e): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains. Auth calls are not part of the log: each case pins the
 * returned AuthResult, the profile written to the new user, and that no
 * Firestore or callable op was made. Failures are injected by replacing a
 * method on the shared auth instance, which both API shapes delegate to.
 *
 * The shared auth mock has no modular `updateProfile(user, profile)`; it is
 * added here as a delegate to user.updateProfile() so the sign-up cases hold
 * on both API shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => ({
  ...require('../../../__mocks__/firebase-modular/auth'),
  updateProfile: (user: { updateProfile: (profile: unknown) => Promise<void> }, profile: unknown) =>
    user.updateProfile(profile),
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import { EnhancedAuthService, SignUpData } from '../EnhancedAuthService';

const { instance, setCurrentUser } = jest.requireMock<{
  instance: Record<string, unknown>;
  setCurrentUser: (user: unknown) => void;
}>('@react-native-firebase/auth');

const original = { ...instance };

const rejectWith = (code: string) => async () => {
  throw Object.assign(new Error(code), { code });
};

/** A created user that keeps the profile it was given. */
function createdUser() {
  const user = {
    uid: 'u1',
    profile: undefined as unknown,
    updateProfile: async (_profile: unknown) => {},
  };
  user.updateProfile = async (profile: unknown) => {
    user.profile = profile;
  };
  instance.createUserWithEmailAndPassword = async () => ({ user });
  return user;
}

const signUp = (email: string, overrides: Partial<SignUpData> = {}): SignUpData => ({
  email,
  password: 'Passw0rd!',
  firstName: 'Ann',
  lastName: 'Lee',
  ...overrides,
});

beforeEach(() => {
  resetOpLog();
  setCurrentUser(null);
});

afterEach(() => {
  Object.assign(instance, original);
  expect(getOpLog()).toEqual([]);
});

describe('signUpWithEmail', () => {
  it('creates the account, sets the display name and returns the user', async () => {
    const user = createdUser();

    const result = await EnhancedAuthService.signUpWithEmail(signUp('n1@example.com'));

    expect(result).toEqual({ success: true, user, requiresEmailVerification: false });
    expect(user.profile).toEqual({ displayName: 'Ann Lee' });
  });

  it('returns every validation error joined', async () => {
    expect(
      await EnhancedAuthService.signUpWithEmail(
        signUp('n2@example.com', { password: 'short', lastName: 'Lee2' }),
      ),
    ).toEqual({
      success: false,
      error:
        'Password must be at least 8 characters, ' +
        'Last name: Name can only contain letters, spaces, hyphens, and apostrophes',
    });
  });

  it('refuses the fourth attempt for one email within five minutes', async () => {
    for (let i = 0; i < 3; i += 1) {
      createdUser();
      await EnhancedAuthService.signUpWithEmail(signUp('n3@example.com'));
    }

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n3@example.com'))).toEqual({
      success: false,
      error: 'Too many sign-up attempts. Please try again later.',
    });
  });

  it('reports a credential without a user as a failure', async () => {
    instance.createUserWithEmailAndPassword = async () => ({ user: null });

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n4@example.com'))).toEqual({
      success: false,
      error: 'Account creation failed. Please try again.',
    });
  });

  it('maps auth/email-already-in-use', async () => {
    instance.createUserWithEmailAndPassword = rejectWith('auth/email-already-in-use');

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n5@example.com'))).toEqual({
      success: false,
      error: 'An account with this email already exists.',
    });
  });

  it('maps auth/invalid-email', async () => {
    instance.createUserWithEmailAndPassword = rejectWith('auth/invalid-email');

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n6@example.com'))).toEqual({
      success: false,
      error: 'Invalid email address format.',
    });
  });

  it('maps auth/weak-password', async () => {
    instance.createUserWithEmailAndPassword = rejectWith('auth/weak-password');

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n7@example.com'))).toEqual({
      success: false,
      error: 'Password is too weak. Please choose a stronger password.',
    });
  });

  it('maps auth/operation-not-allowed', async () => {
    instance.createUserWithEmailAndPassword = rejectWith('auth/operation-not-allowed');

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n8@example.com'))).toEqual({
      success: false,
      error: 'Email/password accounts are not enabled.',
    });
  });

  it('maps any other error to a generic failure', async () => {
    instance.createUserWithEmailAndPassword = rejectWith('auth/network-request-failed');

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n9@example.com'))).toEqual({
      success: false,
      error: 'Account creation failed. Please try again.',
    });
  });

  it('reports a failed profile update as a failed sign-up', async () => {
    const user = createdUser();
    user.updateProfile = rejectWith('auth/network-request-failed');

    expect(await EnhancedAuthService.signUpWithEmail(signUp('n10@example.com'))).toEqual({
      success: false,
      error: 'Account creation failed. Please try again.',
    });
  });
});

describe('sendPasswordResetEmail', () => {
  it('sends the reset email', async () => {
    expect(await EnhancedAuthService.sendPasswordResetEmail('p1@example.com')).toEqual({
      success: true,
    });
  });

  it('returns the validation error for an invalid email', async () => {
    expect(await EnhancedAuthService.sendPasswordResetEmail('nope@')).toEqual({
      success: false,
      error: 'Invalid email format',
    });
  });

  it('refuses the fourth attempt for one email within five minutes', async () => {
    for (let i = 0; i < 3; i += 1) {
      await EnhancedAuthService.sendPasswordResetEmail('p2@example.com');
    }

    expect(await EnhancedAuthService.sendPasswordResetEmail('p2@example.com')).toEqual({
      success: false,
      error: 'Too many password reset attempts. Please try again later.',
    });
  });

  it('maps auth/user-not-found', async () => {
    instance.sendPasswordResetEmail = rejectWith('auth/user-not-found');

    expect(await EnhancedAuthService.sendPasswordResetEmail('p3@example.com')).toEqual({
      success: false,
      error: 'No account found with this email address.',
    });
  });

  it('maps auth/invalid-email', async () => {
    instance.sendPasswordResetEmail = rejectWith('auth/invalid-email');

    expect(await EnhancedAuthService.sendPasswordResetEmail('p4@example.com')).toEqual({
      success: false,
      error: 'Invalid email address format.',
    });
  });

  it('maps any other error to a generic failure', async () => {
    instance.sendPasswordResetEmail = rejectWith('auth/network-request-failed');

    expect(await EnhancedAuthService.sendPasswordResetEmail('p5@example.com')).toEqual({
      success: false,
      error: 'Password reset failed. Please try again.',
    });
  });
});

describe('sendEmailVerification', () => {
  it('reports success without sending anything', async () => {
    expect(await EnhancedAuthService.sendEmailVerification()).toEqual({ success: true });
  });
});
