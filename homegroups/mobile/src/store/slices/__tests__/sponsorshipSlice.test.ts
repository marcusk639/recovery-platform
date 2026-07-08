/**
 * Tests for sponsorshipSlice — regression coverage for the rejectWithValue
 * migration (Task 4): every thunk's `.rejected` action must carry its error
 * on `action.payload` (a sanitized string), not on RTK's default
 * `action.error.message`, and the slice's `.rejected` reducers must read
 * `state.error` from `action.payload`.
 */

import {configureStore} from '@reduxjs/toolkit';
import sponsorshipReducer, {
  fetchGroupSponsorships,
  fetchSponsorshipAnalytics,
  createNewSponsorship,
  fetchGroupSponsors,
  requestSponsorship,
  acceptSponsorshipRequest,
  rejectSponsorshipRequest,
  updateSponsorAvailability,
} from '../sponsorshipSlice';

// ─── Module-level mock infrastructure ─────────────────────────────────────────

jest.mock('../../../models/MemberModel', () => ({
  MemberModel: {
    getGroupMembers: jest.fn(() => Promise.resolve([])),
  },
}));

// A single chained Firestore mock: collection/doc/where/orderBy all return
// the same chain object; the terminal async operations (get/set/update/add)
// are individually controllable jest.fn()s.
const mockGet = jest.fn();
const mockSet = jest.fn(() => Promise.resolve());
const mockUpdate = jest.fn(() => Promise.resolve());
const mockAdd = jest.fn(() => Promise.resolve({id: 'new-doc-id'}));

const firestoreChain: any = {};
firestoreChain.collection = jest.fn(() => firestoreChain);
firestoreChain.doc = jest.fn(() => firestoreChain);
firestoreChain.where = jest.fn(() => firestoreChain);
firestoreChain.orderBy = jest.fn(() => firestoreChain);
firestoreChain.get = mockGet;
firestoreChain.set = mockSet;
firestoreChain.update = mockUpdate;
firestoreChain.add = mockAdd;

jest.mock('@react-native-firebase/firestore', () => {
  const fn: any = () => firestoreChain;
  fn.FieldValue = {
    serverTimestamp: jest.fn(() => ({})),
  };
  fn.Timestamp = {
    now: jest.fn(() => ({toDate: () => new Date()})),
    fromDate: jest.fn((d: Date) => ({toDate: () => d})),
  };
  return fn;
});

const mockAuthState: {currentUser: {uid: string; displayName: string} | null} =
  {
    currentUser: {uid: 'user-1', displayName: 'Test User'},
  };

jest.mock('@react-native-firebase/auth', () => {
  return () => mockAuthState;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStore() {
  return configureStore({
    reducer: {sponsorship: sponsorshipReducer},
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sponsorshipSlice thunks — rejectWithValue error contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.currentUser = {uid: 'user-1', displayName: 'Test User'};
    mockGet.mockResolvedValue({empty: true, docs: [], data: () => undefined});
    mockSet.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
    mockAdd.mockResolvedValue({id: 'new-doc-id'});
  });

  it('fetchGroupSponsorships: rejects with a payload string (not error.message) when Firestore throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Firestore permission denied'));

    const store = buildStore();
    const result = await store.dispatch(
      fetchGroupSponsorships('group-1') as any,
    );

    expect(result.type).toBe('sponsorship/fetchGroupSponsorships/rejected');
    expect(result.payload).toBe('Firestore permission denied');
    expect(result.error.message).not.toBe('Firestore permission denied');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Firestore permission denied');
  });

  it('fetchSponsorshipAnalytics: rejects with a payload string when Firestore throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Analytics query failed'));

    const store = buildStore();
    const result = await store.dispatch(
      fetchSponsorshipAnalytics('group-1') as any,
    );

    expect(result.type).toBe('sponsorship/fetchAnalytics/rejected');
    expect(result.payload).toBe('Analytics query failed');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Analytics query failed');
  });

  it('createNewSponsorship: rejects with a payload string when Firestore throws', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Write denied'));

    const store = buildStore();
    const result = await store.dispatch(
      createNewSponsorship({
        groupId: 'group-1',
        sponsorId: 'sponsor-1',
        sponseeId: 'sponsee-1',
      }) as any,
    );

    expect(result.type).toBe('sponsorship/create/rejected');
    expect(result.payload).toBe('Write denied');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Write denied');
  });

  it('fetchGroupSponsors: rejects with a payload string when MemberModel throws', async () => {
    const {MemberModel} = require('../../../models/MemberModel');
    MemberModel.getGroupMembers.mockRejectedValueOnce(
      new Error('Member lookup failed'),
    );

    const store = buildStore();
    const result = await store.dispatch(fetchGroupSponsors('group-1') as any);

    expect(result.type).toBe('sponsorship/fetchGroupSponsors/rejected');
    expect(result.payload).toBe('Member lookup failed');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Member lookup failed');
  });

  it('requestSponsorship: rejects with a payload string when the model call throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Firestore query timed out'));

    const store = buildStore();
    const result = await store.dispatch(
      requestSponsorship({
        groupId: 'group-1',
        sponsorId: 'sponsor-1',
        message: 'Will you sponsor me?',
      }) as any,
    );

    expect(result.type).toBe('sponsorship/request/rejected');
    expect(result.payload).toBe('Firestore query timed out');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Firestore query timed out');
  });

  it('requestSponsorship: rejects with a payload string (no throw) when the user is unauthenticated', async () => {
    mockAuthState.currentUser = null;

    const store = buildStore();
    const result = await store.dispatch(
      requestSponsorship({
        groupId: 'group-1',
        sponsorId: 'sponsor-1',
        message: 'Will you sponsor me?',
      }) as any,
    );

    expect(result.type).toBe('sponsorship/request/rejected');
    expect(result.payload).toBe('User not authenticated');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('User not authenticated');
  });

  it('acceptSponsorshipRequest: rejects with a payload string when the model call throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Request lookup failed'));

    const store = buildStore();
    const result = await store.dispatch(
      acceptSponsorshipRequest({
        groupId: 'group-1',
        requestId: 'request-1',
      }) as any,
    );

    expect(result.type).toBe('sponsorship/acceptRequest/rejected');
    expect(result.payload).toBe('Request lookup failed');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Request lookup failed');
  });

  it('rejectSponsorshipRequest: rejects with a payload string when the model call throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Request lookup failed'));

    const store = buildStore();
    const result = await store.dispatch(
      rejectSponsorshipRequest({
        groupId: 'group-1',
        requestId: 'request-1',
      }) as any,
    );

    expect(result.type).toBe('sponsorship/rejectRequest/rejected');
    expect(result.payload).toBe('Request lookup failed');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('Request lookup failed');
  });

  it('updateSponsorAvailability: rejects with a payload string when the model call throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('User doc read failed'));

    const store = buildStore();
    const result = await store.dispatch(
      updateSponsorAvailability({
        groupId: 'group-1',
        isAvailable: true,
      }) as any,
    );

    expect(result.type).toBe('sponsorship/updateAvailability/rejected');
    expect(result.payload).toBe('User doc read failed');

    const state = store.getState().sponsorship;
    expect(state.error).toBe('User doc read failed');
  });
});
