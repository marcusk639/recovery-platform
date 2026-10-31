// src/state/slices/__tests__/userSlice.setupRecovery.test.ts
//
// Login/relaunch recovery for an operator whose houses were created but whose
// setup never finished (orgSetupCompleted false). The login thunks load the
// user through getUserFinishingSetup, which calls finishOperatorSetup only
// when the user doc records owned houses; on success the token is refreshed
// and the reloaded user routes as a completed operator; a failed refresh or
// reload never fails the login or sends the operator back to the wizard. When
// the callable fails, setupRecoveryFailed makes OrgSetup show a blocking
// retry panel instead of the wizard. Real thunks, users service, recovery
// service and navigation service; only Firebase and the user doc are faked.

const mockCallable = jest.fn();
jest.mock('../../../../firebase-setup', () => ({
  firestore: { collection: jest.fn(() => ({ doc: jest.fn() })) },
  functions: { httpsCallable: jest.fn(() => mockCallable) },
}));

const mockGetIdTokenResult = jest.fn();
// The users service calls the modular auth functions on getAuth(); they
// delegate to this instance. Looked up at call time: imports are hoisted.
jest.mock('@react-native-firebase/auth', () => {
  const instance = {
    currentUser: {
      getIdTokenResult: (...args: unknown[]) => mockGetIdTokenResult(...args),
    },
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ uid: 'op-uid' })),
  };
  return {
    __esModule: true,
    default: () => instance,
    getAuth: () => instance,
    signInWithEmailAndPassword: (_auth: unknown, ...args: unknown[]) =>
      instance.signInWithEmailAndPassword(...(args as [])),
    getIdTokenResult: (user: typeof instance.currentUser, ...args: unknown[]) =>
      user.getIdTokenResult(...args),
  };
});

jest.mock('../../../services/crud', () => ({ get: jest.fn(), update: jest.fn() }));
jest.mock('../../../services/house', () => ({}));
jest.mock('../../../services/guest', () => ({ guestCollection: {} }));
jest.mock('../../../services/admin', () => ({ adminCollection: {} }));
jest.mock('../../../services/storage', () => ({ uploadUserAvatar: jest.fn() }));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../util/subscription', () => ({ subscriptionStatus: jest.fn() }));
jest.mock('../../../util/user', () => ({
  getFirebaseUserFromUserCredential: jest.fn((credential: unknown) => credential),
}));
jest.mock('../../../navigation/service', () => ({
  __esModule: true,
  default: {},
  navigationRef: { current: null },
}));

import { configureStore } from '@reduxjs/toolkit';
import { functions } from '../../../../firebase-setup';
import * as crud from '../../../services/crud';
import { logException } from '../../../util/logging';
import improvedNavigationService from '../../../navigation/improved-navigation-service';
import { Routes } from '../../../navigation/types';
import userReducer, { autoLogin, login, logout } from '../userSlice';
import { retrySetupRecovery } from '../setupRecoveryThunk';

const UID = 'op-uid';
const incomplete = {
  id: UID,
  uid: UID,
  email: 'op@example.com',
  // The real interrupted-setup shape: isSuperAdmin is written only with the
  // onboarding flags, so before recovery only potentialSuperAdmin is set.
  isSuperAdmin: false,
  potentialSuperAdmin: true,
  orgSetupCompleted: false,
  housesOwned: ['h1'],
  subscriptionMetadata: { houses: { h1: {} } },
};
const completed = { ...incomplete, isAdmin: true, isSuperAdmin: true, orgSetupCompleted: true };

const buildStore = () => configureStore({ reducer: { user: userReducer } });
const routeFor = (user: unknown) => improvedNavigationService.getInitialNavigation(user as any);
const order: string[] = [];
let loginCount = 0;

beforeEach(() => {
  order.length = 0;
  mockGetIdTokenResult.mockImplementation(async (force: boolean) => {
    order.push(`token:${force}`);
    return { claims: {} };
  });
  mockCallable.mockImplementation(async () => {
    order.push('finishOperatorSetup');
    return { data: { completed: true, houseIds: ['h1'] } };
  });
});

const seedUserDocs = (...docs: unknown[]) => {
  docs.forEach((doc) =>
    (crud.get as jest.Mock).mockImplementationOnce(async () => {
      order.push('getUser');
      return doc;
    }),
  );
};

describe.each([
  ['autoLogin (relaunch)', () => autoLogin({ uid: UID } as any)],
  // A fresh email per call: signInWithEmail rate-limits attempts per email.
  ['login', () => login({ email: `op${++loginCount}@example.com`, password: 'password123' })],
])('%s — operator setup recovery', (_label, thunk) => {
  it('finishes setup, refreshes the token and routes as a completed operator', async () => {
    seedUserDocs(incomplete, completed);
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).toHaveBeenCalledWith('finishOperatorSetup');
    expect(order.slice(0, 4)).toEqual(['getUser', 'finishOperatorSetup', 'token:true', 'getUser']);
    const user = store.getState().user.user;
    expect(user?.orgSetupCompleted).toBe(true);
    expect(routeFor(user)).toMatchObject({
      initialRoute: Routes.Main,
      initialMainRoute: Routes.House,
    });
  });

  it('flags setupRecoveryFailed (OrgSetup blocks the wizard) when the callable fails', async () => {
    seedUserDocs(incomplete);
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'internal' }));
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(logException).toHaveBeenCalled();
    const user = store.getState().user.user;
    expect(user?.orgSetupCompleted).toBe(false);
    expect(store.getState().user.loggedIn).toBe(true);
    expect(store.getState().user.setupRecoveryFailed).toBe(true);
    expect(routeFor(user).initialRoute).toBe(Routes.Setup);
  });

  it('logs and ignores a token-refresh failure after recovery completed', async () => {
    seedUserDocs(incomplete, completed);
    mockGetIdTokenResult.mockImplementationOnce(async () => {
      order.push('token:rejected');
      throw new Error('token refresh failed');
    });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(order).toContain('token:rejected');
    expect(logException).toHaveBeenCalled();
    expect(store.getState().user.loggedIn).toBe(true);
    expect(store.getState().user.user?.orgSetupCompleted).toBe(true);
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
  });

  it('keeps the operator past setup when the reload throws', async () => {
    seedUserDocs(incomplete);
    (crud.get as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('firestore unavailable');
    });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(logException).toHaveBeenCalled();
    const user = store.getState().user.user;
    expect(store.getState().user.loggedIn).toBe(true);
    expect(user).toMatchObject({ orgSetupCompleted: true, isAdmin: true, isSuperAdmin: true });
    expect(routeFor(user).initialRoute).toBe(Routes.Main);
  });

  it('keeps the operator past setup when the reload still shows setup incomplete (replica lag)', async () => {
    seedUserDocs(incomplete, incomplete);
    const store = buildStore();
    await store.dispatch(thunk() as any);

    const user = store.getState().user.user;
    expect(store.getState().user.loggedIn).toBe(true);
    expect(user).toMatchObject({ orgSetupCompleted: true, isAdmin: true, isSuperAdmin: true });
    expect(routeFor(user).initialRoute).toBe(Routes.Main);
  });

  it('falls back to the setup wizard when the server had nothing to finish', async () => {
    seedUserDocs(incomplete);
    mockCallable.mockResolvedValueOnce({ data: { completed: false } });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(crud.get).toHaveBeenCalledTimes(1);
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Setup);
  });

  it('does not call finishOperatorSetup when the operator owns no houses', async () => {
    seedUserDocs({ ...incomplete, housesOwned: [], subscriptionMetadata: { houses: {} } });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).not.toHaveBeenCalled();
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Setup);
  });

  it('does not call finishOperatorSetup for a completed operator whose token has every house', async () => {
    seedUserDocs(completed);
    mockGetIdTokenResult.mockResolvedValue({
      claims: { admin: { h1: true }, superAdmin: { h1: true } },
    });
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).not.toHaveBeenCalled();
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Main);
  });

  it('repairs a completed operator whose added house has no claims, then refreshes the token', async () => {
    // An add-house claim grant failed after createHouses committed.
    seedUserDocs(completed, completed);
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(functions.httpsCallable).toHaveBeenCalledWith('finishOperatorSetup');
    expect(order).toEqual(expect.arrayContaining(['finishOperatorSetup', 'token:true']));
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Main);
  });

  it('skips the recovery token refresh and reload when the repair granted nothing', async () => {
    seedUserDocs(completed);
    mockCallable.mockResolvedValueOnce({ data: { completed: true, houseIds: [] } });
    await buildStore().dispatch(thunk() as any);
    expect(functions.httpsCallable).toHaveBeenCalledWith('finishOperatorSetup');
    expect(order).toEqual(['getUser', 'token:false', 'token:true']); // the thunk's own refresh
  });

  it('logs a failed claims read for a completed operator and still logs in', async () => {
    seedUserDocs(completed);
    mockGetIdTokenResult.mockRejectedValueOnce(new Error('token read failed'));
    const store = buildStore();
    await store.dispatch(thunk() as any);
    expect(logException).toHaveBeenCalled();
    expect(functions.httpsCallable).not.toHaveBeenCalled();
    expect(store.getState().user.loggedIn).toBe(true);
  });

  it('a failed repair for a completed operator does not flag setupRecoveryFailed', async () => {
    seedUserDocs(completed);
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'internal' }));
    const store = buildStore();
    await store.dispatch(thunk() as any);

    expect(logException).toHaveBeenCalled();
    expect(store.getState().user.loggedIn).toBe(true);
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Main);
  });
});

describe("retrySetupRecovery (SetupRecoveryPanel's Retry)", () => {
  const failedLogin = async () => {
    seedUserDocs(incomplete);
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'internal' }));
    const store = buildStore();
    await store.dispatch(autoLogin({ uid: UID } as any) as any);
    expect(store.getState().user.setupRecoveryFailed).toBe(true);
    return store;
  };

  it('on completed, refreshes the token, reloads the user and clears the flag', async () => {
    const store = await failedLogin();
    order.length = 0;
    seedUserDocs(completed);

    const result = await store.dispatch(retrySetupRecovery() as any);
    expect(result.type).toBe(retrySetupRecovery.fulfilled.type);
    expect(order.slice(0, 3)).toEqual(['finishOperatorSetup', 'token:true', 'getUser']);
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
    expect(store.getState().user.user?.orgSetupCompleted).toBe(true);
    expect(routeFor(store.getState().user.user).initialRoute).toBe(Routes.Main);
  });

  it('on failure, keeps the flag set', async () => {
    const store = await failedLogin();
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('y'), { code: 'unavailable' }));

    const result = await store.dispatch(retrySetupRecovery() as any);
    expect(result.type).toBe(retrySetupRecovery.rejected.type);
    expect(store.getState().user.setupRecoveryFailed).toBe(true);
    expect(store.getState().user.user?.orgSetupCompleted).toBe(false);
  });

  it('on incomplete, clears the flag so the wizard is shown', async () => {
    const store = await failedLogin();
    mockCallable.mockResolvedValueOnce({ data: { completed: false } });

    await store.dispatch(retrySetupRecovery() as any);
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
    expect(store.getState().user.user?.orgSetupCompleted).toBe(false);
  });

  it('without a uid, rejects without calling the server and keeps the flag set', async () => {
    const base = userReducer(undefined, { type: '@@INIT' });
    const store = configureStore({
      reducer: { user: userReducer },
      preloadedState: { user: { ...base, user: {}, setupRecoveryFailed: true } },
    });

    const result = await store.dispatch(retrySetupRecovery() as any);
    expect(result.type).toBe(retrySetupRecovery.rejected.type);
    expect(functions.httpsCallable).not.toHaveBeenCalled();
    expect(store.getState().user.setupRecoveryFailed).toBe(true);
  });

  it('is cleared on logout', async () => {
    const store = await failedLogin();
    store.dispatch({ type: logout.fulfilled.type, payload: { user: { id: 'anon' } } });
    expect(store.getState().user.setupRecoveryFailed).toBe(false);
  });
});
