import {createSlice, createAsyncThunk} from '@reduxjs/toolkit';
import functions from '@react-native-firebase/functions';
import {RootState} from '../types';
import {
  GroupDashboardMetrics,
  DashboardState,
} from '../../types/domain/dashboard';

export type {DashboardState} from '../../types/domain/dashboard';

// ==================== Types ====================

export interface EngagementWindow {
  windowDays: 30 | 60 | 90;
  activeCount: number;
  totalMembers: number;
  percentage: number;
}

export interface EngagementMetrics {
  groupId: string;
  totalMembers: number;
  windows: EngagementWindow[];
  dataAvailabilityNote?: string;
  computedAt: string;
}

// ==================== Async Thunks ====================

export const fetchDashboardMetrics = createAsyncThunk(
  'dashboard/fetchDashboardMetrics',
  async (
    {groupId, period}: {groupId: string; period: 'week' | 'month' | 'all_time'},
    {rejectWithValue},
  ) => {
    try {
      const callable = functions().httpsCallable('getGroupDashboardMetrics');
      const result = await callable({groupId, period});
      const data = result.data as any;

      // Convert ISO strings back to Date objects
      const metrics: GroupDashboardMetrics = {
        ...data,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        computedAt: new Date(data.computedAt),
      };

      return metrics;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch dashboard metrics',
      );
    }
  },
);

export const fetchEngagementMetrics = createAsyncThunk(
  'dashboard/fetchEngagementMetrics',
  async ({groupId}: {groupId: string}, {rejectWithValue}) => {
    try {
      const callable = functions().httpsCallable('getMemberEngagementMetrics');
      const result = await callable({groupId});
      return result.data as EngagementMetrics;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch engagement metrics',
      );
    }
  },
);

// ==================== Slice ====================

interface ExtendedDashboardState extends DashboardState {
  engagementMetrics: EngagementMetrics | null;
  engagementLoading: boolean;
  engagementError: string | null;
}

const initialState: ExtendedDashboardState = {
  metrics: null,
  loading: false,
  error: null,
  lastFetched: null,
  engagementMetrics: null,
  engagementLoading: false,
  engagementError: null,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboard: state => {
      state.metrics = null;
      state.loading = false;
      state.error = null;
      state.lastFetched = null;
      state.engagementMetrics = null;
      state.engagementLoading = false;
      state.engagementError = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchDashboardMetrics.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardMetrics.fulfilled, (state, action) => {
        state.loading = false;
        state.metrics = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchDashboardMetrics.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || 'Failed to fetch metrics';
      })
      .addCase(fetchEngagementMetrics.pending, state => {
        state.engagementLoading = true;
        state.engagementError = null;
      })
      .addCase(fetchEngagementMetrics.fulfilled, (state, action) => {
        state.engagementLoading = false;
        state.engagementMetrics = action.payload;
        state.engagementError = null;
      })
      .addCase(fetchEngagementMetrics.rejected, (state, action) => {
        state.engagementLoading = false;
        state.engagementError =
          (action.payload as string) || 'Failed to fetch engagement metrics';
      });
  },
});

// ==================== Actions ====================

export const {clearDashboard} = dashboardSlice.actions;

// ==================== Selectors ====================

export const selectDashboardMetrics = (state: RootState) =>
  state.dashboard.metrics;
export const selectDashboardLoading = (state: RootState) =>
  state.dashboard.loading;
export const selectDashboardError = (state: RootState) => state.dashboard.error;

export const selectEngagementMetrics = (state: RootState) =>
  (state.dashboard as ExtendedDashboardState).engagementMetrics;
export const selectEngagementLoading = (state: RootState) =>
  (state.dashboard as ExtendedDashboardState).engagementLoading;
export const selectEngagementError = (state: RootState) =>
  (state.dashboard as ExtendedDashboardState).engagementError;

export default dashboardSlice.reducer;
