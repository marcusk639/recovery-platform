// src/state/slices/__tests__/meetingsSlice.test.ts

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
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: [] }))),
  },
  callHttpsFunction: jest.fn(() => Promise.resolve({ data: [] })),
}));

// Mock the meeting service so async thunks don't touch Firebase
jest.mock('../../../services/meeting', () => ({
  searchForMeetings: jest.fn(),
  userIsAtMeeting: jest.fn(),
  addMeeting: jest.fn(),
  updateMeeting: jest.fn(),
  deleteMeeting: jest.fn(),
  meetingCollection: {},
}));

// Mock activity service (used inside checkIntoMeeting thunk)
jest.mock('../../../services/activity', () => ({
  logActivity: jest.fn(() => Promise.resolve()),
}));

import { configureStore } from '@reduxjs/toolkit';
import meetingsReducer, {
  clearMeetingError,
  resetCheckInStatus,
  clearMeetings,
  searchForMeetings,
  checkIntoMeeting,
  addMeeting,
  updateMeeting,
  deleteMeeting,
} from '../meetingsSlice';
import * as meetingService from '../../../services/meeting';
import { RatsMeeting } from '../../../entities/Meeting';

/**
 * Build a minimal plain RatsMeeting object.
 */
const makeMeeting = (id = 'm1'): RatsMeeting =>
  ({
    id,
    name: 'Test Meeting',
    time: '18:00',
    street: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    type: 'AA',
    day: 'Monday',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as RatsMeeting);

const makeStore = () =>
  configureStore({
    reducer: { meetings: meetingsReducer } as any,
    // Provide minimal state slices that checkIntoMeeting reads
    preloadedState: {
      meetings: meetingsReducer(undefined, { type: '@@INIT' }),
    } as any,
  });

describe('meetingsSlice', () => {
  const initialState = meetingsReducer(undefined, { type: '@@INIT' });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------
  describe('Initial State', () => {
    it('returns the correct initial state shape', () => {
      expect(initialState.meetings).toEqual([]);
      expect(initialState.searchingForMeetings).toBe(false);
      expect(initialState.searchingForMeetingsSuccessful).toBe(false);
      expect(initialState.searchingForMeetingsFailed).toBe(false);
      expect(initialState.checkingIn).toBe(false);
      expect(initialState.checkInSuccessful).toBe(false);
      expect(initialState.checkInFailed).toBe(false);
      expect(initialState.checkInError).toBeNull();
      expect(initialState.addingMeeting).toBe(false);
      expect(initialState.addingMeetingSuccessful).toBe(false);
      expect(initialState.addingMeetingFailed).toBe(false);
      expect(initialState.updatingMeeting).toBe(false);
      expect(initialState.updatingMeetingSuccessful).toBe(false);
      expect(initialState.updatingMeetingFailed).toBe(false);
      expect(initialState.deletingMeeting).toBe(false);
      expect(initialState.deletingMeetingSuccessful).toBe(false);
      expect(initialState.deletingMeetingFailed).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Synchronous reducers
  // ---------------------------------------------------------------------------
  describe('clearMeetingError', () => {
    it('clears error and all failure flags', () => {
      const dirtyState = {
        ...initialState,
        error: { message: 'something went wrong' },
        checkInError: 'check-in failed',
        searchingForMeetingsFailed: true,
        checkInFailed: true,
        addingMeetingFailed: true,
        updatingMeetingFailed: true,
        deletingMeetingFailed: true,
      };
      const state = meetingsReducer(dirtyState, clearMeetingError());
      expect(state.error).toBeNull();
      expect(state.checkInError).toBeNull();
      expect(state.searchingForMeetingsFailed).toBe(false);
      expect(state.checkInFailed).toBe(false);
      expect(state.addingMeetingFailed).toBe(false);
      expect(state.updatingMeetingFailed).toBe(false);
      expect(state.deletingMeetingFailed).toBe(false);
    });

    it('is a no-op when there is no error', () => {
      const state = meetingsReducer(initialState, clearMeetingError());
      expect(state.error).toBeNull();
      expect(state.checkInError).toBeNull();
    });
  });

  describe('resetCheckInStatus', () => {
    it('resets all check-in status fields', () => {
      const dirtyState = {
        ...initialState,
        checkingIn: true,
        checkInSuccessful: true,
        checkInFailed: true,
        checkInError: 'some error',
      };
      const state = meetingsReducer(dirtyState, resetCheckInStatus());
      expect(state.checkingIn).toBe(false);
      expect(state.checkInSuccessful).toBe(false);
      expect(state.checkInFailed).toBe(false);
      expect(state.checkInError).toBeNull();
    });

    it('is a no-op when check-in is already in idle state', () => {
      const state = meetingsReducer(initialState, resetCheckInStatus());
      expect(state.checkingIn).toBe(false);
      expect(state.checkInSuccessful).toBe(false);
      expect(state.checkInFailed).toBe(false);
      expect(state.checkInError).toBeNull();
    });
  });

  describe('clearMeetings', () => {
    it('clears the meetings array', () => {
      const stateWithMeetings = {
        ...initialState,
        meetings: [makeMeeting('m1'), makeMeeting('m2')],
      };
      const state = meetingsReducer(stateWithMeetings, clearMeetings());
      expect(state.meetings).toEqual([]);
    });

    it('is a no-op when meetings is already empty', () => {
      const state = meetingsReducer(initialState, clearMeetings());
      expect(state.meetings).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — searchForMeetings
  // ---------------------------------------------------------------------------
  describe('searchForMeetings thunk', () => {
    const searchInput = { location: {}, filters: {} } as any;

    it('sets searchingForMeetings=true on pending', () => {
      const state = meetingsReducer(
        initialState,
        searchForMeetings.pending('', searchInput),
      );
      expect(state.searchingForMeetings).toBe(true);
      expect(state.searchingForMeetingsSuccessful).toBe(false);
      expect(state.searchingForMeetingsFailed).toBe(false);
    });

    it('stores meetings and sets flags on fulfilled', () => {
      const meetings = [makeMeeting('m1'), makeMeeting('m2')];
      const action = searchForMeetings.fulfilled(meetings, '', searchInput);
      const state = meetingsReducer(initialState, action);
      expect(state.searchingForMeetings).toBe(false);
      expect(state.searchingForMeetingsSuccessful).toBe(true);
      expect(state.meetings).toHaveLength(2);
      expect(state.meetings[0].id).toBe('m1');
    });

    it('sets failure flags on rejected', () => {
      const action = searchForMeetings.rejected(
        new Error('Search failed'),
        '',
        searchInput,
      );
      const state = meetingsReducer(initialState, action);
      expect(state.searchingForMeetings).toBe(false);
      expect(state.searchingForMeetingsFailed).toBe(true);
      expect(state.error).toBeDefined();
    });

    it('dispatches searchForMeetings and stores results via real store', async () => {
      const meetings = [makeMeeting('m1')];
      (meetingService.searchForMeetings as jest.Mock).mockResolvedValueOnce(
        meetings,
      );
      const store = makeStore();
      await store.dispatch(searchForMeetings(searchInput));
      const s = store.getState().meetings;
      expect(s.meetings[0].id).toBe('m1');
      expect(s.searchingForMeetingsSuccessful).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — checkIntoMeeting
  // ---------------------------------------------------------------------------
  describe('checkIntoMeeting thunk', () => {
    const meeting = makeMeeting('m1');
    const checkInInput = { userLocation: {}, meetingLocation: {} } as any;
    const arg = { checkInInput, meeting };

    it('sets checkingIn=true on pending', () => {
      const state = meetingsReducer(
        initialState,
        checkIntoMeeting.pending('', arg),
      );
      expect(state.checkingIn).toBe(true);
      expect(state.checkInSuccessful).toBe(false);
      expect(state.checkInFailed).toBe(false);
      expect(state.checkInError).toBeNull();
    });

    it('sets checkInSuccessful=true on fulfilled', () => {
      const action = checkIntoMeeting.fulfilled({ success: true }, '', arg);
      const state = meetingsReducer(initialState, action);
      expect(state.checkingIn).toBe(false);
      expect(state.checkInSuccessful).toBe(true);
    });

    it('sets checkInFailed=true and checkInError on rejected', () => {
      const action = checkIntoMeeting.rejected(
        new Error('Check-in failed'),
        '',
        arg,
      );
      const state = meetingsReducer(initialState, action);
      expect(state.checkingIn).toBe(false);
      expect(state.checkInFailed).toBe(true);
      expect(state.checkInError).toBe('Check-in failed');
    });

    it('uses fallback error message on rejected with no message', () => {
      const error = new Error('');
      error.message = '';
      const action = checkIntoMeeting.rejected(error, '', arg);
      const state = meetingsReducer(initialState, action);
      expect(state.checkInError).toBe('Check-in failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — addMeeting
  // ---------------------------------------------------------------------------
  describe('addMeeting thunk', () => {
    const meeting = makeMeeting('m-new');
    const arg = { meeting, isGuest: false };

    it('sets addingMeeting=true on pending', () => {
      const state = meetingsReducer(initialState, addMeeting.pending('', arg));
      expect(state.addingMeeting).toBe(true);
      expect(state.addingMeetingSuccessful).toBe(false);
      expect(state.addingMeetingFailed).toBe(false);
    });

    it('adds meeting to the list and sets success flags on fulfilled', () => {
      const action = addMeeting.fulfilled(meeting, '', arg);
      const state = meetingsReducer(initialState, action);
      expect(state.addingMeeting).toBe(false);
      expect(state.addingMeetingSuccessful).toBe(true);
      expect(state.meetings).toHaveLength(1);
      expect(state.meetings[0].id).toBe('m-new');
    });

    it('sets failure flags on rejected', () => {
      const action = addMeeting.rejected(new Error('Add failed'), '', arg);
      const state = meetingsReducer(initialState, action);
      expect(state.addingMeeting).toBe(false);
      expect(state.addingMeetingFailed).toBe(true);
      expect(state.error).toBeDefined();
    });

    it('dispatches addMeeting and appends to store via real store', async () => {
      (meetingService.addMeeting as jest.Mock).mockResolvedValueOnce(meeting);
      const store = makeStore();
      await store.dispatch(addMeeting(arg));
      expect(store.getState().meetings.meetings[0].id).toBe('m-new');
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — updateMeeting
  // ---------------------------------------------------------------------------
  describe('updateMeeting thunk', () => {
    const arg = { meetingId: 'm1', updates: { name: 'Updated' } };

    it('sets updatingMeeting=true on pending', () => {
      const state = meetingsReducer(
        initialState,
        updateMeeting.pending('', arg),
      );
      expect(state.updatingMeeting).toBe(true);
      expect(state.updatingMeetingSuccessful).toBe(false);
      expect(state.updatingMeetingFailed).toBe(false);
    });

    it('updates the matching meeting in place on fulfilled', () => {
      const meeting = makeMeeting('m1');
      const stateWithMeeting = { ...initialState, meetings: [meeting] };
      const action = updateMeeting.fulfilled(
        { meetingId: 'm1', updates: { name: 'Updated' } },
        '',
        arg,
      );
      const state = meetingsReducer(stateWithMeeting, action);
      expect(state.updatingMeeting).toBe(false);
      expect(state.updatingMeetingSuccessful).toBe(true);
      expect(state.meetings[0].name).toBe('Updated');
    });

    it('does nothing to meetings array when meetingId is not found', () => {
      const meeting = makeMeeting('m1');
      const stateWithMeeting = { ...initialState, meetings: [meeting] };
      const action = updateMeeting.fulfilled(
        { meetingId: 'nonexistent', updates: { name: 'X' } },
        '',
        { meetingId: 'nonexistent', updates: { name: 'X' } },
      );
      const state = meetingsReducer(stateWithMeeting, action);
      expect(state.meetings[0].name).toBe('Test Meeting');
    });

    it('sets failure flags on rejected', () => {
      const action = updateMeeting.rejected(
        new Error('Update failed'),
        '',
        arg,
      );
      const state = meetingsReducer(initialState, action);
      expect(state.updatingMeeting).toBe(false);
      expect(state.updatingMeetingFailed).toBe(true);
    });

    it('dispatches updateMeeting and mutates store state via real store', async () => {
      (meetingService.updateMeeting as jest.Mock).mockResolvedValueOnce(
        undefined,
      );
      const store = configureStore({
        reducer: { meetings: meetingsReducer } as any,
        preloadedState: {
          meetings: { ...initialState, meetings: [makeMeeting('m1')] },
        } as any,
      });
      await store.dispatch(
        updateMeeting({ meetingId: 'm1', updates: { name: 'Updated' } }),
      );
      expect(store.getState().meetings.meetings[0].name).toBe('Updated');
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — deleteMeeting
  // ---------------------------------------------------------------------------
  describe('deleteMeeting thunk', () => {
    it('sets deletingMeeting=true on pending', () => {
      const state = meetingsReducer(
        initialState,
        deleteMeeting.pending('', 'm1'),
      );
      expect(state.deletingMeeting).toBe(true);
      expect(state.deletingMeetingSuccessful).toBe(false);
      expect(state.deletingMeetingFailed).toBe(false);
    });

    it('removes the meeting from the list on fulfilled', () => {
      const m1 = makeMeeting('m1');
      const m2 = makeMeeting('m2');
      const stateWithMeetings = { ...initialState, meetings: [m1, m2] };
      const action = deleteMeeting.fulfilled('m1', '', 'm1');
      const state = meetingsReducer(stateWithMeetings, action);
      expect(state.deletingMeeting).toBe(false);
      expect(state.deletingMeetingSuccessful).toBe(true);
      expect(state.meetings).toHaveLength(1);
      expect(state.meetings[0].id).toBe('m2');
    });

    it('sets failure flags on rejected', () => {
      const action = deleteMeeting.rejected(
        new Error('Delete failed'),
        '',
        'm1',
      );
      const state = meetingsReducer(initialState, action);
      expect(state.deletingMeeting).toBe(false);
      expect(state.deletingMeetingFailed).toBe(true);
    });

    it('dispatches deleteMeeting and removes from store via real store', async () => {
      (meetingService.deleteMeeting as jest.Mock).mockResolvedValueOnce(
        undefined,
      );
      const store = configureStore({
        reducer: { meetings: meetingsReducer } as any,
        preloadedState: {
          meetings: { ...initialState, meetings: [makeMeeting('m1')] },
        } as any,
      });
      await store.dispatch(deleteMeeting('m1'));
      expect(store.getState().meetings.meetings).toHaveLength(0);
    });
  });
});
