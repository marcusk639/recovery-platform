import {createSlice, createAsyncThunk} from '@reduxjs/toolkit';
import functions from '@react-native-firebase/functions';
import {RootState} from '../types';

// ==================== Types ====================

export interface MonthlyDataPoint {
  month: string;
  value: number;
}

export interface GetGroupHealthTimeSeriesResult {
  groupId: string;
  months: number;
  retention: {
    activeCount: number;
    inactiveCount: number;
    totalMembers: number;
  };
  attendanceTrend: MonthlyDataPoint[];
  treasuryTrend: {month: string; income: number; expenses: number}[];
  engagementTrend: MonthlyDataPoint[];
  computedAt: string;
}

export interface GroupHealthState {
  data: GetGroupHealthTimeSeriesResult | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

// ==================== Async Thunks ====================

export const fetchGroupHealth = createAsyncThunk(
  'groupHealth/fetchGroupHealth',
  async (
    {groupId, months}: {groupId: string; months: 3 | 6 | 12},
    {rejectWithValue},
  ) => {
    try {
      const callable = functions().httpsCallable('getGroupHealthTimeSeries');
      const result = await callable({groupId, months});
      const data = result.data as GetGroupHealthTimeSeriesResult;
      return data;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch group health data',
      );
    }
  },
);

// ==================== Slice ====================

const initialState: GroupHealthState = {
  data: null,
  loading: false,
  error: null,
  lastFetched: null,
};

const groupHealthSlice = createSlice({
  name: 'groupHealth',
  initialState,
  reducers: {
    clearGroupHealth: state => {
      state.data = null;
      state.loading = false;
      state.error = null;
      state.lastFetched = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchGroupHealth.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGroupHealth.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchGroupHealth.rejected, (state, action) => {
        state.loading = false;
        state.error =
          (action.payload as string) || 'Failed to fetch group health data';
      });
  },
});

// ==================== Actions ====================

export const {clearGroupHealth} = groupHealthSlice.actions;

// ==================== Selectors ====================

export const selectGroupHealthData = (state: RootState) =>
  state.groupHealth.data;
export const selectGroupHealthLoading = (state: RootState) =>
  state.groupHealth.loading;
export const selectGroupHealthError = (state: RootState) =>
  state.groupHealth.error;

export default groupHealthSlice.reducer;
