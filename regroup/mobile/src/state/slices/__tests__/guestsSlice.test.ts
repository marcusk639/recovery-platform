// src/state/slices/__tests__/guestsSlice.test.ts

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
}));

// Mock the guest service so async thunks and Guest entity's createGuestId don't touch Firebase
jest.mock('../../../services/guest', () => ({
  getGuests: jest.fn(),
  getGuest: jest.fn(),
  updateGuest: jest.fn(),
  createGuest: jest.fn(),
  deleteGuest: jest.fn(),
  customizePhase: jest.fn(),
  createGuestId: jest.fn(() => 'mock-guest-id'),
  guestCollection: {},
  archiveCollection: {},
}));

import { configureStore } from '@reduxjs/toolkit';
import guestsReducer, {
  selectGuest,
  selectGuestById,
  setUserAsGuest,
  updateSelectedGuest,
  cacheGuests,
  cacheGuest,
  clearGuestError,
} from '../guestsSlice';
import { Guest } from '../../../entities/Guest';

/**
 * Build a minimal plain-object Guest (bypasses the class constructor
 * so we don't trigger createGuestId in the entity).
 */
const makeGuest = (id = 'g1'): Guest =>
  ({
    id,
    userId: 'u1',
    houseId: 'h1',
    status: 'active',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    email: 'test@example.com',
    phase: 'default',
    step: 1,
    sobrietyDate: '',
    drugOfChoice: '',
    isAdmin: false,
    infoEntered: false,
    hasJob: false,
    rentOwed: 0,
    choreFees: 0,
    dailyHabit: 0,
    supporters: [],
    jobs: [],
    version: 0,
    createdDate: '2024-01-01T00:00:00.000Z',
    lastUpdated: '2024-01-01T00:00:00.000Z',
  } as unknown as Guest);

const makeStore = () => configureStore({ reducer: { guests: guestsReducer } });

describe('guestsSlice', () => {
  // Derive initialState from the reducer itself — no hardcoding
  const initialState = guestsReducer(undefined, { type: '@@INIT' });

  describe('selectGuest', () => {
    it('sets selectedGuest when guest exists in provided guests map', () => {
      const guest = makeGuest('g1');
      const state = guestsReducer(
        initialState,
        selectGuest({ guestId: 'g1', guests: { g1: guest } }),
      );
      expect(state.selectedGuest).not.toBeNull();
      expect(state.selectedGuest?.id).toBe('g1');
    });

    it('falls back to state.guests when guests payload is null', () => {
      const guest = makeGuest('g2');
      const stateWithGuests = {
        ...initialState,
        guests: { g2: guest },
      };
      const state = guestsReducer(
        stateWithGuests,
        selectGuest({ guestId: 'g2', guests: null }),
      );
      expect(state.selectedGuest?.id).toBe('g2');
    });

    it('sets selectedGuest to null when guestId is not found', () => {
      const state = guestsReducer(
        initialState,
        selectGuest({ guestId: 'nonexistent', guests: {} }),
      );
      expect(state.selectedGuest).toBeNull();
    });
  });

  describe('clearGuestError', () => {
    it('clears error and resets all status fields to idle', () => {
      const stateWithError = {
        ...initialState,
        error: 'something went wrong',
        status: 'failed' as const,
        updateStatus: 'failed' as const,
        createStatus: 'failed' as const,
        deleteStatus: 'failed' as const,
        customizePhaseStatus: 'failed' as const,
      };
      const state = guestsReducer(stateWithError, clearGuestError());
      expect(state.error).toBeNull();
      expect(state.status).toBe('idle');
      expect(state.updateStatus).toBe('idle');
      expect(state.createStatus).toBe('idle');
      expect(state.deleteStatus).toBe('idle');
      expect(state.customizePhaseStatus).toBe('idle');
    });

    it('is a no-op when there is no error', () => {
      const state = guestsReducer(initialState, clearGuestError());
      expect(state.error).toBeNull();
      expect(state.status).toBe('idle');
    });
  });

  describe('updateSelectedGuest', () => {
    it('updates selectedGuest and caches in guests', () => {
      const guest = makeGuest('g3');
      const state = guestsReducer(initialState, updateSelectedGuest(guest));
      expect(state.selectedGuest?.id).toBe('g3');
      expect(state.guests['g3']?.id).toBe('g3');
    });
  });

  describe('cacheGuests', () => {
    it('merges a map of guests into state.guests', () => {
      const g1 = makeGuest('g1');
      const g2 = makeGuest('g2');
      const state = guestsReducer(initialState, cacheGuests({ g1, g2 }));
      expect(state.guests['g1']?.id).toBe('g1');
      expect(state.guests['g2']?.id).toBe('g2');
    });

    it('preserves existing guests when merging', () => {
      const existing = makeGuest('existing');
      const stateWithGuest = {
        ...initialState,
        guests: { existing },
      };
      const newGuest = makeGuest('new');
      const state = guestsReducer(
        stateWithGuest,
        cacheGuests({ new: newGuest }),
      );
      expect(state.guests['existing']?.id).toBe('existing');
      expect(state.guests['new']?.id).toBe('new');
    });
  });

  describe('cacheGuest', () => {
    it('adds a single guest to state.guests', () => {
      const guest = makeGuest('g5');
      const state = guestsReducer(initialState, cacheGuest(guest));
      expect(state.guests['g5']?.id).toBe('g5');
    });
  });

  describe('selectGuestById', () => {
    it('sets selectedGuestId', () => {
      const store = makeStore();
      store.dispatch(selectGuestById('guest-456'));
      expect(store.getState().guests.selectedGuestId).toBe('guest-456');
    });

    it('clears selectedGuestId when null is passed', () => {
      const store = makeStore();
      store.dispatch(selectGuestById('guest-456'));
      store.dispatch(selectGuestById(null));
      expect(store.getState().guests.selectedGuestId).toBeNull();
    });
  });

  describe('setUserAsGuest', () => {
    it('sets userAsGuest to the given guest', () => {
      const base = guestsReducer(undefined, { type: '@@INIT' });
      const guest = { id: 'g1', userId: 'u1', houseId: 'h1' } as any;
      const state = guestsReducer(base, setUserAsGuest(guest));
      expect(state.userAsGuest).toEqual(guest);
    });

    it('clears userAsGuest when dispatched with null', () => {
      const base = guestsReducer(undefined, { type: '@@INIT' });
      const preloaded = { ...base, userAsGuest: { id: 'g1' } as any };
      const state = guestsReducer(preloaded, setUserAsGuest(null));
      expect(state.userAsGuest).toBeNull();
    });
  });

  describe('Initial State', () => {
    it('returns the correct initial state shape', () => {
      expect(initialState.guests).toEqual({});
      expect(initialState.selectedGuest).toBeNull();
      expect(initialState.selectedGuestId).toBeNull();
      expect(initialState.userAsGuest).toBeNull();
      expect(initialState.status).toBe('idle');
      expect(initialState.error).toBeNull();
      expect(initialState.updateStatus).toBe('idle');
      expect(initialState.createStatus).toBe('idle');
      expect(initialState.deleteStatus).toBe('idle');
      expect(initialState.customizePhaseStatus).toBe('idle');
    });
  });
});
