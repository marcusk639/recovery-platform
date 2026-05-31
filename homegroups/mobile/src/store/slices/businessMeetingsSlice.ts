import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
  EntityState,
} from '@reduxjs/toolkit';
import {BusinessMeeting, AgendaItem} from '../../types/domain/business-meeting';
import {BusinessMeetingModel} from '../../models/BusinessMeetingModel';
import {RootState} from '../types';

// Define proper entity type
export interface BusinessMeetingEntity extends BusinessMeeting {
  id: string;
}

// Create entity adapter for better performance
const businessMeetingsAdapter = createEntityAdapter({
  selectId: (meeting: BusinessMeetingEntity) => meeting.id,
  sortComparer: (a, b) => b.date.getTime() - a.date.getTime(),
});

// State interface
export interface BusinessMeetingsState {
  meetings: EntityState<BusinessMeetingEntity, string>;
  groupMeetingIds: Record<string, string[]>;
  agendaItems: Record<string, AgendaItem[]>; // meetingId → items
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetchedGroup: Record<string, number>;
}

// Initial state
const initialState: BusinessMeetingsState = {
  meetings: businessMeetingsAdapter.getInitialState(),
  groupMeetingIds: {},
  agendaItems: {},
  status: 'idle',
  error: null,
  lastFetchedGroup: {},
};

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Fetch business meetings for a group
export const fetchBusinessMeetingsForGroup = createAsyncThunk<
  {groupId: string; meetings: BusinessMeeting[]},
  string,
  {state: RootState; rejectValue: string}
>('businessMeetings/fetchForGroup', async (groupId, {rejectWithValue}) => {
  try {
    const meetings = await BusinessMeetingModel.getByGroup(groupId);
    return {groupId, meetings};
  } catch (error: any) {
    return rejectWithValue(
      error.message || 'Failed to fetch business meetings',
    );
  }
});

// Fetch a single business meeting by ID
export const fetchBusinessMeetingById = createAsyncThunk<
  BusinessMeeting,
  string,
  {rejectValue: string}
>('businessMeetings/fetchById', async (meetingId, {rejectWithValue}) => {
  try {
    const meeting = await BusinessMeetingModel.getById(meetingId);
    if (!meeting) {
      return rejectWithValue('Business meeting not found');
    }
    return meeting;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to fetch business meeting');
  }
});

// Create a new business meeting
export const createBusinessMeeting = createAsyncThunk<
  BusinessMeeting,
  {
    groupId: string;
    date: Date;
    startTime: string;
    endTime?: string;
    location: string;
    isOnline: boolean;
    onlineLink?: string;
    chair: string;
    secretary: string;
    treasuryReportId?: string;
  },
  {rejectValue: string}
>('businessMeetings/create', async (data, {rejectWithValue}) => {
  try {
    const newMeeting = await BusinessMeetingModel.create(data.groupId, {
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      isOnline: data.isOnline,
      onlineLink: data.onlineLink,
      chair: data.chair,
      secretary: data.secretary,
      treasuryReportId: data.treasuryReportId,
    });
    return newMeeting;
  } catch (error: any) {
    return rejectWithValue(
      error.message || 'Failed to create business meeting',
    );
  }
});

// Update a business meeting
export const updateBusinessMeeting = createAsyncThunk<
  {meetingId: string; updates: Partial<BusinessMeeting>},
  {meetingId: string; updates: Partial<BusinessMeeting>},
  {rejectValue: string}
>(
  'businessMeetings/update',
  async ({meetingId, updates}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.update(meetingId, updates);
      return {meetingId, updates};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to update business meeting',
      );
    }
  },
);

// Delete a business meeting
export const deleteBusinessMeeting = createAsyncThunk<
  {groupId: string; meetingId: string},
  {groupId: string; meetingId: string},
  {rejectValue: string}
>(
  'businessMeetings/delete',
  async ({groupId, meetingId}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.delete(meetingId);
      return {groupId, meetingId};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to delete business meeting',
      );
    }
  },
);

// Update meeting status
export const updateMeetingStatus = createAsyncThunk<
  {meetingId: string; status: BusinessMeeting['status']},
  {meetingId: string; status: BusinessMeeting['status']},
  {rejectValue: string}
>(
  'businessMeetings/updateStatus',
  async ({meetingId, status}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.updateStatus(meetingId, status);
      return {meetingId, status};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to update meeting status',
      );
    }
  },
);

// Update attendees
export const updateAttendees = createAsyncThunk<
  {meetingId: string; attendees: string[]},
  {meetingId: string; attendees: string[]},
  {rejectValue: string}
>(
  'businessMeetings/updateAttendees',
  async ({meetingId, attendees}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.updateAttendees(meetingId, attendees);
      return {meetingId, attendees};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update attendees');
    }
  },
);

// Update minutes
export const updateMinutes = createAsyncThunk<
  {meetingId: string; minutes: string},
  {meetingId: string; minutes: string},
  {rejectValue: string}
>(
  'businessMeetings/updateMinutes',
  async ({meetingId, minutes}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.updateMinutes(meetingId, minutes);
      return {meetingId, minutes};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update minutes');
    }
  },
);

// Add agenda item
export const addAgendaItem = createAsyncThunk<
  {meetingId: string; item: AgendaItem},
  {meetingId: string; item: Omit<AgendaItem, 'id'>},
  {rejectValue: string}
>(
  'businessMeetings/addAgendaItem',
  async ({meetingId, item}, {rejectWithValue}) => {
    try {
      const newItem = await BusinessMeetingModel.addAgendaItem(meetingId, item);
      return {meetingId, item: newItem};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to add agenda item');
    }
  },
);

// Update agenda item
export const updateAgendaItem = createAsyncThunk<
  {meetingId: string; itemId: string; updates: Partial<AgendaItem>},
  {meetingId: string; itemId: string; updates: Partial<AgendaItem>},
  {rejectValue: string}
>(
  'businessMeetings/updateAgendaItem',
  async ({meetingId, itemId, updates}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.updateAgendaItem(meetingId, itemId, updates);
      return {meetingId, itemId, updates};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update agenda item');
    }
  },
);

// Remove agenda item
export const removeAgendaItem = createAsyncThunk<
  {meetingId: string; itemId: string},
  {meetingId: string; itemId: string},
  {rejectValue: string}
>(
  'businessMeetings/removeAgendaItem',
  async ({meetingId, itemId}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.removeAgendaItem(meetingId, itemId);
      return {meetingId, itemId};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to remove agenda item');
    }
  },
);

// Reorder agenda items
export const reorderAgendaItems = createAsyncThunk<
  {meetingId: string; itemOrders: {id: string; order: number}[]},
  {meetingId: string; itemOrders: {id: string; order: number}[]},
  {rejectValue: string}
>(
  'businessMeetings/reorderAgendaItems',
  async ({meetingId, itemOrders}, {rejectWithValue}) => {
    try {
      await BusinessMeetingModel.reorderAgendaItems(meetingId, itemOrders);
      return {meetingId, itemOrders};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to reorder agenda items');
    }
  },
);

// Create the slice
const businessMeetingsSlice = createSlice({
  name: 'businessMeetings',
  initialState,
  reducers: {
    clearBusinessMeetingsError: state => {
      state.error = null;
    },
    clearBusinessMeetings: state => {
      businessMeetingsAdapter.removeAll(state.meetings);
      state.groupMeetingIds = {};
      state.agendaItems = {};
      state.lastFetchedGroup = {};
    },
  },
  extraReducers: builder => {
    builder
      // Fetch meetings for group
      .addCase(fetchBusinessMeetingsForGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchBusinessMeetingsForGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, meetings} = action.payload;
        businessMeetingsAdapter.upsertMany(state.meetings, meetings);
        state.groupMeetingIds[groupId] = meetings.map(m => m.id);
        // Store agenda items
        meetings.forEach(m => {
          state.agendaItems[m.id] = m.agenda;
        });
        state.lastFetchedGroup[groupId] = Date.now();
        state.error = null;
      })
      .addCase(fetchBusinessMeetingsForGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Fetch single meeting
      .addCase(fetchBusinessMeetingById.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchBusinessMeetingById.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const meeting = action.payload;
        businessMeetingsAdapter.upsertOne(state.meetings, meeting);
        state.agendaItems[meeting.id] = meeting.agenda;
        state.error = null;
      })
      .addCase(fetchBusinessMeetingById.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Create meeting
      .addCase(createBusinessMeeting.pending, state => {
        state.status = 'loading';
      })
      .addCase(createBusinessMeeting.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const newMeeting = action.payload;
        businessMeetingsAdapter.addOne(state.meetings, newMeeting);
        if (state.groupMeetingIds[newMeeting.groupId]) {
          state.groupMeetingIds[newMeeting.groupId].unshift(newMeeting.id);
        } else {
          state.groupMeetingIds[newMeeting.groupId] = [newMeeting.id];
        }
        state.agendaItems[newMeeting.id] = [];
        state.error = null;
      })
      .addCase(createBusinessMeeting.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Update meeting
      .addCase(updateBusinessMeeting.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateBusinessMeeting.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {meetingId, updates} = action.payload;
        businessMeetingsAdapter.updateOne(state.meetings, {
          id: meetingId,
          changes: updates,
        });
        state.error = null;
      })
      .addCase(updateBusinessMeeting.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Delete meeting
      .addCase(deleteBusinessMeeting.pending, state => {
        state.status = 'loading';
      })
      .addCase(deleteBusinessMeeting.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, meetingId} = action.payload;
        businessMeetingsAdapter.removeOne(state.meetings, meetingId);
        if (state.groupMeetingIds[groupId]) {
          state.groupMeetingIds[groupId] = state.groupMeetingIds[
            groupId
          ].filter(id => id !== meetingId);
        }
        delete state.agendaItems[meetingId];
        state.error = null;
      })
      .addCase(deleteBusinessMeeting.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Update status
      .addCase(updateMeetingStatus.fulfilled, (state, action) => {
        const {meetingId, status} = action.payload;
        businessMeetingsAdapter.updateOne(state.meetings, {
          id: meetingId,
          changes: {status},
        });
      })
      // Update attendees
      .addCase(updateAttendees.fulfilled, (state, action) => {
        const {meetingId, attendees} = action.payload;
        businessMeetingsAdapter.updateOne(state.meetings, {
          id: meetingId,
          changes: {attendees},
        });
      })
      // Update minutes
      .addCase(updateMinutes.fulfilled, (state, action) => {
        const {meetingId, minutes} = action.payload;
        businessMeetingsAdapter.updateOne(state.meetings, {
          id: meetingId,
          changes: {minutes},
        });
      })
      // Add agenda item
      .addCase(addAgendaItem.fulfilled, (state, action) => {
        const {meetingId, item} = action.payload;
        if (!state.agendaItems[meetingId]) {
          state.agendaItems[meetingId] = [];
        }
        state.agendaItems[meetingId].push(item);
      })
      // Update agenda item
      .addCase(updateAgendaItem.fulfilled, (state, action) => {
        const {meetingId, itemId, updates} = action.payload;
        const items = state.agendaItems[meetingId];
        if (items) {
          const index = items.findIndex(i => i.id === itemId);
          if (index !== -1) {
            items[index] = {...items[index], ...updates};
          }
        }
      })
      // Remove agenda item
      .addCase(removeAgendaItem.fulfilled, (state, action) => {
        const {meetingId, itemId} = action.payload;
        if (state.agendaItems[meetingId]) {
          state.agendaItems[meetingId] = state.agendaItems[meetingId].filter(
            i => i.id !== itemId,
          );
        }
      })
      // Reorder agenda items
      .addCase(reorderAgendaItems.fulfilled, (state, action) => {
        const {meetingId, itemOrders} = action.payload;
        const items = state.agendaItems[meetingId];
        if (items) {
          itemOrders.forEach(({id, order}) => {
            const item = items.find(i => i.id === id);
            if (item) {
              item.order = order;
            }
          });
          // Re-sort by order
          items.sort((a, b) => a.order - b.order);
        }
      });
  },
});

// Selectors
const businessMeetingsSelectors =
  businessMeetingsAdapter.getSelectors<RootState>(
    state => state.businessMeetings.meetings,
  );

export const selectAllBusinessMeetings = businessMeetingsSelectors.selectAll;

export const selectBusinessMeetingById = (
  state: RootState,
  meetingId: string,
) => businessMeetingsSelectors.selectById(state, meetingId);

export const selectBusinessMeetingsByGroupId = createSelector(
  [
    businessMeetingsSelectors.selectAll,
    (_state: RootState, groupId: string) => groupId,
  ],
  (meetings, groupId) => meetings.filter(m => m.groupId === groupId),
);

export const selectUpcomingBusinessMeetings = createSelector(
  [selectBusinessMeetingsByGroupId],
  meetings => {
    const now = new Date();
    return meetings
      .filter(m => m.date >= now && m.status !== 'cancelled')
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  },
);

export const selectPastBusinessMeetings = createSelector(
  [selectBusinessMeetingsByGroupId],
  meetings => {
    const now = new Date();
    return meetings
      .filter(m => m.date < now || m.status === 'completed')
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  },
);

export const selectAgendaItems = (state: RootState, meetingId: string) =>
  state.businessMeetings.agendaItems[meetingId] || [];

export const selectBusinessMeetingsStatus = (state: RootState) =>
  state.businessMeetings.status;

export const selectBusinessMeetingsError = (state: RootState) =>
  state.businessMeetings.error;

export const {clearBusinessMeetingsError, clearBusinessMeetings} =
  businessMeetingsSlice.actions;

export default businessMeetingsSlice.reducer;
