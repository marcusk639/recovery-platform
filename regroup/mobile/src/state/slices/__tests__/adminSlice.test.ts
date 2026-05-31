// src/state/slices/__tests__/adminSlice.test.ts

// Mock firebase-setup before any imports that depend on it
jest.mock('../../../../firebase-setup', () => ({
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

import { configureStore } from '@reduxjs/toolkit';
import adminReducer, {
  setUserAsAdmin,
  selectAdmin,
  clearSelectedAdmin,
  clearError,
  resetAdminState,
  selectAllAdmins,
  selectAdminById,
  selectUserAsAdmin,
  selectSelectedAdmin,
  selectHouseAdmins,
  selectAdminLoading,
  selectAdminError,
  AdminState,
} from '../adminSlice';

/**
 * Build a minimal plain-object Admin (bypasses the class constructor
 * so we don't trigger createAdminId in the entity).
 */
const makeAdmin = (id = 'a1') =>
  ({
    id,
    firstName: 'Test',
    lastName: 'Admin',
    email: 'admin@example.com',
    userId: 'u1',
    houseIds: ['h1'],
    superAdmin: [],
    phoneNumber: '5551234567',
    uniqueAdminAttribute: 'admin',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as any);

const makeStore = () => configureStore({ reducer: { admin: adminReducer } });

describe('adminSlice', () => {
  const initialState = adminReducer(undefined, { type: '@@INIT' });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------
  describe('Initial State', () => {
    it('returns the correct initial state shape', () => {
      expect(initialState.admins).toEqual({});
      expect(initialState.selectedAdmin).toBeNull();
      expect(initialState.userAsAdmin).toBeNull();
      expect(initialState.houseAdmins).toEqual({});
      expect(initialState.loading).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Synchronous reducers
  // ---------------------------------------------------------------------------
  describe('setUserAsAdmin', () => {
    it('sets userAsAdmin to the provided admin', () => {
      const admin = makeAdmin('a1');
      const state = adminReducer(initialState, setUserAsAdmin(admin));
      expect(state.userAsAdmin?.id).toBe('a1');
    });

    it('replaces an existing userAsAdmin', () => {
      const first = makeAdmin('a1');
      const stateWithAdmin = { ...initialState, userAsAdmin: first };
      const second = makeAdmin('a2');
      const state = adminReducer(stateWithAdmin, setUserAsAdmin(second));
      expect(state.userAsAdmin?.id).toBe('a2');
    });
  });

  describe('selectAdmin', () => {
    it('sets selectedAdmin to the provided admin', () => {
      const admin = makeAdmin('a1');
      const state = adminReducer(initialState, selectAdmin(admin));
      expect(state.selectedAdmin?.id).toBe('a1');
    });

    it('replaces an existing selectedAdmin', () => {
      const first = makeAdmin('a1');
      const stateWithSelected = { ...initialState, selectedAdmin: first };
      const second = makeAdmin('a2');
      const state = adminReducer(stateWithSelected, selectAdmin(second));
      expect(state.selectedAdmin?.id).toBe('a2');
    });
  });

  describe('clearSelectedAdmin', () => {
    it('sets selectedAdmin to null', () => {
      const admin = makeAdmin('a1');
      const stateWithSelected = { ...initialState, selectedAdmin: admin };
      const state = adminReducer(stateWithSelected, clearSelectedAdmin());
      expect(state.selectedAdmin).toBeNull();
    });

    it('is a no-op when selectedAdmin is already null', () => {
      const state = adminReducer(initialState, clearSelectedAdmin());
      expect(state.selectedAdmin).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears the error field', () => {
      const stateWithError = { ...initialState, error: 'something went wrong' };
      const state = adminReducer(stateWithError, clearError());
      expect(state.error).toBeNull();
    });

    it('is a no-op when there is no error', () => {
      const state = adminReducer(initialState, clearError());
      expect(state.error).toBeNull();
    });
  });

  describe('resetAdminState', () => {
    it('resets the entire state to initial values', () => {
      const dirtyState: AdminState = {
        admins: { a1: makeAdmin('a1') },
        selectedAdmin: makeAdmin('a1'),
        userAsAdmin: makeAdmin('a1'),
        houseAdmins: { a1: makeAdmin('a1') },
        loading: true,
        error: 'some error',
      };
      const state = adminReducer(dirtyState, resetAdminState());
      expect(state).toEqual(initialState);
    });
  });

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------
  describe('selectors', () => {
    const admin1 = makeAdmin('a1');
    const admin2 = makeAdmin('a2');
    const storeState = {
      admin: {
        admins: { a1: admin1, a2: admin2 },
        selectedAdmin: admin1,
        userAsAdmin: admin2,
        houseAdmins: { a1: admin1 },
        loading: true,
        error: 'err',
      } as AdminState,
    };

    it('selectAllAdmins returns the admins map', () => {
      expect(selectAllAdmins(storeState)).toEqual({ a1: admin1, a2: admin2 });
    });

    it('selectAdminById returns the correct admin', () => {
      expect(selectAdminById(storeState, 'a1')).toEqual(admin1);
      expect(selectAdminById(storeState, 'unknown')).toBeUndefined();
    });

    it('selectUserAsAdmin returns userAsAdmin', () => {
      expect(selectUserAsAdmin(storeState)).toEqual(admin2);
    });

    it('selectSelectedAdmin returns selectedAdmin', () => {
      expect(selectSelectedAdmin(storeState)).toEqual(admin1);
    });

    it('selectHouseAdmins returns houseAdmins map', () => {
      expect(selectHouseAdmins(storeState)).toEqual({ a1: admin1 });
    });

    it('selectAdminLoading returns loading flag', () => {
      expect(selectAdminLoading(storeState)).toBe(true);
    });

    it('selectAdminError returns error', () => {
      expect(selectAdminError(storeState)).toBe('err');
    });
  });

  // ---------------------------------------------------------------------------
  // Store integration — synchronous actions
  // ---------------------------------------------------------------------------
  describe('store integration', () => {
    it('dispatches setUserAsAdmin and reads back via store', () => {
      const store = makeStore();
      const admin = makeAdmin('a1');
      store.dispatch(setUserAsAdmin(admin));
      expect(store.getState().admin.userAsAdmin?.id).toBe('a1');
    });

    it('dispatches resetAdminState and returns to initial values', () => {
      const store = makeStore();
      store.dispatch(setUserAsAdmin(makeAdmin('a1')));
      store.dispatch(resetAdminState());
      expect(store.getState().admin.userAsAdmin).toBeNull();
    });
  });
});
