// src/state/slices/__tests__/housesSlice.test.ts

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
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn()),
  },
}));

import housesReducer, {
  selectHouse,
  selectHouseById,
  clearHouseError,
  resetSearchResults,
} from '../housesSlice';
import { configureStore } from '@reduxjs/toolkit';
import { House } from '../../../entities/House';

/**
 * Build a minimal plain-object House (bypasses the class constructor
 * so we don't trigger createHouseId in the entity).
 */
const makeHouse = (id = 'h1'): House =>
  ({
    id,
    timezone: '',
    ownerId: 'owner-1',
    lat: 40.7128,
    lng: -74.006,
    geohash: '',
    adminId: '',
    adminIds: [],
    superAdminIds: [],
    street: '123 Main St',
    city: 'New York',
    country: 'US',
    health: {},
    name: 'Test House',
    monthlyRent: 1000,
    weeklyRent: 250,
    currentCapacity: 2,
    maximumCapacity: 5,
    state: 'NY',
    zip: '10001',
    code: 'TEST01',
    avatar: '',
    imageUrl: '',
    depositsAndFees: 0,
    certified: false,
    phoneNumber: '5551234567',
    rentFrequency: 'both',
    pendingAdminInvites: [],
    pendingGuestInvites: [],
    subscriptionStatus: 'active',
    isDemoHouse: false,
    houseType: 'traditional',
    seniorPeerEmails: [],
    managerSetupType: 'operator-only',
    awaitingVerification: [],
    chores: {},
    phases: {},
    gender: '',
    disputes: {},
    issues: {},
    applications: {},
    complaints: {},
    rooms: {},
    baths: 1,
    wifi: false,
    rating: 3,
    stripeAccountId: undefined,
    stripeStatus: 'not_connected' as any,
    stripeConnectedAt: undefined,
    stripeLastSyncAt: undefined,
    stripeError: undefined,
    createdDate: '2024-01-01T00:00:00.000Z',
    lastUpdated: '2024-01-01T00:00:00.000Z',
  } as unknown as House);

const makeStore = () =>
  configureStore({
    reducer: { houses: housesReducer },
  });

describe('housesSlice', () => {
  // Derive initialState from the reducer itself — no hardcoding
  const initialState = housesReducer(undefined, { type: '@@INIT' });

  describe('selectHouse', () => {
    it('sets selectedHouse to the provided house', () => {
      const house = makeHouse('h1');
      const state = housesReducer(initialState, selectHouse(house));
      expect(state.selectedHouse).not.toBeNull();
      expect(state.selectedHouse?.id).toBe('h1');
    });

    it('replaces an already-selected house with the new one', () => {
      const first = makeHouse('h1');
      const stateWithSelected = {
        ...initialState,
        selectedHouse: first,
      };
      const second = makeHouse('h2');
      const state = housesReducer(stateWithSelected, selectHouse(second));
      expect(state.selectedHouse?.id).toBe('h2');
    });
  });

  describe('resetSearchResults', () => {
    it('clears searchedHouses', () => {
      const stateWithResults = {
        ...initialState,
        searchedHouses: [makeHouse('h1'), makeHouse('h2')],
      };
      const state = housesReducer(stateWithResults, resetSearchResults());
      expect(state.searchedHouses).toEqual([]);
    });

    it('is a no-op when searchedHouses is already empty', () => {
      const state = housesReducer(initialState, resetSearchResults());
      expect(state.searchedHouses).toEqual([]);
    });
  });

  describe('clearHouseError', () => {
    it('clears the error field', () => {
      const stateWithErrors = {
        ...initialState,
        error: { message: 'something went wrong' },
      };
      const state = housesReducer(stateWithErrors, clearHouseError());
      expect(state.error).toBeNull();
    });

    it('is a no-op when there is no error', () => {
      const state = housesReducer(initialState, clearHouseError());
      expect(state.error).toBeNull();
    });
  });

  describe('Initial State', () => {
    it('returns the correct initial state shape', () => {
      expect(initialState.houses).toEqual({});
      expect(initialState.selectedHouse).toBeNull();
      expect(initialState.selectedHouseId).toBeNull();
      expect(initialState.searchedHouses).toEqual([]);
      expect(initialState.loading).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  describe('selectHouseById', () => {
    let store: ReturnType<typeof makeStore>;

    beforeEach(() => {
      store = makeStore();
    });

    it('sets selectedHouseId without storing the full entity', () => {
      store.dispatch(selectHouseById('house-123'));
      expect(store.getState().houses.selectedHouseId).toBe('house-123');
    });

    it('clears selectedHouseId when null is passed', () => {
      store.dispatch(selectHouseById('house-123'));
      store.dispatch(selectHouseById(null));
      expect(store.getState().houses.selectedHouseId).toBeNull();
    });
  });
});
