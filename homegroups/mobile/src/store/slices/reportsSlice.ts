import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import {
  ReportModel,
  Report,
  UserBan,
  CreateReportInput,
  CreateBanInput,
} from '../../models/ReportModel';
import {ReportStatus, ReportAction} from '../../types/schema';

// Entity types
export interface ReportEntity extends Report {
  id: string;
}

export interface UserBanEntity extends UserBan {
  id: string;
}

// Create entity adapters
const reportsAdapter = createEntityAdapter<ReportEntity>({
  sortComparer: (a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime(); // Newest first
  },
});

const bansAdapter = createEntityAdapter<UserBanEntity>({
  sortComparer: (a, b) => {
    const dateA = new Date(a.bannedAt);
    const dateB = new Date(b.bannedAt);
    return dateB.getTime() - dateA.getTime(); // Newest first
  },
});

// State interface
export interface ReportsState {
  reports: ReturnType<typeof reportsAdapter.getInitialState>;
  bans: ReturnType<typeof bansAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetched: Record<string, number>;
  groupReportIds: Record<string, string[]>;
  groupBanIds: Record<string, string[]>;
  pendingReportCount: Record<string, number>;
}

// Initial state
const initialState: ReportsState = {
  reports: reportsAdapter.getInitialState(),
  bans: bansAdapter.getInitialState(),
  status: 'idle',
  error: null,
  lastFetched: {},
  groupReportIds: {},
  groupBanIds: {},
  pendingReportCount: {},
};

// Cache TTL
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// ==================== Async Thunks ====================

/**
 * Submit a new report
 */
export const submitReport = createAsyncThunk(
  'reports/submitReport',
  async (input: CreateReportInput, {rejectWithValue}) => {
    try {
      const report = await ReportModel.createReport(input);
      return report;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to submit report');
    }
  },
);

/**
 * Fetch reports for a specific group (for group admins)
 */
export const fetchGroupReports = createAsyncThunk(
  'reports/fetchGroupReports',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const reports = await ReportModel.getReportsByGroup(groupId);
      return {groupId, reports};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch reports');
    }
  },
  {
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      const lastFetchTime = state.reports.lastFetched[`reports_${groupId}`];
      if (state.reports.status === 'loading') return false;
      return isDataStale(lastFetchTime);
    },
  },
);

/**
 * Fetch all pending reports (for super admins)
 */
export const fetchAllPendingReports = createAsyncThunk(
  'reports/fetchAllPendingReports',
  async (_, {rejectWithValue}) => {
    try {
      const reports = await ReportModel.getAllPendingReports();
      return reports;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch pending reports',
      );
    }
  },
);

/**
 * Fetch a single report by ID
 */
export const fetchReportById = createAsyncThunk(
  'reports/fetchReportById',
  async (reportId: string, {rejectWithValue}) => {
    try {
      const report = await ReportModel.getReportById(reportId);
      if (!report) {
        return rejectWithValue('Report not found');
      }
      return report;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch report');
    }
  },
);

/**
 * Review a report (admin action)
 */
export const reviewReport = createAsyncThunk(
  'reports/reviewReport',
  async (
    {
      reportId,
      status,
      action,
      adminNotes,
    }: {
      reportId: string;
      status: ReportStatus;
      action?: ReportAction;
      adminNotes?: string;
    },
    {rejectWithValue},
  ) => {
    try {
      await ReportModel.updateReportStatus(
        reportId,
        status,
        action,
        adminNotes,
      );
      return {reportId, status, action, adminNotes};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to review report');
    }
  },
);

/**
 * Fetch pending report count for a group
 */
export const fetchPendingReportCount = createAsyncThunk(
  'reports/fetchPendingReportCount',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const count = await ReportModel.getPendingReportCount(groupId);
      return {groupId, count};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch pending report count',
      );
    }
  },
);

// ==================== Ban Thunks ====================

/**
 * Ban a user
 */
export const banUser = createAsyncThunk(
  'reports/banUser',
  async (input: CreateBanInput, {rejectWithValue}) => {
    try {
      const ban = await ReportModel.createUserBan(input);
      return ban;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to ban user');
    }
  },
);

/**
 * Fetch bans for a specific group
 */
export const fetchGroupBans = createAsyncThunk(
  'reports/fetchGroupBans',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const bans = await ReportModel.getGroupBans(groupId);
      return {groupId, bans};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch bans');
    }
  },
  {
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      const lastFetchTime = state.reports.lastFetched[`bans_${groupId}`];
      if (state.reports.status === 'loading') return false;
      return isDataStale(lastFetchTime);
    },
  },
);

/**
 * Revoke a ban
 */
export const revokeBan = createAsyncThunk(
  'reports/revokeBan',
  async (banId: string, {rejectWithValue}) => {
    try {
      await ReportModel.revokeBan(banId);
      return banId;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to revoke ban');
    }
  },
);

/**
 * Check if a user is banned
 */
export const checkUserBan = createAsyncThunk(
  'reports/checkUserBan',
  async (
    {userId, groupId}: {userId: string; groupId?: string},
    {rejectWithValue},
  ) => {
    try {
      const result = await ReportModel.isUserBanned(userId, groupId);
      return {userId, groupId, ...result};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to check ban status');
    }
  },
);

// ==================== Slice ====================

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    clearReportsError: state => {
      state.error = null;
    },
    setReports: (
      state,
      action: PayloadAction<{groupId: string; reports: Report[]}>,
    ) => {
      const {groupId, reports} = action.payload;
      reportsAdapter.upsertMany(state.reports, reports);
      state.groupReportIds[groupId] = reports.map(r => r.id);
      state.lastFetched[`reports_${groupId}`] = Date.now();
    },
    clearGroupReports: (state, action: PayloadAction<string>) => {
      const groupId = action.payload;
      const reportIds = state.groupReportIds[groupId] || [];
      reportsAdapter.removeMany(state.reports, reportIds);
      delete state.groupReportIds[groupId];
      delete state.lastFetched[`reports_${groupId}`];
    },
  },
  extraReducers: builder => {
    builder
      // Submit report
      .addCase(submitReport.pending, state => {
        state.status = 'loading';
      })
      .addCase(submitReport.fulfilled, (state, action) => {
        state.status = 'succeeded';
        reportsAdapter.addOne(state.reports, action.payload);
        const groupId = action.payload.groupId;
        if (!state.groupReportIds[groupId]) {
          state.groupReportIds[groupId] = [];
        }
        state.groupReportIds[groupId].unshift(action.payload.id);
        // Increment pending count
        state.pendingReportCount[groupId] =
          (state.pendingReportCount[groupId] || 0) + 1;
        state.error = null;
      })
      .addCase(submitReport.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to submit report';
      })

      // Fetch group reports
      .addCase(fetchGroupReports.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchGroupReports.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, reports} = action.payload;
        reportsAdapter.upsertMany(state.reports, reports);
        state.groupReportIds[groupId] = reports.map(r => r.id);
        state.lastFetched[`reports_${groupId}`] = Date.now();
        // Update pending count
        state.pendingReportCount[groupId] = reports.filter(
          r => r.status === 'pending',
        ).length;
        state.error = null;
      })
      .addCase(fetchGroupReports.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to fetch reports';
      })

      // Fetch all pending reports
      .addCase(fetchAllPendingReports.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchAllPendingReports.fulfilled, (state, action) => {
        state.status = 'succeeded';
        reportsAdapter.upsertMany(state.reports, action.payload);
        state.error = null;
      })
      .addCase(fetchAllPendingReports.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to fetch pending reports';
      })

      // Fetch report by ID
      .addCase(fetchReportById.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchReportById.fulfilled, (state, action) => {
        state.status = 'succeeded';
        reportsAdapter.upsertOne(state.reports, action.payload);
        state.error = null;
      })
      .addCase(fetchReportById.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to fetch report';
      })

      // Review report
      .addCase(reviewReport.pending, state => {
        state.status = 'loading';
      })
      .addCase(reviewReport.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {
          reportId,
          status,
          action: reportAction,
          adminNotes,
        } = action.payload;
        reportsAdapter.updateOne(state.reports, {
          id: reportId,
          changes: {
            status,
            action: reportAction,
            adminNotes,
            reviewedAt: new Date(),
          },
        });
        // Update pending count for the report's group
        const report = state.reports.entities[reportId];
        if (report && status !== 'pending') {
          state.pendingReportCount[report.groupId] = Math.max(
            0,
            (state.pendingReportCount[report.groupId] || 0) - 1,
          );
        }
        state.error = null;
      })
      .addCase(reviewReport.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to review report';
      })

      // Fetch pending report count
      .addCase(fetchPendingReportCount.fulfilled, (state, action) => {
        const {groupId, count} = action.payload;
        state.pendingReportCount[groupId] = count;
      })

      // Ban user
      .addCase(banUser.pending, state => {
        state.status = 'loading';
      })
      .addCase(banUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        bansAdapter.addOne(state.bans, action.payload);
        const groupId = action.payload.groupId;
        if (groupId) {
          if (!state.groupBanIds[groupId]) {
            state.groupBanIds[groupId] = [];
          }
          state.groupBanIds[groupId].unshift(action.payload.id);
        }
        state.error = null;
      })
      .addCase(banUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to ban user';
      })

      // Fetch group bans
      .addCase(fetchGroupBans.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchGroupBans.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, bans} = action.payload;
        bansAdapter.upsertMany(state.bans, bans);
        state.groupBanIds[groupId] = bans.map(b => b.id);
        state.lastFetched[`bans_${groupId}`] = Date.now();
        state.error = null;
      })
      .addCase(fetchGroupBans.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to fetch bans';
      })

      // Revoke ban
      .addCase(revokeBan.pending, state => {
        state.status = 'loading';
      })
      .addCase(revokeBan.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const banId = action.payload;
        bansAdapter.updateOne(state.bans, {
          id: banId,
          changes: {
            isActive: false,
            revokedAt: new Date(),
          },
        });
        state.error = null;
      })
      .addCase(revokeBan.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to revoke ban';
      });
  },
});

// ==================== Selectors ====================

const reportsSelectors = reportsAdapter.getSelectors<RootState>(
  state => state.reports.reports,
);

const bansSelectors = bansAdapter.getSelectors<RootState>(
  state => state.reports.bans,
);

// Export actions
export const {clearReportsError, setReports, clearGroupReports} =
  reportsSlice.actions;

// Basic selectors
export const selectReportsStatus = (state: RootState) => state.reports.status;
export const selectReportsError = (state: RootState) => state.reports.error;
export const selectAllReports = reportsSelectors.selectAll;
export const selectReportById = reportsSelectors.selectById;
export const selectAllBans = bansSelectors.selectAll;
export const selectBanById = bansSelectors.selectById;

// Memoized selectors
export const selectReportsByGroup = createSelector(
  [
    reportsSelectors.selectEntities,
    (state: RootState, groupId: string) =>
      state.reports.groupReportIds[groupId] || [],
  ],
  (entities, reportIds) => {
    return reportIds.map(id => entities[id]).filter(Boolean) as ReportEntity[];
  },
);

export const selectPendingReportsByGroup = createSelector(
  [selectReportsByGroup],
  reports => reports.filter(r => r.status === 'pending'),
);

export const selectPendingReportCount = createSelector(
  [
    (state: RootState, groupId: string) =>
      state.reports.pendingReportCount[groupId],
  ],
  count => count || 0,
);

export const selectBansByGroup = createSelector(
  [
    bansSelectors.selectEntities,
    (state: RootState, groupId: string) =>
      state.reports.groupBanIds[groupId] || [],
  ],
  (entities, banIds) => {
    return banIds.map(id => entities[id]).filter(Boolean) as UserBanEntity[];
  },
);

export const selectActiveBansByGroup = createSelector(
  [selectBansByGroup],
  bans => bans.filter(b => b.isActive),
);

export const selectIsUserBannedInGroup = createSelector(
  [
    bansSelectors.selectAll,
    (_: RootState, userId: string) => userId,
    (_: RootState, __: string, groupId: string) => groupId,
  ],
  (bans, userId, groupId) => {
    const now = new Date();
    return bans.some(
      ban =>
        ban.userId === userId &&
        ban.isActive &&
        (ban.groupId === groupId || !ban.groupId) && // Group-specific or platform-wide
        (!ban.expiresAt || ban.expiresAt > now),
    );
  },
);

export default reportsSlice.reducer;
