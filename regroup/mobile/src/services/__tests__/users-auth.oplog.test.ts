/**
 * users.tsx auth-only functions against the firebase-modular mocks (Firestore
 * and callables: users.oplog.test.ts).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Auth calls are not part of the log:
 * each case pins the outcome and that no Firestore or callable op was made.
 * convertAnonymousUser (and createUser for an anonymous user) is not pinned:
 * the auth mock has no EmailAuthProvider or linkWithCredential.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import {
  anonymouslyLogin,
  createUserWithEmail,
  getAuthUser,
  refreshClaims,
  sendForgotPasswordEmail,
  signInWithEmail,
  signOut,
} from '../users';

const { instance, setCurrentUser } = jest.requireMock<{
  instance: { currentUser: unknown };
  setCurrentUser: (user: unknown) => void;
}>('@react-native-firebase/auth');

beforeEach(() => {
  resetOpLog();
  setCurrentUser(null);
});

afterEach(() => {
  expect(getOpLog()).toEqual([]);
});

describe('createUserWithEmail / anonymouslyLogin', () => {
  it('creates an email account and returns the credential', async () => {
    expect(await createUserWithEmail('a@example.com', 'pw')).toEqual({
      user: { uid: 'test-uid', email: 'a@example.com' },
    });
  });

  it('signs in anonymously and returns the credential', async () => {
    expect(await anonymouslyLogin()).toEqual({ user: { uid: 'anon-uid', isAnonymous: true } });
  });
});

describe('signInWithEmail', () => {
  it('signs in with the sanitized email and returns the credential', async () => {
    expect(await signInWithEmail('s1@example.com', 'pw')).toEqual({
      user: { uid: 'test-uid', email: 's1@example.com' },
    });
  });

  it('rejects an invalid email with auth/invalid-email', async () => {
    await expect(signInWithEmail('not-an-email', 'pw')).rejects.toMatchObject({
      code: 'auth/invalid-email',
    });
  });

  it('rejects a missing password', async () => {
    await expect(signInWithEmail('s2@example.com', '')).rejects.toThrow('Password is required.');
  });

  it('rejects the sixth attempt for one email within a minute', async () => {
    for (let i = 0; i < 5; i += 1) {
      await signInWithEmail('s3@example.com', 'pw');
    }

    await expect(signInWithEmail('s3@example.com', 'pw')).rejects.toMatchObject({
      code: 'auth/too-many-requests',
    });
  });
});

describe('signOut', () => {
  it('signs the current user out', async () => {
    setCurrentUser({ uid: 'u1' });

    await signOut();

    expect(instance.currentUser).toBeNull();
  });
});

describe('sendForgotPasswordEmail', () => {
  it('sends the reset email', async () => {
    await expect(sendForgotPasswordEmail('r1@example.com')).resolves.toBeUndefined();
  });

  it('rejects an invalid email with auth/invalid-email', async () => {
    await expect(sendForgotPasswordEmail('nope')).rejects.toMatchObject({
      code: 'auth/invalid-email',
    });
  });

  it('rejects the fourth attempt for one email within five minutes', async () => {
    for (let i = 0; i < 3; i += 1) {
      await sendForgotPasswordEmail('r2@example.com');
    }

    await expect(sendForgotPasswordEmail('r2@example.com')).rejects.toMatchObject({
      code: 'auth/too-many-requests',
    });
  });
});

describe('getAuthUser / refreshClaims', () => {
  const signedIn = () =>
    setCurrentUser({
      uid: 'u1',
      getIdToken: async (force: boolean) => `token-${force}`,
      getIdTokenResult: async (force: boolean) => ({ token: `token-${force}`, claims: {} }),
    });

  it('getAuthUser returns undefined when signed out', async () => {
    expect(await getAuthUser()).toBeUndefined();
  });

  it('getAuthUser reads the ID token result without forcing a refresh by default', async () => {
    signedIn();

    expect(await getAuthUser()).toEqual({ token: 'token-false', claims: {} });
  });

  it('getAuthUser forces a refresh when asked', async () => {
    signedIn();

    expect(await getAuthUser(true)).toEqual({ token: 'token-true', claims: {} });
  });

  it('refreshClaims force-refreshes the ID token', async () => {
    signedIn();

    expect(await refreshClaims()).toBe('token-true');
  });

  it('refreshClaims returns undefined when signed out', async () => {
    expect(await refreshClaims()).toBeUndefined();
  });
});
