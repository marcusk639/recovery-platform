/**
 * EnhancedAuthService sign-in, anonymous sign-in, sign-out and reload against
 * the firebase-modular mocks (sign-up and password reset:
 * EnhancedAuthService-signup.oplog.test.ts).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10e): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains. Auth calls are not part of the log: each case pins the
 * returned AuthResult, the resulting auth state, and that no Firestore or
 * callable op was made. Failures are injected by replacing a method on the
 * shared auth instance, which both API shapes of the mock delegate to.
 *
 * The shared auth mock has no modular `reload(user)`; it is added here as a
 * delegate to user.reload() so the reload cases hold on both API shapes.
 * getCurrentUser / isAuthenticated / isAnonymous / isEmailVerified only read
 * auth.currentUser, which the migration does not change, and are not pinned.
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
  reload: (user: { reload: () => Promise<void> }) => user.reload(),
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import { EnhancedAuthService } from '../EnhancedAuthService';

const { instance, setCurrentUser } = jest.requireMock<{
  instance: Record<string, unknown> & { currentUser: unknown };
  setCurrentUser: (user: unknown) => void;
}>('@react-native-firebase/auth');

const original = { ...instance };

const rejectWith = (code: string) => async () => {
  throw Object.assign(new Error(code), { code });
};

beforeEach(() => {
  resetOpLog();
  setCurrentUser(null);
});

afterEach(() => {
  Object.assign(instance, original);
  jest.restoreAllMocks();
  expect(getOpLog()).toEqual([]);
});

describe('signInWithEmail', () => {
  it('signs in and returns the user', async () => {
    expect(await EnhancedAuthService.signInWithEmail('e1@example.com', 'pw')).toEqual({
      success: true,
      user: { uid: 'test-uid', email: 'e1@example.com' },
    });
  });

  it('returns the validation error for an invalid email', async () => {
    expect(await EnhancedAuthService.signInWithEmail('not-an-email', 'pw')).toEqual({
      success: false,
      error: 'Invalid email format',
    });
  });

  it('returns an error for a missing password', async () => {
    expect(await EnhancedAuthService.signInWithEmail('e2@example.com', '')).toEqual({
      success: false,
      error: 'Password is required',
    });
  });

  it('refuses the sixth attempt for one email within a minute', async () => {
    for (let i = 0; i < 5; i += 1) {
      await EnhancedAuthService.signInWithEmail('e3@example.com', 'pw');
    }

    expect(await EnhancedAuthService.signInWithEmail('e3@example.com', 'pw')).toEqual({
      success: false,
      error: 'Too many sign-in attempts. Please try again later.',
    });
  });

  it('reports a credential without a user as a failed sign-in', async () => {
    instance.signInWithEmailAndPassword = async () => ({ user: null });

    expect(await EnhancedAuthService.signInWithEmail('e4@example.com', 'pw')).toEqual({
      success: false,
      error: 'Sign in failed. Please check your credentials.',
    });
  });

  it('maps auth/user-not-found', async () => {
    instance.signInWithEmailAndPassword = rejectWith('auth/user-not-found');

    expect(await EnhancedAuthService.signInWithEmail('e5@example.com', 'pw')).toEqual({
      success: false,
      error: 'No account found with this email address.',
    });
  });

  it('maps auth/wrong-password', async () => {
    instance.signInWithEmailAndPassword = rejectWith('auth/wrong-password');

    expect(await EnhancedAuthService.signInWithEmail('e6@example.com', 'pw')).toEqual({
      success: false,
      error: 'Incorrect password. Please try again.',
    });
  });

  it('maps auth/invalid-email', async () => {
    instance.signInWithEmailAndPassword = rejectWith('auth/invalid-email');

    expect(await EnhancedAuthService.signInWithEmail('e7@example.com', 'pw')).toEqual({
      success: false,
      error: 'Invalid email address format.',
    });
  });

  it('maps auth/user-disabled', async () => {
    instance.signInWithEmailAndPassword = rejectWith('auth/user-disabled');

    expect(await EnhancedAuthService.signInWithEmail('e8@example.com', 'pw')).toEqual({
      success: false,
      error: 'This account has been disabled. Please contact support.',
    });
  });

  it('maps auth/too-many-requests', async () => {
    instance.signInWithEmailAndPassword = rejectWith('auth/too-many-requests');

    expect(await EnhancedAuthService.signInWithEmail('e9@example.com', 'pw')).toEqual({
      success: false,
      error: 'Too many failed attempts. Please try again later.',
    });
  });

  it('maps any other error to a generic failure', async () => {
    instance.signInWithEmailAndPassword = rejectWith('auth/invalid-credential');

    expect(await EnhancedAuthService.signInWithEmail('e10@example.com', 'pw')).toEqual({
      success: false,
      error: 'Sign in failed. Please try again.',
    });
  });
});

describe('signInAnonymously', () => {
  it('signs in anonymously and returns the user', async () => {
    expect(await EnhancedAuthService.signInAnonymously()).toEqual({
      success: true,
      user: { uid: 'anon-uid', isAnonymous: true },
    });
  });

  it('reports a credential without a user as a failure', async () => {
    instance.signInAnonymously = async () => ({ user: null });

    expect(await EnhancedAuthService.signInAnonymously()).toEqual({
      success: false,
      error: 'Anonymous sign in failed. Please try again.',
    });
  });

  it('reports a rejected sign-in as a failure', async () => {
    instance.signInAnonymously = rejectWith('auth/operation-not-allowed');

    expect(await EnhancedAuthService.signInAnonymously()).toEqual({
      success: false,
      error: 'Anonymous sign in failed. Please try again.',
    });
  });

  it('refuses the eleventh attempt within a minute', async () => {
    // A fresh window, independent of the attempts made by the cases above.
    jest.spyOn(Date, 'now').mockReturnValue(4_000_000_000_000);
    for (let i = 0; i < 10; i += 1) {
      await EnhancedAuthService.signInAnonymously();
    }

    expect(await EnhancedAuthService.signInAnonymously()).toEqual({
      success: false,
      error: 'Too many anonymous sign-in attempts. Please try again later.',
    });
  });
});

describe('signOut', () => {
  it('signs the current user out', async () => {
    setCurrentUser({ uid: 'u1' });

    expect(await EnhancedAuthService.signOut()).toEqual({ success: true });
    expect(instance.currentUser).toBeNull();
  });

  it('reports a rejected sign-out as a failure', async () => {
    instance.signOut = rejectWith('auth/network-request-failed');

    expect(await EnhancedAuthService.signOut()).toEqual({
      success: false,
      error: 'Sign out failed. Please try again.',
    });
  });
});

describe('reloadUser', () => {
  it('fails when nobody is signed in', async () => {
    expect(await EnhancedAuthService.reloadUser()).toEqual({
      success: false,
      error: 'No user is currently signed in.',
    });
  });

  it('reloads the current user and returns it', async () => {
    const user = { uid: 'u1', reloaded: false, reload: async () => {} };
    user.reload = async () => {
      user.reloaded = true;
    };
    setCurrentUser(user);

    const result = await EnhancedAuthService.reloadUser();

    expect(result).toEqual({ success: true, user });
    expect(user.reloaded).toBe(true);
  });

  it('reports a rejected reload as a failure', async () => {
    setCurrentUser({ uid: 'u1', reload: rejectWith('auth/user-token-expired') });

    expect(await EnhancedAuthService.reloadUser()).toEqual({
      success: false,
      error: 'Failed to reload user data.',
    });
  });
});
