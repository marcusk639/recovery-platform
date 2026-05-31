/**
 * @deprecated Migrate callers to meetingQueries.ts (useSearchMeetings, useCheckIntoMeeting, useAddMeeting).
 */
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RatsMeeting, MeetingSearchInput } from '../../entities/Meeting';
import * as meetingService from '../../services/meeting';
import { logActivity } from '../../services/activity';
import { logException } from '../../util/logging';
import {
  ActivityType,
  ActivityDataFactory,
} from '../../entities/ActivityModel';
import type { RootState } from '../store';

interface MeetingsState {
  meetings: RatsMeeting[];
  searchingForMeetings: boolean;
  searchingForMeetingsSuccessful: boolean;
  searchingForMeetingsFailed: boolean;
  checkingIn: boolean;
  checkInSuccessful: boolean;
  checkInFailed: boolean;
  checkInError: string | null;
  addingMeeting: boolean;
  addingMeetingSuccessful: boolean;
  addingMeetingFailed: boolean;
  updatingMeeting: boolean;
  updatingMeetingSuccessful: boolean;
  updatingMeetingFailed: boolean;
  deletingMeeting: boolean;
  deletingMeetingSuccessful: boolean;
  deletingMeetingFailed: boolean;
  error: any;
}

const initialState: MeetingsState = {
  meetings: [],
  searchingForMeetings: false,
  searchingForMeetingsSuccessful: false,
  searchingForMeetingsFailed: false,
  checkingIn: false,
  checkInSuccessful: false,
  checkInFailed: false,
  checkInError: null,
  addingMeeting: false,
  addingMeetingSuccessful: false,
  addingMeetingFailed: false,
  updatingMeeting: false,
  updatingMeetingSuccessful: false,
  updatingMeetingFailed: false,
  deletingMeeting: false,
  deletingMeetingSuccessful: false,
  deletingMeetingFailed: false,
  error: null,
};

// Async Thunks
export const searchForMeetings = createAsyncThunk<
  RatsMeeting[],
  MeetingSearchInput
>('meetings/searchForMeetings', async (searchInput: MeetingSearchInput) => {
  const meetings = await meetingService.searchForMeetings(searchInput);
  return meetings;
});

export const checkIntoMeeting = createAsyncThunk<
  any,
  {
    checkInInput: any;
    meeting: RatsMeeting;
    force?: boolean;
  }
>(
  'meetings/checkIntoMeeting',
  async ({ checkInInput, meeting, force }, { getState }) => {
    const result = await meetingService.userIsAtMeeting(checkInInput);

    const state = getState() as RootState;
    const guest = state.guests.userAsGuest || state.guests.selectedGuest;
    const house = state.houses.selectedHouse;
    const user = state.user.user;

    if (guest?.id && house?.id && user?.id) {
      logActivity(
        guest.id,
        house.id,
        ActivityType.MEETING,
        ActivityDataFactory.meeting(
          meeting.name || '',
          meeting.type || 'AA',
          60,
          meeting.id,
          meeting.online
            ? 'online'
            : `${meeting.city || ''}, ${meeting.state || ''}`,
        ),
        user.id,
      ).catch(err => logException(err));
    }

    return result;
  },
);

export const addMeeting = createAsyncThunk<
  RatsMeeting,
  { meeting: RatsMeeting; isGuest: boolean }
>('meetings/addMeeting', async ({ meeting, isGuest }) => {
  const newMeeting = await meetingService.addMeeting(meeting);
  return newMeeting;
});

export const updateMeeting = createAsyncThunk<
  { meetingId: string; updates: Partial<RatsMeeting> },
  {
    meetingId: string;
    updates: Partial<RatsMeeting>;
  }
>('meetings/updateMeeting', async ({ meetingId, updates }) => {
  await meetingService.updateMeeting(meetingId, updates);
  return { meetingId, updates };
});

export const deleteMeeting = createAsyncThunk<string, string>(
  'meetings/deleteMeeting',
  async (meetingId: string) => {
    // deleteMeeting expects a RatsMeeting object, so we need to fetch it first or pass a minimal object
    // For now, pass a minimal object with just the id
    await meetingService.deleteMeeting({ id: meetingId } as RatsMeeting);
    return meetingId;
  },
);

// Slice
const meetingsSlice = createSlice({
  name: 'meetings',
  initialState,
  reducers: {
    clearMeetingError: state => {
      state.error = null;
      state.checkInError = null;
      state.searchingForMeetingsFailed = false;
      state.checkInFailed = false;
      state.addingMeetingFailed = false;
      state.updatingMeetingFailed = false;
      state.deletingMeetingFailed = false;
    },
    resetCheckInStatus: state => {
      state.checkingIn = false;
      state.checkInSuccessful = false;
      state.checkInFailed = false;
      state.checkInError = null;
    },
    clearMeetings: state => {
      state.meetings = [];
    },
  },
  extraReducers: builder => {
    // Search For Meetings
    builder
      .addCase(searchForMeetings.pending, state => {
        state.searchingForMeetings = true;
        state.searchingForMeetingsSuccessful = false;
        state.searchingForMeetingsFailed = false;
      })
      .addCase(searchForMeetings.fulfilled, (state, action) => {
        state.searchingForMeetings = false;
        state.searchingForMeetingsSuccessful = true;
        state.meetings = action.payload;
      })
      .addCase(searchForMeetings.rejected, (state, action) => {
        state.searchingForMeetings = false;
        state.searchingForMeetingsFailed = true;
        state.error = action.error;
      });

    // Check Into Meeting
    builder
      .addCase(checkIntoMeeting.pending, state => {
        state.checkingIn = true;
        state.checkInSuccessful = false;
        state.checkInFailed = false;
        state.checkInError = null;
      })
      .addCase(checkIntoMeeting.fulfilled, state => {
        state.checkingIn = false;
        state.checkInSuccessful = true;
      })
      .addCase(checkIntoMeeting.rejected, (state, action) => {
        state.checkingIn = false;
        state.checkInFailed = true;
        state.checkInError = action.error.message || 'Check-in failed';
      });

    // Add Meeting
    builder
      .addCase(addMeeting.pending, state => {
        state.addingMeeting = true;
        state.addingMeetingSuccessful = false;
        state.addingMeetingFailed = false;
      })
      .addCase(addMeeting.fulfilled, (state, action) => {
        state.addingMeeting = false;
        state.addingMeetingSuccessful = true;
        if (action.payload) {
          state.meetings.push(action.payload);
        }
      })
      .addCase(addMeeting.rejected, (state, action) => {
        state.addingMeeting = false;
        state.addingMeetingFailed = true;
        state.error = action.error;
      });

    // Update Meeting
    builder
      .addCase(updateMeeting.pending, state => {
        state.updatingMeeting = true;
        state.updatingMeetingSuccessful = false;
        state.updatingMeetingFailed = false;
      })
      .addCase(updateMeeting.fulfilled, (state, action) => {
        state.updatingMeeting = false;
        state.updatingMeetingSuccessful = true;
        const { meetingId, updates } = action.payload;
        const index = state.meetings.findIndex(m => m.id === meetingId);
        if (index !== -1) {
          state.meetings[index] = { ...state.meetings[index], ...updates };
        }
      })
      .addCase(updateMeeting.rejected, (state, action) => {
        state.updatingMeeting = false;
        state.updatingMeetingFailed = true;
        state.error = action.error;
      });

    // Delete Meeting
    builder
      .addCase(deleteMeeting.pending, state => {
        state.deletingMeeting = true;
        state.deletingMeetingSuccessful = false;
        state.deletingMeetingFailed = false;
      })
      .addCase(deleteMeeting.fulfilled, (state, action) => {
        state.deletingMeeting = false;
        state.deletingMeetingSuccessful = true;
        state.meetings = state.meetings.filter(m => m.id !== action.payload);
      })
      .addCase(deleteMeeting.rejected, (state, action) => {
        state.deletingMeeting = false;
        state.deletingMeetingFailed = true;
        state.error = action.error;
      });
  },
});

export const { clearMeetingError, resetCheckInStatus, clearMeetings } =
  meetingsSlice.actions;

export default meetingsSlice.reducer;
