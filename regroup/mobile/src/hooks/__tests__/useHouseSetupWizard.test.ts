/**
 * useHouseSetupWizard Hook Tests
 *
 * Tests the hook that reads setup wizard state from the RTK store.
 * All tests wrap the hook in a Redux Provider with a configured store.
 */

import { renderHook, act } from '@testing-library/react-native';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// ── Slice imports ─────────────────────────────────────────────────────────────

import setupReducer, {
  setOrganization,
  setSelectedHouse,
  setGuests,
  setSelectedPhase,
} from '../../state/slices/setupSlice';
import adminReducer, { setUserAsAdmin } from '../../state/slices/adminSlice';

// ── Hook under test ───────────────────────────────────────────────────────────

import { useHouseSetupWizard } from '../useHouseSetupWizard';

// ── Firebase mocks (required by transitive imports) ──────────────────────────

jest.mock('../../firebase-setup', () => ({
  firestore: { collection: jest.fn(() => ({ doc: jest.fn(() => ({})) })) },
  functions: { httpsCallable: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      setup: setupReducer,
      admin: adminReducer,
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;

function makeWrapper(store: TestStore) {
  // Return a stable component reference so renderHook does not remount
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store }, children);
  return Wrapper;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useHouseSetupWizard', () => {
  describe('initial state', () => {
    it('returns null organization by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.organization).toBeNull();
    });

    it('returns null selectedHouse by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.selectedHouse).toBeNull();
    });

    it('returns empty houses object by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.houses).toEqual({});
    });

    it('returns null selectedPhase by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.selectedPhase).toBeNull();
    });

    it('returns empty guests object by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.guests).toEqual({});
    });

    it('returns null admin by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.admin).toBeNull();
    });

    it('returns submitting as false by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.submitting).toBe(false);
    });

    it('returns submittingSuccessful as false by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.submittingSuccessful).toBe(false);
    });

    it('returns submittingFailed as false by default', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.submittingFailed).toBe(false);
    });
  });

  describe('reflects store state changes', () => {
    it('reflects organization when dispatched to the store', () => {
      const store = makeStore();
      const org = { id: 'org-1', name: 'Test Org' } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setOrganization(org));
      });

      expect(result.current.organization).toEqual(org);
    });

    it('reflects selectedHouse when dispatched to the store', () => {
      const store = makeStore();
      const house = { id: 'house-1', name: 'Test House', disputes: {} } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setSelectedHouse(house));
      });

      expect(result.current.selectedHouse).toEqual(house);
    });

    it('reflects guests when dispatched to the store', () => {
      const store = makeStore();
      const guests = {
        'guest-1': { id: 'guest-1', firstName: 'Alice' },
      } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setGuests(guests));
      });

      expect(result.current.guests).toEqual(guests);
    });

    it('reflects admin (userAsAdmin) when dispatched to the store', () => {
      const store = makeStore();
      const admin = { id: 'admin-1', email: 'admin@test.com' } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setUserAsAdmin(admin));
      });

      expect(result.current.admin).toEqual(admin);
    });

    it('reflects selectedPhase when dispatched to the store', () => {
      const store = makeStore();
      const phase = { id: 'phase-1', name: 'Phase 1' } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setSelectedPhase(phase));
      });

      expect(result.current.selectedPhase).toEqual(phase);
    });
  });

  describe('return shape', () => {
    it('exposes all expected keys', () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      const keys = Object.keys(result.current);
      expect(keys).toContain('organization');
      expect(keys).toContain('houses');
      expect(keys).toContain('selectedHouse');
      expect(keys).toContain('selectedPhase');
      expect(keys).toContain('guests');
      expect(keys).toContain('admin');
      expect(keys).toContain('submitting');
      expect(keys).toContain('submittingSuccessful');
      expect(keys).toContain('submittingFailed');
    });
  });
});
