import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {Announcement} from '../../types';
import {AnnouncementModel} from '../../models/AnnouncementModel';
import {RootState} from '../types';
import {trackActivity} from '../../services/activityTracker';
import functions from '@react-native-firebase/functions';

// Define proper entity type
export interface AnnouncementEntity extends Announcement {
  id: string;
}

// Create entity adapter for better performance
const announcementsAdapter = createEntityAdapter({
  selectId: (announcement: AnnouncementEntity) => announcement.id,
  sortComparer: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
});

// Update state interface
export interface AnnouncementsState {
  announcements: ReturnType<typeof announcementsAdapter.getInitialState>;
  groupAnnouncementIds: Record<string, string[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetchedGroup: Record<string, number>;
}

// Initial state
const initialState: AnnouncementsState = {
  announcements: announcementsAdapter.getInitialState(),
  groupAnnouncementIds: {},
  status: 'idle',
  error: null,
  lastFetchedGroup: {},
};

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL for announcements

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Fetch announcements for a group
export const fetchAnnouncementsForGroup = createAsyncThunk<
  {groupId: string; announcements: Announcement[]},
  {groupId: string; isAdmin?: boolean},
  {state: RootState; rejectValue: string}
>(
  'announcements/fetchForGroup',
  async ({groupId, isAdmin = false}, {rejectWithValue}) => {
    try {
      const announcements = await AnnouncementModel.getAnnouncementsForGroup(
        groupId,
        isAdmin, // includeScheduled
      );
      return {groupId, announcements};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch announcements');
    }
  },
);

// Fetch a single announcement by ID
export const fetchAnnouncementById = createAsyncThunk(
  'announcements/fetchById',
  async (
    {groupId, announcementId}: {groupId: string; announcementId: string},
    {rejectWithValue},
  ) => {
    try {
      // Assume we need to use the group ID to fetch the announcement
      const announcements = await AnnouncementModel.getByGroup(groupId);
      const announcement = announcements.find(a => a.id === announcementId);

      if (!announcement) {
        return rejectWithValue('Announcement not found');
      }

      return announcement;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch announcement');
    }
  },
);

// Create a new announcement
export const createAnnouncement = createAsyncThunk<
  Announcement, // Return the new announcement
  {
    groupId: string;
    title: string;
    content: string;
    isPinned?: boolean;
    expiresAt?: Date | null;
    scheduledFor?: Date;
    userId: string;
    memberId: string;
  },
  {rejectValue: string}
>('announcements/create', async (data, {rejectWithValue}) => {
  try {
    const newAnnouncement = await AnnouncementModel.createAnnouncement(
      data.groupId,
      {
        title: data.title,
        content: data.content,
        isPinned: data.isPinned,
        expiresAt: data.expiresAt,
        scheduledFor: data.scheduledFor,
        userId: data.userId,
        memberId: data.memberId,
      },
    );

    // Track announcement activity for admin inactivity detection
    // Only track immediate posts; scheduled announcements are not yet published
    if (!data.scheduledFor) {
      trackActivity(data.userId, 'announcement_posted', data.groupId);
    }

    // Send push notifications to group members
    try {
      const sendNotification = functions().httpsCallable(
        'sendAnnouncementNotification',
      );
      await sendNotification({
        groupId: data.groupId,
        announcementId: newAnnouncement.id,
        title: data.title,
        body: data.content,
        authorId: data.userId,
      });
    } catch (notificationError) {
      // Log error but don't fail the announcement creation
      console.warn(
        'Failed to send announcement notifications:',
        notificationError,
      );
    }

    return newAnnouncement;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to create announcement');
  }
});

// Update an announcement
export const updateAnnouncement = createAsyncThunk(
  'announcements/update',
  async (
    {
      announcementId,
      title,
      content,
      isPinned,
    }: {
      announcementId: string;
      title?: string;
      content?: string;
      isPinned?: boolean;
    },
    {getState, rejectWithValue},
  ) => {
    try {
      const state = getState() as RootState;
      const currentAnnouncement = announcementsAdapter
        .getSelectors()
        .selectById(state.announcements.announcements, announcementId);

      if (!currentAnnouncement) {
        return rejectWithValue('Announcement not found');
      }

      const updateData: Partial<Announcement> = {};

      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (isPinned !== undefined) updateData.isPinned = isPinned;

      await AnnouncementModel.update(currentAnnouncement.id, updateData);

      return {
        ...currentAnnouncement,
        ...updateData,
        updatedAt: new Date(),
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update announcement');
    }
  },
);

// Delete an announcement
export const deleteAnnouncement = createAsyncThunk<
  {groupId: string; announcementId: string}, // Return IDs for reducer
  {groupId: string; announcementId: string},
  {rejectValue: string}
>(
  'announcements/delete',
  async ({groupId, announcementId}, {rejectWithValue}) => {
    try {
      await AnnouncementModel.deleteAnnouncement(groupId, announcementId);
      return {groupId, announcementId}; // Return IDs to remove from state
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete announcement');
    }
  },
);

// Create the slice
const announcementsSlice = createSlice({
  name: 'announcements',
  initialState,
  reducers: {
    clearAnnouncementsError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      // Fetch Announcements
      .addCase(fetchAnnouncementsForGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchAnnouncementsForGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, announcements} = action.payload;
        announcementsAdapter.upsertMany(state.announcements, announcements);
        state.groupAnnouncementIds[groupId] = announcements.map(a => a.id);
        state.lastFetchedGroup[groupId] = Date.now();
        state.error = null;
      })
      .addCase(fetchAnnouncementsForGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Create Announcement
      .addCase(createAnnouncement.pending, state => {
        state.status = 'loading';
      })
      .addCase(createAnnouncement.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const newAnnouncement = action.payload;
        announcementsAdapter.upsertOne(state.announcements, newAnnouncement);
        if (state.groupAnnouncementIds[newAnnouncement.groupId]) {
          state.groupAnnouncementIds[newAnnouncement.groupId].unshift(
            newAnnouncement.id,
          );
        } else {
          state.groupAnnouncementIds[newAnnouncement.groupId] = [
            newAnnouncement.id,
          ];
        }
        state.error = null;
      })
      .addCase(createAnnouncement.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Update announcement
      .addCase(updateAnnouncement.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateAnnouncement.fulfilled, (state, action) => {
        state.status = 'succeeded';
        announcementsAdapter.upsertOne(state.announcements, action.payload);
        state.error = null;
      })
      .addCase(updateAnnouncement.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to update announcement';
      })
      // Delete Announcement
      .addCase(deleteAnnouncement.pending, state => {
        state.status = 'loading';
      })
      .addCase(deleteAnnouncement.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, announcementId} = action.payload;
        announcementsAdapter.removeOne(state.announcements, announcementId);
        if (state.groupAnnouncementIds[groupId]) {
          state.groupAnnouncementIds[groupId] = state.groupAnnouncementIds[
            groupId
          ].filter(id => id !== announcementId);
        }
        state.error = null;
      })
      .addCase(deleteAnnouncement.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Create selectors ONCE at module level for proper memoization
const announcementsSelectors = announcementsAdapter.getSelectors<RootState>(
  state => state.announcements.announcements,
);

export const selectAllAnnouncements = announcementsSelectors.selectAll;

export const selectGroupAnnouncementIds = (state: RootState, groupId: string) =>
  state.announcements.groupAnnouncementIds[groupId];

export const selectAnnouncementById = (
  state: RootState,
  announcementId: string,
) => {
  return announcementsSelectors.selectById(state, announcementId);
};

export const selectGroupAnnouncements = createSelector(
  [announcementsSelectors.selectEntities, selectGroupAnnouncementIds],
  (entities, announcementIds) => {
    const ids = announcementIds || [];
    return ids.map(id => entities[id]).filter(Boolean);
  },
);

export const selectAnnouncementsByGroupId = createSelector(
  [
    announcementsSelectors.selectEntities,
    (state: RootState, groupId: string) => groupId,
  ],
  (entities, groupId) => {
    return Object.values(entities).filter(a => a.groupId === groupId);
  },
);

// Simple selectors that don't need memoization
export const selectAnnouncementsStatus = (state: RootState) =>
  state.announcements.status;
export const selectAnnouncementsError = (state: RootState) =>
  state.announcements.error;

export const {clearAnnouncementsError} = announcementsSlice.actions;
export default announcementsSlice.reducer;
