import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import functions from '@react-native-firebase/functions';
import {RootState} from '../types';

// ==================== Types ====================

export interface ReferralStats {
  code: string | null;
  totalReferrals: number;
  conversions: number;
  rewardsEarned: number;
}

export interface ReferralState {
  code: string | null;
  stats: ReferralStats | null;
  loading: boolean;
  error: string | null;
}

// ==================== Async Thunks ====================

export const fetchReferralStats = createAsyncThunk(
  'referral/fetchReferralStats',
  async (_, {rejectWithValue}) => {
    try {
      const callable = functions().httpsCallable('getReferralStats');
      const result = await callable({});
      return result.data as ReferralStats;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch referral stats',
      );
    }
  },
);

export const generateCode = createAsyncThunk(
  'referral/generateCode',
  async ({groupId}: {groupId: string}, {rejectWithValue}) => {
    try {
      const callable = functions().httpsCallable('generateReferralCode');
      const result = await callable({groupId});
      const data = result.data as {code: string};
      return data.code;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to generate referral code',
      );
    }
  },
);

export const applyCode = createAsyncThunk(
  'referral/applyCode',
  async (
    {code, groupId}: {code: string; groupId: string},
    {rejectWithValue},
  ) => {
    try {
      const callable = functions().httpsCallable('applyReferralCode');
      const result = await callable({code, groupId});
      return result.data as {success: boolean; referralId: string};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to apply referral code',
      );
    }
  },
);

// ==================== Slice ====================

const initialState: ReferralState = {
  code: null,
  stats: null,
  loading: false,
  error: null,
};

const referralSlice = createSlice({
  name: 'referral',
  initialState,
  reducers: {
    clearReferralError: state => {
      state.error = null;
    },
    clearReferral: state => {
      state.code = null;
      state.stats = null;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: builder => {
    // fetchReferralStats
    builder
      .addCase(fetchReferralStats.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchReferralStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload;
        state.code = action.payload.code;
        state.error = null;
      })
      .addCase(fetchReferralStats.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || 'Failed to fetch stats';
      });

    // generateCode
    builder
      .addCase(generateCode.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(generateCode.fulfilled, (state, action) => {
        state.loading = false;
        state.code = action.payload;
        // Update stats.code if stats exist
        if (state.stats) {
          state.stats.code = action.payload;
        }
        state.error = null;
      })
      .addCase(generateCode.rejected, (state, action) => {
        state.loading = false;
        state.error =
          (action.payload as string) || 'Failed to generate code';
      });

    // applyCode
    builder
      .addCase(applyCode.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(applyCode.fulfilled, state => {
        state.loading = false;
        state.error = null;
      })
      .addCase(applyCode.rejected, (state, action) => {
        state.loading = false;
        state.error =
          (action.payload as string) || 'Failed to apply referral code';
      });
  },
});

// ==================== Actions ====================

export const {clearReferralError, clearReferral} = referralSlice.actions;

// ==================== Selectors ====================

export const selectReferralCode = (state: RootState): string | null =>
  state.referral.code;

export const selectReferralStats = (state: RootState): ReferralStats | null =>
  state.referral.stats;

export const selectReferralLoading = (state: RootState): boolean =>
  state.referral.loading;

export const selectReferralError = (state: RootState): string | null =>
  state.referral.error;

export default referralSlice.reducer;
