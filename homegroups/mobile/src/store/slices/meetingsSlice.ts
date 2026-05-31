import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import functions from '@react-native-firebase/functions';
import * as hashUtils from '../../utils/hashUtils';
import {
  Meeting,
  MeetingInstance,
  MeetingFilters,
  Location,
  MeetingSearchCriteria,
} from '../../types';
import {MeetingModel} from '../../models';
import {createSelector} from 'reselect';
import moment from 'moment-timezone';
import {DayOfWeek, DAYS_OF_WEEK} from '../../types/utils';

// ENTITY ADAPTERS
const meetingsAdapter = createEntityAdapter<Meeting>();
const meetingInstancesAdapter = createEntityAdapter<MeetingInstance>();

// STATE SHAPE
export interface MeetingsState {
  meetings: ReturnType<typeof meetingsAdapter.getInitialState>;
  meetingInstances: ReturnType<typeof meetingInstancesAdapter.getInitialState>;
  filteredIds: string[];
  favoriteIds: string[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  groupMeetingIds: Record<string, string[]>;
  groupMeetingInstanceIds: Record<string, string[]>;
  lastFetchedGroup: Record<string, number>;
  lastFetchedGroupInstances: Record<string, number>;
  userLocation: Location | null;
}

// INITIAL STATE
const initialState: MeetingsState = {
  meetings: meetingsAdapter.getInitialState(),
  meetingInstances: meetingInstancesAdapter.getInitialState(),
  filteredIds: [],
  favoriteIds: [],
  status: 'idle',
  error: null,
  groupMeetingIds: {},
  groupMeetingInstanceIds: {},
  lastFetchedGroup: {},
  lastFetchedGroupInstances: {},
  userLocation: null,
};

// UTILITIES
const CACHE_TTL = 10 * 60 * 1000;

const shouldRefreshData = (lastFetched: number | null): boolean => {
  return !lastFetched || Date.now() - lastFetched > CACHE_TTL;
};

const validateGroupId = (groupId: string): boolean => {
  return typeof groupId === 'string' && groupId.length > 0;
};

// ASYNC THUNKS

export const setUserLocation = createAsyncThunk(
  'meetings/setUserLocation',
  async (location: Location) => location,
);

export const fetchGroupMeetings = createAsyncThunk(
  'meetings/fetchGroupMeetings',
  async (
    {groupId, force = false}: {groupId: string; force?: boolean},
    {rejectWithValue},
  ) => {
    try {
      const meetings = await MeetingModel.getMeetingsByGroupId(groupId);
      return {groupId, meetings};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch group meetings');
    }
  },
  {
    condition: ({groupId, force}, {getState}) => {
      const state = getState() as RootState;
      return (
        validateGroupId(groupId) &&
        (force || shouldRefreshData(state.meetings.lastFetchedGroup[groupId]))
      );
    },
  },
);

export const fetchMeetings = createAsyncThunk(
  'meetings/fetchMeetings',
  async (
    {
      location,
      filters,
      criteria,
      groupId,
    }: {
      location?: Location;
      filters?: MeetingFilters;
      criteria?: MeetingSearchCriteria;
      groupId?: string;
    },
    {getState, rejectWithValue},
  ) => {
    try {
      const state = getState() as RootState;
      const effectiveLocation = location || state.meetings.userLocation;
      if (!effectiveLocation) {
        return rejectWithValue('Location is required to find meetings');
      }

      const searchInput = {
        filters: {
          date: new Date().toISOString(),
          location: effectiveLocation,
          day: filters?.day,
          type: filters?.type,
        },
        criteria,
      };

      const meetingsResult = await functions().httpsCallable('findMeetings')(
        searchInput,
      );
      if (meetingsResult.data && Array.isArray(meetingsResult.data)) {
        const meetings = meetingsResult.data.map((meeting: any) => ({
          ...meeting,
          id: meeting.id || hashUtils.generateMeetingHash(meeting),
        }));
        return {meetings, groupId};
      } else {
        return rejectWithValue(
          'Invalid response format from findMeetings function',
        );
      }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch meetings');
    }
  },
);

export const toggleFavoriteMeeting = createAsyncThunk(
  'meetings/toggleFavorite',
  async (meetingId: string, {getState}) => {
    const state = getState() as RootState;
    const isFavorite = state.meetings.favoriteIds.includes(meetingId);
    return {meetingId, isFavorite: !isFavorite};
  },
);

export const updateMeeting = createAsyncThunk(
  'meetings/updateMeeting',
  async (
    {
      meetingId,
      meetingData,
    }: {meetingId: string; meetingData: Partial<Meeting>},
    {rejectWithValue},
  ) => {
    try {
      const updatedMeeting = await MeetingModel.update(meetingId, meetingData);
      return updatedMeeting;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update meeting');
    }
  },
);

export const createMeeting = createAsyncThunk(
  'meetings/createMeeting',
  async (
    {groupId, meetingData}: {groupId: string; meetingData: Partial<Meeting>},
    {rejectWithValue},
  ) => {
    try {
      const newMeeting = await MeetingModel.create({...meetingData, groupId});
      return newMeeting;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create meeting');
    }
  },
);

export const fetchUpcomingMeetingInstances = createAsyncThunk(
  'meetings/fetchUpcomingInstances',
  async (groupId: string, {rejectWithValue}) => {
    try {
      let instances = await MeetingModel.getUpcomingInstancesByGroupId(groupId);
      if (!instances?.length) {
        const meetings = await MeetingModel.getMeetingsByGroupId(groupId);
        const now = new Date();
        instances = meetings
          .map(meeting => {
            const scheduledAt =
              getNextMeetingDate(meeting.day, meeting.time) || now;
            return {
              ...meeting,
              instanceId: `${meeting.id}-fallback-${scheduledAt.getTime()}`,
              meetingId: meeting.id,
              groupId: meeting.groupId || groupId,
              scheduledAt,
              isCancelled: meeting.isCancelledTemporarily ?? false,
              instanceNotice: meeting.temporaryNotice ?? null,
              templateUpdatedAt: meeting.updatedAt || now,
            };
          })
          .filter(i => i.scheduledAt >= now)
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      }
      return {groupId, instances};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch upcoming meetings',
      );
    }
  },
  {
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      return (
        validateGroupId(groupId) &&
        shouldRefreshData(state.meetings.lastFetchedGroupInstances[groupId])
      );
    },
  },
);

export const updateMeetingInstance = createAsyncThunk(
  'meetings/updateInstance',
  async (
    {
      instanceId,
      updates,
    }: {
      instanceId: string;
      updates: {
        scheduledAt?: Date;
        location?: string;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
        lat?: number;
        lng?: number;
        locationName?: string;
        isOnline?: boolean;
        link?: string | null;
        onlineNotes?: string | null;
        isCancelled?: boolean;
        instanceNotice?: string | null;
        isPublic?: boolean;
      };
    },
    {rejectWithValue, getState},
  ) => {
    try {
      await MeetingModel.updateInstance(instanceId, updates);

      // Fetch the updated instance to return it
      const state = getState() as RootState;
      const instance = state.meetings.meetingInstances.entities[instanceId];

      if (!instance) {
        // If instance not in state, we need to fetch it
        // For now, return a partial update
        return {
          instanceId,
          updates,
        };
      }

      // Return updated instance
      return {
        instanceId,
        instance: {
          ...instance,
          ...updates,
        },
      };
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to update meeting instance',
      );
    }
  },
);

// HELPERS
function getNextMeetingDate(dayOfWeek: string, time: string): Date | null {
  const days = DAYS_OF_WEEK;
  if (typeof dayOfWeek !== 'string' || typeof time !== 'string') return null;
  const targetDayIndex = days.indexOf(dayOfWeek.toLowerCase() as DayOfWeek);
  if (targetDayIndex === -1) return null;

  const now = moment();
  let nextDate = now.clone().day(targetDayIndex);
  const meetingTime = moment(time, ['h:mm A', 'HH:mm']);
  if (!meetingTime.isValid()) return null;

  nextDate
    .hour(meetingTime.hour())
    .minute(meetingTime.minute())
    .second(0)
    .millisecond(0);
  if (nextDate.isBefore(now)) nextDate.add(1, 'week');
  return nextDate.toDate();
}

// SLICE
const meetingsSlice = createSlice({
  name: 'meetings',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    filterMeetings: (
      state,
      action: PayloadAction<{
        searchQuery?: string;
        showOnline?: boolean;
        showInPerson?: boolean;
        meetingType?: string | null;
        day?: string | null;
        showFavoritesOnly?: boolean;
      }>,
    ) => {
      const {searchQuery, showOnline, showInPerson, meetingType, day, showFavoritesOnly} =
        action.payload;
      const allMeetings = meetingsAdapter
        .getSelectors()
        .selectEntities(state.meetings);
      const allMeetingIds = Object.keys(allMeetings);

      state.filteredIds = allMeetingIds.filter(id => {
        const meeting = allMeetings[id];
        if (!meeting) return false;

        // Filter by favorites if enabled
        if (showFavoritesOnly && !state.favoriteIds.includes(id)) return false;

        if (showOnline !== undefined && !showOnline && meeting.online)
          return false;
        if (showInPerson !== undefined && !showInPerson && !meeting.online)
          return false;
        if (meetingType && meeting.type !== meetingType) return false;
        if (day && meeting.day !== day.toLowerCase()) return false;

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            meeting.name.toLowerCase().includes(query) ||
            meeting.location?.toLowerCase().includes(query) ||
            meeting.address?.toLowerCase().includes(query) ||
            meeting.city?.toLowerCase().includes(query)
          );
        }

        return true;
      });
    },
  },
  extraReducers: builder => {
    builder
      .addCase(setUserLocation.fulfilled, (state, action) => {
        state.userLocation = action.payload;
      })
      .addCase(fetchMeetings.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMeetings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        meetingsAdapter.upsertMany(state.meetings, action.payload.meetings);
        state.filteredIds = action.payload.meetings.map(m => m.id);
        if (action.payload.groupId) {
          state.lastFetchedGroup[action.payload.groupId] = Date.now();
        }
      })
      .addCase(fetchMeetings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to fetch meetings';
      })
      .addCase(fetchGroupMeetings.fulfilled, (state, action) => {
        meetingsAdapter.upsertMany(state.meetings, action.payload.meetings);
        state.groupMeetingIds[action.payload.groupId] =
          action.payload.meetings.map(m => m.id);
        state.lastFetchedGroup[action.payload.groupId] = Date.now();
      })
      .addCase(fetchUpcomingMeetingInstances.fulfilled, (state, action) => {
        meetingInstancesAdapter.upsertMany(
          state.meetingInstances,
          action.payload.instances,
        );
        state.groupMeetingInstanceIds[action.payload.groupId] =
          action.payload.instances.map(i => i.instanceId);
        state.lastFetchedGroupInstances[action.payload.groupId] = Date.now();
      })
      .addCase(updateMeetingInstance.fulfilled, (state, action) => {
        if (action.payload.instance) {
          meetingInstancesAdapter.updateOne(state.meetingInstances, {
            id: action.payload.instanceId,
            changes: action.payload.instance,
          });
        } else if (action.payload.updates) {
          // Partial update if full instance not available
          meetingInstancesAdapter.updateOne(state.meetingInstances, {
            id: action.payload.instanceId,
            changes: action.payload.updates,
          });
        }
      })
      .addCase(toggleFavoriteMeeting.fulfilled, (state, action) => {
        const {meetingId, isFavorite} = action.payload;
        if (isFavorite) {
          state.favoriteIds.push(meetingId);
        } else {
          state.favoriteIds = state.favoriteIds.filter(id => id !== meetingId);
        }
        meetingsAdapter.updateOne(state.meetings, {
          id: meetingId,
          changes: {isFavorite},
        });
      });
  },
});

export const {clearError, filterMeetings} = meetingsSlice.actions;

// SELECTORS
const meetingsSelectors = meetingsAdapter.getSelectors<RootState>(
  state => state.meetings.meetings,
);
const meetingInstancesSelectors =
  meetingInstancesAdapter.getSelectors<RootState>(
    state => state.meetings.meetingInstances,
  );

export const selectAllMeetingTemplates = meetingsSelectors.selectEntities;
export const selectAllMeetingInstances =
  meetingInstancesSelectors.selectEntities;
export const selectMeetingById = meetingsSelectors.selectById;
export const selectMeetingInstanceById = meetingInstancesSelectors.selectById;

export const selectGroupMeetingTemplateIds = (
  state: RootState,
  groupId: string,
) => state.meetings.groupMeetingIds[groupId];

export const selectGroupMeetingInstanceIds = (
  state: RootState,
  groupId: string,
) => state.meetings.groupMeetingInstanceIds[groupId];

export const selectFilteredMeetings = createSelector(
  [selectAllMeetingTemplates, (state: RootState) => state.meetings.filteredIds],
  (allMeetings, filteredIds) =>
    filteredIds.map((id: string) => allMeetings[id]).filter(Boolean),
);

export const selectUpcomingMeetingInstances = createSelector(
  [selectAllMeetingInstances, selectGroupMeetingInstanceIds],
  (allInstances, instanceIds) => {
    const ids = instanceIds || [];
    return ids.map(id => allInstances[id]).filter(Boolean);
  },
);

export const selectMeetingsStatus = (state: RootState) => state.meetings.status;
export const selectMeetingsError = (state: RootState) => state.meetings.error;
export const selectUserLocation = (state: RootState) =>
  state.meetings.userLocation;
export const selectFavoriteIds = (state: RootState) =>
  state.meetings.favoriteIds;
export const selectFavoriteMeetingsCount = (state: RootState) =>
  state.meetings.favoriteIds.length;
export const selectGroupMeetings = createSelector(
  [meetingsSelectors.selectEntities, selectGroupMeetingTemplateIds],
  (entities, groupIds) => {
    const ids = groupIds || [];
    return ids.map(id => entities[id]).filter(Boolean);
  },
);

// Define entity types
export interface MeetingEntity extends Meeting {
  id: string;
}

export interface MeetingInstanceEntity extends MeetingInstance {
  id: string;
}

export default meetingsSlice.reducer;
