import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
  PayloadAction,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import {TreasurerHandoff} from '../../types/domain/treasurer-handoff';
import {TreasurerHandoffModel} from '../../models/TreasurerHandoffModel';

// Entity type for the adapter
export interface TreasurerHandoffEntity extends TreasurerHandoff {
  id: string;
}

// Create entity adapter
const handoffsAdapter = createEntityAdapter({
  selectId: (handoff: TreasurerHandoffEntity) => handoff.id,
  sortComparer: (a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
});

// State interface
export interface TreasurerHandoffState {
  handoffs: ReturnType<typeof handoffsAdapter.getInitialState>;
  groupHandoffIds: Record<string, string[]>; // groupId -> handoffIds
  pendingForUser: string[]; // handoff IDs where current user is new treasurer
  acceptedForUser: string[]; // handoff IDs where current user needs to complete
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetchedGroup: Record<string, number>;
}

// Initial state
const initialState: TreasurerHandoffState = {
  handoffs: handoffsAdapter.getInitialState(),
  groupHandoffIds: {},
  pendingForUser: [],
  acceptedForUser: [],
  status: 'idle',
  error: null,
  lastFetchedGroup: {},
};

// --- Async Thunks ---

export const fetchHandoffHistory = createAsyncThunk(
  'treasurerHandoff/fetchHistory',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const handoffs = await TreasurerHandoffModel.getHandoffHistory(groupId);
      return {groupId, handoffs};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch handoff history',
      );
    }
  },
);

export const fetchPendingHandoffsForUser = createAsyncThunk(
  'treasurerHandoff/fetchPendingForUser',
  async (userId: string, {rejectWithValue}) => {
    try {
      const handoffs = await TreasurerHandoffModel.getPendingHandoffsForUser(
        userId,
      );
      return handoffs;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch pending handoffs',
      );
    }
  },
);

export const fetchAcceptedHandoffsForUser = createAsyncThunk(
  'treasurerHandoff/fetchAcceptedForUser',
  async (userId: string, {rejectWithValue}) => {
    try {
      const handoffs = await TreasurerHandoffModel.getAcceptedHandoffsForUser(
        userId,
      );
      return handoffs;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch accepted handoffs',
      );
    }
  },
);

export const initiateHandoff = createAsyncThunk(
  'treasurerHandoff/initiate',
  async (
    data: {
      groupId: string;
      positionId: string;
      newTreasurerId: string;
      newTreasurerName: string;
      transitionNotes?: string;
    },
    {rejectWithValue},
  ) => {
    try {
      const handoff = await TreasurerHandoffModel.initiateHandoff(data);
      return handoff;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initiate handoff');
    }
  },
);

export const acceptHandoff = createAsyncThunk(
  'treasurerHandoff/accept',
  async (
    {groupId, handoffId}: {groupId: string; handoffId: string},
    {rejectWithValue},
  ) => {
    try {
      const handoff = await TreasurerHandoffModel.acceptHandoff(
        groupId,
        handoffId,
      );
      return handoff;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to accept handoff');
    }
  },
);

export const rejectHandoff = createAsyncThunk(
  'treasurerHandoff/reject',
  async (
    {
      groupId,
      handoffId,
      reason,
    }: {groupId: string; handoffId: string; reason?: string},
    {rejectWithValue},
  ) => {
    try {
      const handoff = await TreasurerHandoffModel.rejectHandoff(
        groupId,
        handoffId,
        reason,
      );
      return handoff;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to reject handoff');
    }
  },
);

export const completeHandoff = createAsyncThunk(
  'treasurerHandoff/complete',
  async (
    {groupId, handoffId}: {groupId: string; handoffId: string},
    {rejectWithValue},
  ) => {
    try {
      const handoff = await TreasurerHandoffModel.completeHandoff(
        groupId,
        handoffId,
      );
      return handoff;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to complete handoff');
    }
  },
);

export const cancelHandoff = createAsyncThunk(
  'treasurerHandoff/cancel',
  async (
    {groupId, handoffId}: {groupId: string; handoffId: string},
    {rejectWithValue},
  ) => {
    try {
      const handoff = await TreasurerHandoffModel.cancelHandoff(
        groupId,
        handoffId,
      );
      return handoff;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to cancel handoff');
    }
  },
);

export const fetchHandoffById = createAsyncThunk(
  'treasurerHandoff/fetchById',
  async (
    {groupId, handoffId}: {groupId: string; handoffId: string},
    {rejectWithValue},
  ) => {
    try {
      const handoff = await TreasurerHandoffModel.getHandoffById(
        groupId,
        handoffId,
      );
      if (!handoff) {
        return rejectWithValue('Handoff not found');
      }
      return handoff;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch handoff');
    }
  },
);

// --- Slice ---

const treasurerHandoffSlice = createSlice({
  name: 'treasurerHandoff',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    resetState: () => initialState,
  },
  extraReducers: builder => {
    builder
      // Fetch handoff history
      .addCase(fetchHandoffHistory.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchHandoffHistory.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, handoffs} = action.payload;

        // Upsert all handoffs
        handoffsAdapter.upsertMany(
          state.handoffs,
          handoffs as TreasurerHandoffEntity[],
        );

        // Track handoff IDs for this group
        state.groupHandoffIds[groupId] = handoffs.map(h => h.id);
        state.lastFetchedGroup[groupId] = Date.now();
        state.error = null;
      })
      .addCase(fetchHandoffHistory.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Fetch pending handoffs for user
      .addCase(fetchPendingHandoffsForUser.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchPendingHandoffsForUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoffs = action.payload;

        // Upsert handoffs
        handoffsAdapter.upsertMany(
          state.handoffs,
          handoffs as TreasurerHandoffEntity[],
        );

        // Track pending for user
        state.pendingForUser = handoffs.map(h => h.id);
        state.error = null;
      })
      .addCase(fetchPendingHandoffsForUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Fetch accepted handoffs for user
      .addCase(fetchAcceptedHandoffsForUser.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchAcceptedHandoffsForUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoffs = action.payload;

        // Upsert handoffs
        handoffsAdapter.upsertMany(
          state.handoffs,
          handoffs as TreasurerHandoffEntity[],
        );

        // Track accepted for user
        state.acceptedForUser = handoffs.map(h => h.id);
        state.error = null;
      })
      .addCase(fetchAcceptedHandoffsForUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Initiate handoff
      .addCase(initiateHandoff.pending, state => {
        state.status = 'loading';
      })
      .addCase(initiateHandoff.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoff = action.payload as TreasurerHandoffEntity;

        // Add to adapter
        handoffsAdapter.addOne(state.handoffs, handoff);

        // Add to group's handoff list
        const groupIds = state.groupHandoffIds[handoff.groupId] || [];
        state.groupHandoffIds[handoff.groupId] = [handoff.id, ...groupIds];
        state.error = null;
      })
      .addCase(initiateHandoff.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Accept handoff
      .addCase(acceptHandoff.pending, state => {
        state.status = 'loading';
      })
      .addCase(acceptHandoff.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoff = action.payload as TreasurerHandoffEntity;
        handoffsAdapter.upsertOne(state.handoffs, handoff);

        // Remove from pending, it's now accepted
        state.pendingForUser = state.pendingForUser.filter(
          id => id !== handoff.id,
        );
        state.error = null;
      })
      .addCase(acceptHandoff.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Reject handoff
      .addCase(rejectHandoff.pending, state => {
        state.status = 'loading';
      })
      .addCase(rejectHandoff.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoff = action.payload as TreasurerHandoffEntity;
        handoffsAdapter.upsertOne(state.handoffs, handoff);

        // Remove from pending
        state.pendingForUser = state.pendingForUser.filter(
          id => id !== handoff.id,
        );
        state.error = null;
      })
      .addCase(rejectHandoff.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Complete handoff
      .addCase(completeHandoff.pending, state => {
        state.status = 'loading';
      })
      .addCase(completeHandoff.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoff = action.payload as TreasurerHandoffEntity;
        handoffsAdapter.upsertOne(state.handoffs, handoff);

        // Remove from accepted for user
        state.acceptedForUser = state.acceptedForUser.filter(
          id => id !== handoff.id,
        );
        state.error = null;
      })
      .addCase(completeHandoff.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Cancel handoff
      .addCase(cancelHandoff.pending, state => {
        state.status = 'loading';
      })
      .addCase(cancelHandoff.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoff = action.payload as TreasurerHandoffEntity;
        handoffsAdapter.upsertOne(state.handoffs, handoff);
        state.error = null;
      })
      .addCase(cancelHandoff.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Fetch handoff by ID
      .addCase(fetchHandoffById.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchHandoffById.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const handoff = action.payload as TreasurerHandoffEntity;
        handoffsAdapter.upsertOne(state.handoffs, handoff);
        state.error = null;
      })
      .addCase(fetchHandoffById.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// --- Actions ---
export const {clearError, resetState} = treasurerHandoffSlice.actions;

// --- Selectors ---

// Base selectors from adapter
const handoffsSelectors = handoffsAdapter.getSelectors(
  (state: RootState) => state.treasurerHandoff.handoffs,
);

export const selectAllHandoffs = handoffsSelectors.selectAll;
export const selectHandoffById = handoffsSelectors.selectById;

// Status selectors
export const selectHandoffStatus = (state: RootState) =>
  state.treasurerHandoff.status;
export const selectHandoffError = (state: RootState) =>
  state.treasurerHandoff.error;

// Handoffs for a specific group
export const selectHandoffsByGroup = createSelector(
  [selectAllHandoffs, (state: RootState, groupId: string) => groupId],
  (handoffs, groupId) => handoffs.filter(h => h.groupId === groupId),
);

// Pending handoffs where user is new treasurer
export const selectPendingHandoffsForUser = createSelector(
  [
    (state: RootState) => state.treasurerHandoff.pendingForUser,
    selectAllHandoffs,
  ],
  (pendingIds, allHandoffs) =>
    allHandoffs.filter(h => pendingIds.includes(h.id)),
);

// Accepted handoffs where user needs to complete (as previous treasurer)
export const selectAcceptedHandoffsForUser = createSelector(
  [
    (state: RootState) => state.treasurerHandoff.acceptedForUser,
    selectAllHandoffs,
  ],
  (acceptedIds, allHandoffs) =>
    allHandoffs.filter(h => acceptedIds.includes(h.id)),
);

// Get active (pending or accepted) handoff for a position
export const selectActiveHandoffForPosition = createSelector(
  [selectAllHandoffs, (state: RootState, positionId: string) => positionId],
  (handoffs, positionId) =>
    handoffs.find(
      h =>
        h.positionId === positionId &&
        (h.status === 'pending' || h.status === 'accepted'),
    ),
);

// Completed handoffs for history
export const selectCompletedHandoffsByGroup = createSelector(
  [selectAllHandoffs, (state: RootState, groupId: string) => groupId],
  (handoffs, groupId) =>
    handoffs.filter(h => h.groupId === groupId && h.status === 'completed'),
);

export default treasurerHandoffSlice.reducer;
