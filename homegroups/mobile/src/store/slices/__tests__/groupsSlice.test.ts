/**
 * Tests for groupsSlice — focusing on MC-6:
 * searchGroups with coordinates must call the searchGroupsByLocation Cloud Function
 * instead of performing a naive Firestore collection scan.
 */

import {configureStore} from '@reduxjs/toolkit';
import groupsReducer, {searchGroups} from '../groupsSlice';

// ─── Module-level mock infrastructure ─────────────────────────────────────────

// Mock syncUserClaims (imported by groupsSlice) to avoid the transitive import
// of config.ts which calls firestore.settings() on module load.
jest.mock('../../../services/firebase/auth', () => ({
  syncUserClaims: jest.fn(() => Promise.resolve({success: true, message: 'ok'})),
}));

// Mock GroupModel so no Firestore queries are made for text searches.
jest.mock('../../../models/GroupModel', () => ({
  GroupModel: {
    getUserGroups: jest.fn(() => Promise.resolve([])),
    getById: jest.fn(() => Promise.resolve(null)),
    searchGroups: jest.fn(() => Promise.resolve([])),
    fromFirestore: jest.fn((doc: any) => ({id: doc.id, ...doc.data()})),
  },
}));

jest.mock('../../../services/activityTracker', () => ({
  trackActivity: jest.fn(),
}));

// Firestore mock — we verify it is NOT called for coordinate-only searches.
const mockFirestoreGet = jest.fn();
const mockFirestoreCollection = jest.fn(() => ({
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: mockFirestoreGet,
  doc: jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({exists: false, data: () => null})),
    set: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn: any = () => ({collection: mockFirestoreCollection});
  fn.Timestamp = {
    now: jest.fn(() => ({toDate: () => new Date()})),
    fromDate: jest.fn((d: Date) => ({toDate: () => d})),
  };
  fn.FieldValue = {
    serverTimestamp: jest.fn(() => ({})),
    arrayUnion: jest.fn((...args: any[]) => args),
    arrayRemove: jest.fn((...args: any[]) => args),
    increment: jest.fn((n: number) => n),
    delete: jest.fn(() => ({})),
  };
  fn.CACHE_SIZE_UNLIMITED = -1;
  fn.settings = jest.fn();
  return fn;
});

// Functions mock — the callable mock is captured here so individual tests
// can configure its return value.
const mockCallable = jest.fn();
const mockFunctionsInstance = {
  httpsCallable: jest.fn(() => mockCallable),
  useEmulator: jest.fn(),
};

jest.mock('@react-native-firebase/functions', () => {
  return () => mockFunctionsInstance;
});

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: {uid: 'test-uid'},
    onAuthStateChanged: jest.fn(() => jest.fn()),
  };
  return () => mockAuth;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStore() {
  return configureStore({
    reducer: {groups: groupsReducer},
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchGroups thunk — coordinate-based search (MC-6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset httpsCallable to always return the shared mockCallable
    mockFunctionsInstance.httpsCallable.mockReturnValue(mockCallable);
  });

  it('calls the searchGroupsByLocation Cloud Function when coordinates are provided', async () => {
    const fakeGroups = [
      {id: 'g1', name: 'Group One'},
      {id: 'g2', name: 'Group Two'},
    ];

    mockCallable.mockResolvedValue({data: fakeGroups});

    const store = buildStore();
    const result = await store.dispatch(
      searchGroups({
        coordinates: {latitude: 37.7749, longitude: -122.4194, radiusKm: 10},
      }),
    );

    // Thunk should have succeeded
    expect(result.type).toBe('groups/search/fulfilled');

    // httpsCallable must have been called with the correct function name
    expect(mockFunctionsInstance.httpsCallable).toHaveBeenCalledWith(
      'searchGroupsByLocation',
    );

    // The callable must have received the right payload (keys Cloud Function expects)
    expect(mockCallable).toHaveBeenCalledWith({
      lat: 37.7749,
      lng: -122.4194,
      radius: 10,
      type: undefined,
    });

    // Results should be what the Cloud Function returned
    expect(result.payload).toEqual(fakeGroups);
  });

  it('forwards programType to the Cloud Function when provided', async () => {
    mockCallable.mockResolvedValue({data: []});

    const store = buildStore();
    await store.dispatch(
      searchGroups({
        coordinates: {
          latitude: 34.0522,
          longitude: -118.2437,
          radiusKm: 25,
          programType: 'AA',
        },
      }),
    );

    expect(mockCallable).toHaveBeenCalledWith({
      lat: 34.0522,
      lng: -118.2437,
      radius: 25,
      type: 'AA',
    });
  });

  it('returns an empty array (not an error) when Cloud Function returns empty data', async () => {
    mockCallable.mockResolvedValue({data: []});

    const store = buildStore();
    const result = await store.dispatch(
      searchGroups({
        coordinates: {latitude: 40.7128, longitude: -74.006},
      }),
    );

    expect(result.type).toBe('groups/search/fulfilled');
    expect(result.payload).toEqual([]);
  });

  it('does NOT call searchGroupsByLocation Cloud Function when only a text name is given', async () => {
    const {GroupModel} = require('../../../models/GroupModel');
    GroupModel.searchGroups.mockResolvedValue([]);

    const store = buildStore();
    await store.dispatch(searchGroups({name: 'Serenity'}));

    // Cloud Function callable should never have been invoked
    expect(mockCallable).not.toHaveBeenCalled();
    // GroupModel.searchGroups (text search) should have been called instead
    expect(GroupModel.searchGroups).toHaveBeenCalledWith('Serenity', 20);
  });

  it('does NOT perform a naive .limit(100).get() Firestore scan for coordinate-only searches', async () => {
    mockCallable.mockResolvedValue({data: []});
    mockFirestoreGet.mockResolvedValue({docs: []});

    const store = buildStore();
    await store.dispatch(
      searchGroups({
        coordinates: {latitude: 41.8781, longitude: -87.6298},
      }),
    );

    // A naive scan would have called firestore().collection('groups').get()
    // With the fix in place the Firestore collection helper is never touched for
    // coordinate-only searches.
    expect(mockFirestoreCollection).not.toHaveBeenCalled();
  });

  it('stores searchGroupsByLocation results in searchResults state', async () => {
    const fakeGroups = [{id: 'g1', name: 'Hopeful Hearts'}];
    mockCallable.mockResolvedValue({data: fakeGroups});

    const store = buildStore();
    await store.dispatch(
      searchGroups({
        coordinates: {latitude: 33.749, longitude: -84.388},
      }),
    );

    const state = store.getState().groups;
    expect(state.searchResults).toEqual(fakeGroups);
    expect(state.status).toBe('succeeded');
  });

  it('sets status to failed and stores error message when Cloud Function rejects', async () => {
    mockCallable.mockRejectedValue(new Error('Cloud Function unavailable'));

    const store = buildStore();
    const result = await store.dispatch(
      searchGroups({
        coordinates: {latitude: 29.7604, longitude: -95.3698},
      }),
    );

    expect(result.type).toBe('groups/search/rejected');
    const state = store.getState().groups;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Cloud Function unavailable');
  });
});
