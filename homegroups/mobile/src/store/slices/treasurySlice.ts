import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import {TreasuryStats} from '../../types/domain/treasury';
import {TreasuryModel} from '../../models/TreasuryModel';

// Define entity types
interface TreasuryStatsEntity extends TreasuryStats {
  id: string;
}

// Create entity adapter
const treasuryStatsAdapter = createEntityAdapter<TreasuryStatsEntity>();

// Define state interface
export interface TreasuryState {
  stats: ReturnType<typeof treasuryStatsAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetched: Record<string, number>;
}

// Initial state
const initialState: TreasuryState = {
  stats: treasuryStatsAdapter.getInitialState(),
  status: 'idle',
  error: null,
  lastFetched: {},
};

// Constants
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache TTL (shorter for treasury stats)

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Async thunks
export const fetchTreasuryStats = createAsyncThunk(
  'treasury/fetchTreasuryStats',
  async (groupId: string, {getState, rejectWithValue}) => {
    try {
      const treasuryStats = await TreasuryModel.getTreasuryStats(groupId);
      return treasuryStats;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch treasury stats');
    }
  },
  {
    // Only fetch if data is stale
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      const lastFetchTime = state.treasury.lastFetched[groupId];

      // If already loading, don't fetch again
      if (state.treasury.status === 'loading') return false;

      return isDataStale(lastFetchTime);
    },
  },
);

// Update prudent reserve amount
export const updatePrudentReserve = createAsyncThunk(
  'treasury/updatePrudentReserve',
  async (
    {groupId, amount}: {groupId: string; amount: number},
    {rejectWithValue, dispatch},
  ) => {
    try {
      await TreasuryModel.updatePrudentReserve(groupId, amount);
      // Invalidate cache to refresh stats
      dispatch(invalidateTreasuryCache(groupId));
      return {groupId, amount};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update prudent reserve');
    }
  },
);

// Add external donation (self-reported from Venmo, CashApp, PayPal, Zelle)
export const addExternalDonation = createAsyncThunk(
  'treasury/addExternalDonation',
  async (
    {
      groupId,
      amount,
      paymentMethod,
      donorName,
      donorId,
      isAnonymous,
    }: {
      groupId: string;
      amount: number;
      paymentMethod: string;
      donorName?: string;
      donorId?: string;
      isAnonymous: boolean;
    },
    {rejectWithValue, dispatch},
  ) => {
    try {
      // Build description based on anonymity preference
      const donorDisplay = isAnonymous || !donorName ? 'Anonymous' : donorName;
      const description = `${paymentMethod} donation from ${donorDisplay} (self-reported)`;

      // Create the donation transaction
      const transaction = await TreasuryModel.createTransaction({
        groupId,
        type: 'income',
        amount,
        description,
        category: 'donation',
      });

      // Invalidate the cache so stats are refreshed
      dispatch(invalidateTreasuryCache(groupId));

      return {groupId, transaction};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to record external donation',
      );
    }
  },
);

// Create the slice
const treasurySlice = createSlice({
  name: 'treasury',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    invalidateTreasuryCache: (state, action: PayloadAction<string>) => {
      // Remove the cache timestamp to force a refresh on next fetch
      delete state.lastFetched[action.payload];
    },
  },
  extraReducers: builder => {
    builder
      // Fetch treasury stats
      .addCase(fetchTreasuryStats.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchTreasuryStats.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const stats = action.payload;
        const statsEntity = {
          ...stats,
          id: stats.groupId,
        };
        treasuryStatsAdapter.upsertOne(state.stats, statsEntity);
        state.lastFetched[stats.groupId] = Date.now();
        state.error = null;
      })
      .addCase(fetchTreasuryStats.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Add external donation
      .addCase(addExternalDonation.pending, state => {
        state.status = 'loading';
      })
      .addCase(addExternalDonation.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Cache is already invalidated by the thunk
        state.error = null;
      })
      .addCase(addExternalDonation.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Update prudent reserve
      .addCase(updatePrudentReserve.pending, state => {
        state.status = 'loading';
      })
      .addCase(updatePrudentReserve.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Cache is invalidated by the thunk, stats will refresh on next fetch
        state.error = null;
      })
      .addCase(updatePrudentReserve.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Memoized selectors
const treasuryStatsSelectors = treasuryStatsAdapter.getSelectors<RootState>(
  state => state.treasury.stats,
);

export const selectTreasuryStatsByGroupId = createSelector(
  [
    treasuryStatsSelectors.selectAll,
    (state: RootState, groupId: string) => groupId,
  ],
  (allStats, groupId) => allStats.find(stats => stats.id === groupId),
);

export const selectTreasuryStatus = (state: RootState) => state.treasury.status;
export const selectTreasuryError = (state: RootState) => state.treasury.error;

export const {clearError, invalidateTreasuryCache} = treasurySlice.actions;
export default treasurySlice.reducer;
