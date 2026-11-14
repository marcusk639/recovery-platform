/**
 * account.ts deleteMyAccount against the firebase-modular mocks.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10e): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains. The deleteAccount callable is in the log; auth is not,
 * so each case pins the settled outcome, the credential the fake user was
 * re-authenticated with, whether its token was force-refreshed and whether
 * the session ends signed out.
 *
 * The shared auth mock has no EmailAuthProvider and no modular
 * reauthenticateWithCredential(user, credential) or reload(user). They are
 * added here on both API shapes; the user-scoped ones delegate to the fake
 * user, like the mock's own getIdToken(user, ...).
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => {
  const base = require('../../../__mocks__/firebase-modular/auth');
  const EmailAuthProvider = {
    credential: (email: string, password: string) => ({ providerId: 'password', email, password }),
  };
  const auth = Object.assign(() => base.default(), { EmailAuthProvider });
  return {
    ...base,
    default: auth,
    EmailAuthProvider,
    reauthenticateWithCredential: (
      user: { reauthenticateWithCredential: (c: unknown) => Promise<unknown> },
      credential: unknown,
    ) => user.reauthenticateWithCredential(credential),
    reload: (user: { reload: () => Promise<void> }) => user.reload(),
  };
});
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import {
  deleteMyAccount,
  DELETION_UNCONFIRMED_CODE,
  DELETION_UNCONFIRMED_MESSAGE,
} from '../account';

const { instance, setCurrentUser } = jest.requireMock<{
  instance: Record<string, unknown> & { currentUser: unknown };
  setCurrentUser: (user: unknown) => void;
}>('@react-native-firebase/auth');

const original = { ...instance };

const authError = (code: string) => Object.assign(new Error(code), { code });

interface FakeUserOptions {
  email?: string | null;
  reauthError?: Error;
  tokenError?: Error;
  reloadError?: Error;
}

/** Signs in a fake user that keeps what was done to it. */
function signIn({
  email = 'a@example.com',
  reauthError,
  tokenError,
  reloadError,
}: FakeUserOptions = {}) {
  const user = {
    uid: 'u1',
    email,
    reauthenticatedWith: undefined as unknown,
    forcedRefresh: false,
    reauthenticateWithCredential: async (credential: unknown) => {
      if (reauthError) throw reauthError;
      user.reauthenticatedWith = credential;
      return { user };
    },
    getIdToken: async (force?: boolean) => {
      if (tokenError) throw tokenError;
      user.forcedRefresh = force === true;
      return 'token';
    },
    reload: async () => {
      if (reloadError) throw reloadError;
    },
  };
  setCurrentUser(user);
  return user;
}

beforeEach(() => {
  resetOpLog();
  setCurrentUser(null);
});

afterEach(() => {
  Object.assign(instance, original);
});

describe('deleteMyAccount preconditions', () => {
  it('rejects when nobody is signed in', async () => {
    await expect(deleteMyAccount('pw')).rejects.toThrow('No signed-in user');
    expect(getOpLog()).toEqual([]);
  });

  it('rejects when the signed-in user has no email', async () => {
    const user = signIn({ email: null });

    await expect(deleteMyAccount('pw')).rejects.toThrow('No signed-in user');
    expect(getOpLog()).toEqual([]);
    expect(instance.currentUser).toBe(user);
  });
});

describe('deleteMyAccount success', () => {
  it('re-authenticates, force-refreshes the token, calls deleteAccount, then signs out', async () => {
    const user = signIn();

    await expect(deleteMyAccount('pw')).resolves.toBeUndefined();

    expect(user.reauthenticatedWith).toEqual({
      providerId: 'password',
      email: 'a@example.com',
      password: 'pw',
    });
    expect(user.forcedRefresh).toBe(true);
    expect(getOpLog()).toEqual([{ op: 'call', path: 'deleteAccount' }]);
    expect(instance.currentUser).toBeNull();
  });

  it('still resolves when the final sign-out fails', async () => {
    signIn();
    instance.signOut = async () => {
      throw authError('auth/network-request-failed');
    };

    await expect(deleteMyAccount('pw')).resolves.toBeUndefined();
    expect(getOpLog()).toEqual([{ op: 'call', path: 'deleteAccount' }]);
  });
});

describe('deleteMyAccount re-auth failures', () => {
  it('rethrows a wrong password without checking the account or calling', async () => {
    const user = signIn({
      reauthError: authError('auth/wrong-password'),
      reloadError: authError('auth/user-not-found'),
    });

    await expect(deleteMyAccount('bad')).rejects.toMatchObject({ code: 'auth/wrong-password' });
    expect(getOpLog()).toEqual([]);
    expect(instance.currentUser).toBe(user);
  });

  it('resolves and signs out when the account is confirmed gone', async () => {
    signIn({
      reauthError: authError('auth/user-not-found'),
      reloadError: authError('auth/user-not-found'),
    });

    await expect(deleteMyAccount('pw')).resolves.toBeUndefined();
    expect(getOpLog()).toEqual([]);
    expect(instance.currentUser).toBeNull();
  });

  it('rethrows the re-auth error when the account still exists', async () => {
    const user = signIn({ reauthError: authError('auth/invalid-credential') });

    await expect(deleteMyAccount('pw')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(getOpLog()).toEqual([]);
    expect(instance.currentUser).toBe(user);
  });

  it('signs out and rejects as unconfirmed when existence cannot be known', async () => {
    signIn({
      reauthError: authError('auth/user-disabled'),
      reloadError: authError('auth/user-disabled'),
    });

    await expect(deleteMyAccount('pw')).rejects.toMatchObject({
      code: DELETION_UNCONFIRMED_CODE,
      message: DELETION_UNCONFIRMED_MESSAGE,
    });
    expect(getOpLog()).toEqual([]);
    expect(instance.currentUser).toBeNull();
  });
});

describe('deleteMyAccount token and callable failures', () => {
  it('rethrows a failed token refresh without calling when the account exists', async () => {
    const user = signIn({ tokenError: authError('auth/network-request-failed') });

    await expect(deleteMyAccount('pw')).rejects.toMatchObject({
      code: 'auth/network-request-failed',
    });
    expect(getOpLog()).toEqual([]);
    expect(instance.currentUser).toBe(user);
  });

  it('rethrows the callable error when the account still exists', async () => {
    const user = signIn();
    failNext('call', authError('functions/internal'), 'deleteAccount');

    await expect(deleteMyAccount('pw')).rejects.toMatchObject({ code: 'functions/internal' });
    expect(getOpLog()).toEqual([{ op: 'call', path: 'deleteAccount' }]);
    expect(instance.currentUser).toBe(user);
  });

  it('resolves and signs out when the callable failed but the account is gone', async () => {
    signIn({ reloadError: authError('auth/user-not-found') });
    failNext('call', authError('functions/deadline-exceeded'), 'deleteAccount');

    await expect(deleteMyAccount('pw')).resolves.toBeUndefined();
    expect(getOpLog()).toEqual([{ op: 'call', path: 'deleteAccount' }]);
    expect(instance.currentUser).toBeNull();
  });

  it('signs out and rejects as unconfirmed when the callable failed and reload cannot tell', async () => {
    signIn({ reloadError: authError('auth/user-token-expired') });
    failNext('call', authError('functions/deadline-exceeded'), 'deleteAccount');

    await expect(deleteMyAccount('pw')).rejects.toMatchObject({ code: DELETION_UNCONFIRMED_CODE });
    expect(getOpLog()).toEqual([{ op: 'call', path: 'deleteAccount' }]);
    expect(instance.currentUser).toBeNull();
  });

  it('treats an unrecognised reload error as the account still existing', async () => {
    const user = signIn({ reloadError: authError('auth/network-request-failed') });
    failNext('call', authError('functions/internal'), 'deleteAccount');

    await expect(deleteMyAccount('pw')).rejects.toMatchObject({ code: 'functions/internal' });
    expect(instance.currentUser).toBe(user);
  });
});
