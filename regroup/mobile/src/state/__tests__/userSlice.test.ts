// src/state/__tests__/userSlice.test.ts
//
// Covers the `login` createAsyncThunk in userSlice — success, wrong-password,
// network error, and pending state transitions. Pattern mirrors
// src/state/slices/__tests__/meetingsSlice.test.ts (real store + dispatched
// thunk for success, action-creator simulation for pending/rejected).
//
// Roadmap item: P2-TEST-1 (docs/superpowers/specs/2026-05-23-current-roadmap.md)

// Mock firebase-setup before any imports that depend on it
jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      get: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn()),
  },
}));

// Mock the users service so the login thunk doesn't touch real Firebase auth
jest.mock('../../services/users', () => ({
  signInWithEmail: jest.fn(),
  anonymouslyLogin: jest.fn(),
  signOut: jest.fn(),
  getUser: jest.fn(),
  createUser: jest.fn(),
  createAnonUser: jest.fn(),
  updateUser: jest.fn(),
  getAuthUser: jest.fn(),
  requestAccountVerification: jest.fn(),
  convertFirebaseUserToRatsUser: jest.fn(),
  userCollection: {},
}));

// Mock user utility — returns the firebase user object the thunk hands to
// userService.getUser via `.uid`.
jest.mock('../../util/user', () => ({
  getFirebaseUserFromUserCredential: jest.fn(),
}));

// Mock subscription utility
jest.mock('../../util/subscription', () => ({
  subscriptionStatus: jest.fn(),
}));

// Mock @react-native-firebase/auth (consumed transitively)
jest.mock('@react-native-firebase/auth', () => () => ({
  signInWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
  currentUser: null,
}));

// Mock navigation service (logout thunk path references it; safe defaults)
jest.mock('../../navigation/service', () => ({
  __esModule: true,
  default: {
    navigate: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
  },
  navigationRef: { current: null },
  improvedNavigationService: {},
}));

// Mock @react-navigation/native
jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    reset: jest.fn(payload => payload),
    navigate: jest.fn(),
  },
  createRef: jest.fn(() => ({ current: null })),
}));

import { configureStore } from '@reduxjs/toolkit';
import userReducer, { login } from '../slices/userSlice';
import * as userService from '../../services/users';
import { getFirebaseUserFromUserCredential } from '../../util/user';
import { subscriptionStatus } from '../../util/subscription';

const makeStore = () =>
  configureStore({
    reducer: { user: userReducer } as any,
    preloadedState: {
      user: userReducer(undefined, { type: '@@INIT' }),
    } as any,
  });

describe('userSlice — login thunk', () => {
  const initialState = userReducer(undefined, { type: '@@INIT' });
  const credentials = { email: 'user@example.com', password: 'hunter2' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // pending
  // ---------------------------------------------------------------------------
  describe('login.pending', () => {
    it('clears loginFailed, sets loggingIn=true, loading=false, error=null', () => {
      const dirtyState = {
        ...initialState,
        loginFailed: true,
        loading: true,
        error: { message: 'previous failure' },
      };
      const state = userReducer(dirtyState, login.pending('', credentials));
      expect(state.loggingIn).toBe(true);
      expect(state.loading).toBe(false);
      expect(state.loginFailed).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // fulfilled (success)
  // ---------------------------------------------------------------------------
  describe('login.fulfilled (success)', () => {
    it('reducer stores user + token and flips logged-in flags', () => {
      const payload = {
        user: { uid: 'user-123', email: 'user@example.com' },
        token: { claims: { admin: false } },
      };
      const action = login.fulfilled(payload as any, '', credentials);
      // Seed a "logging in" state to prove the reducer clears it.
      const pendingState = userReducer(
        initialState,
        login.pending('', credentials),
      );
      const state = userReducer(pendingState, action);
      expect(state.loggedIn).toBe(true);
      expect(state.loggingIn).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.loginFailed).toBe(false);
      expect(state.anonymous).toBe(false);
      expect(state.error).toBeNull();
      expect(state.user).toEqual(payload.user);
      expect(state.token).toEqual(payload.token);
    });

    it('dispatching the thunk against a real store stores user data on success', async () => {
      const credential = { user: { uid: 'user-123' } };
      const firebaseUser = { uid: 'user-123' };
      const userEntity = { uid: 'user-123', email: 'user@example.com' };
      const token = { claims: { admin: false } };

      (userService.signInWithEmail as jest.Mock).mockResolvedValueOnce(
        credential,
      );
      (getFirebaseUserFromUserCredential as jest.Mock).mockReturnValueOnce(
        firebaseUser,
      );
      (userService.getUser as jest.Mock).mockResolvedValueOnce(userEntity);
      (userService.getAuthUser as jest.Mock).mockResolvedValueOnce(token);
      (subscriptionStatus as jest.Mock).mockReturnValueOnce('active');

      const store = makeStore();
      const result = await store.dispatch(login(credentials));

      expect(result.type).toBe('user/login/fulfilled');
      expect(userService.signInWithEmail).toHaveBeenCalledWith(
        credentials.email,
        credentials.password,
      );
      expect(userService.getUser).toHaveBeenCalledWith('user-123');

      const state = store.getState().user;
      expect(state.loggedIn).toBe(true);
      expect(state.loggingIn).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.loginFailed).toBe(false);
      expect(state.user).toEqual(userEntity);
      expect(state.token).toEqual(token);
      expect(state.subscriptionStatus).toBe('active');
    });
  });

  // ---------------------------------------------------------------------------
  // rejected — wrong password
  // ---------------------------------------------------------------------------
  describe('login.rejected (wrong password)', () => {
    it('reducer sets loginFailed=true, loggingIn=false, loading=false', () => {
      const wrongPasswordError = Object.assign(new Error('wrong password'), {
        code: 'auth/wrong-password',
        name: 'FirebaseError',
      });
      const action = login.rejected(wrongPasswordError, '', credentials);
      const pendingState = userReducer(
        initialState,
        login.pending('', credentials),
      );
      const state = userReducer(pendingState, action);
      expect(state.loggedIn).toBe(false);
      expect(state.loggingIn).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.loginFailed).toBe(true);
      expect(state.error).toBeDefined();
    });

    it('dispatching the thunk against a real store sets loginFailed when signInWithEmail rejects with auth/wrong-password', async () => {
      const wrongPasswordError = Object.assign(new Error('wrong password'), {
        code: 'auth/wrong-password',
        name: 'FirebaseError',
      });
      (userService.signInWithEmail as jest.Mock).mockRejectedValueOnce(
        wrongPasswordError,
      );

      const store = makeStore();
      const result = await store.dispatch(login(credentials));

      expect(result.type).toBe('user/login/rejected');
      // Downstream calls must NOT happen when sign-in fails up front
      expect(getFirebaseUserFromUserCredential).not.toHaveBeenCalled();
      expect(userService.getUser).not.toHaveBeenCalled();
      expect(userService.getAuthUser).not.toHaveBeenCalled();

      const state = store.getState().user;
      expect(state.loggedIn).toBe(false);
      expect(state.loggingIn).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.loginFailed).toBe(true);
      expect(state.user).toBeNull();
      // The error payload should reflect the failure cause
      expect(state.error?.message).toBe('wrong password');
    });
  });

  // ---------------------------------------------------------------------------
  // rejected — network error
  // ---------------------------------------------------------------------------
  describe('login.rejected (network error)', () => {
    it('dispatching the thunk against a real store sets loginFailed on a generic network error', async () => {
      (userService.signInWithEmail as jest.Mock).mockRejectedValueOnce(
        new Error('Network request failed'),
      );

      const store = makeStore();
      const result = await store.dispatch(login(credentials));

      expect(result.type).toBe('user/login/rejected');

      const state = store.getState().user;
      expect(state.loggedIn).toBe(false);
      expect(state.loggingIn).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.loginFailed).toBe(true);
      expect(state.error?.message).toBe('Network request failed');
    });
  });
});
