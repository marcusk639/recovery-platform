import {
  createSlice,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from '@reduxjs/toolkit';
import {addUserScopeReset} from '../userScope';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GratitudeEntry {
  date: string; // YYYY-MM-DD (UTC)
  entries: string[]; // 1–3 items
  createdAt: number; // Unix ms
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCheckIn: string | null; // YYYY-MM-DD (UTC) or null
  checkInDates: string[]; // last 30 days YYYY-MM-DD (UTC)
}

export interface EngagementState {
  gratitude: {
    todayEntry: GratitudeEntry | null;
    pastEntries: GratitudeEntry[];
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
    error: string | null;
  };
  streak: {
    data: StreakData | null;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
  };
  /** Maintained by addUserScopeReset; see store/userScope.ts. */
  loadedForUserId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD in UTC */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for yesterday (UTC) relative to a given YYYY-MM-DD string */
function yesterdayRelativeTo(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure streak computation. Returns updated StreakData.
 * Exported so it can be unit-tested independently.
 */
export function computeStreak(
  current: StreakData | null,
  dateStr: string,
): StreakData {
  const prev: StreakData = current ?? {
    currentStreak: 0,
    longestStreak: 0,
    lastCheckIn: null,
    checkInDates: [],
  };

  // Already checked in today — no-op
  if (prev.lastCheckIn === dateStr) {
    return prev;
  }

  let newStreak: number;
  if (prev.lastCheckIn === null) {
    // First ever check-in
    newStreak = 1;
  } else if (prev.lastCheckIn === yesterdayRelativeTo(dateStr)) {
    // Consecutive day
    newStreak = prev.currentStreak + 1;
  } else {
    // Gap of 2+ days — reset
    newStreak = 1;
  }

  const longestStreak = Math.max(prev.longestStreak, newStreak);

  // Keep only last 30 days
  const updatedDates = [
    ...prev.checkInDates.filter(d => d !== dateStr),
    dateStr,
  ].slice(-30);

  return {
    currentStreak: newStreak,
    longestStreak,
    lastCheckIn: dateStr,
    checkInDates: updatedDates,
  };
}

// ---------------------------------------------------------------------------
// Async thunks — Gratitude Journal
// ---------------------------------------------------------------------------

export const fetchTodayGratitude = createAsyncThunk(
  'engagement/fetchTodayGratitude',
  async (_, {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) return rejectWithValue('Not authenticated');

      const dateStr = todayUTC();
      const doc = await firestore()
        .collection('users')
        .doc(user.uid)
        .collection('gratitudeEntries')
        .doc(dateStr)
        .get();

      if (!doc.exists) return null;

      const data = doc.data()!;
      return {
        date: doc.id,
        entries: (data.entries as string[]) ?? [],
        createdAt:
          typeof data.createdAt?.toMillis === 'function'
            ? data.createdAt.toMillis()
            : Date.now(),
      } as GratitudeEntry;
    } catch (err: any) {
      return rejectWithValue(err.message ?? 'Failed to fetch gratitude entry');
    }
  },
);

export const fetchPastGratitudeEntries = createAsyncThunk(
  'engagement/fetchPastGratitudeEntries',
  async (limit: number = 30, {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) return rejectWithValue('Not authenticated');

      const snapshot = await firestore()
        .collection('users')
        .doc(user.uid)
        .collection('gratitudeEntries')
        .orderBy(firestore.FieldPath.documentId(), 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          date: doc.id,
          entries: (data.entries as string[]) ?? [],
          createdAt:
            typeof data.createdAt?.toMillis === 'function'
              ? data.createdAt.toMillis()
              : 0,
        } as GratitudeEntry;
      });
    } catch (err: any) {
      return rejectWithValue(
        err.message ?? 'Failed to fetch past gratitude entries',
      );
    }
  },
);

export const saveGratitudeEntry = createAsyncThunk(
  'engagement/saveGratitudeEntry',
  async (entries: string[], {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) return rejectWithValue('Not authenticated');

      // Enforce max 3 entries (model-level guard)
      const sanitised = entries
        .map(e => e.trim())
        .filter(e => e.length > 0)
        .slice(0, 3);

      if (sanitised.length === 0) {
        return rejectWithValue('At least one gratitude entry is required');
      }

      const dateStr = todayUTC();
      const docRef = firestore()
        .collection('users')
        .doc(user.uid)
        .collection('gratitudeEntries')
        .doc(dateStr);

      await docRef.set({
        entries: sanitised,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      const entry: GratitudeEntry = {
        date: dateStr,
        entries: sanitised,
        createdAt: Date.now(),
      };
      return entry;
    } catch (err: any) {
      return rejectWithValue(err.message ?? 'Failed to save gratitude entry');
    }
  },
);

// ---------------------------------------------------------------------------
// Async thunks — Streak
// ---------------------------------------------------------------------------

export const fetchStreak = createAsyncThunk(
  'engagement/fetchStreak',
  async (_, {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) return rejectWithValue('Not authenticated');

      const doc = await firestore().collection('users').doc(user.uid).get();
      if (!doc.exists) return null;

      const data = doc.data()!;
      if (!data.streakData) return null;

      return data.streakData as StreakData;
    } catch (err: any) {
      return rejectWithValue(err.message ?? 'Failed to fetch streak');
    }
  },
);

export const recordCheckIn = createAsyncThunk(
  'engagement/recordCheckIn',
  async (_, {getState, rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) return rejectWithValue('Not authenticated');

      const state = getState() as RootState;
      const currentStreak = state.engagement?.streak?.data ?? null;
      const dateStr = todayUTC();

      const newStreakData = computeStreak(currentStreak, dateStr);

      await firestore().collection('users').doc(user.uid).update({
        streakData: newStreakData,
      });

      return newStreakData;
    } catch (err: any) {
      return rejectWithValue(err.message ?? 'Failed to record check-in');
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: EngagementState = {
  gratitude: {
    todayEntry: null,
    pastEntries: [],
    status: 'idle',
    saveStatus: 'idle',
    error: null,
  },
  streak: {
    data: null,
    status: 'idle',
    error: null,
  },
  loadedForUserId: null,
};

const engagementSlice = createSlice({
  name: 'engagement',
  initialState,
  reducers: {
    clearGratitudeSaveStatus(state) {
      state.gratitude.saveStatus = 'idle';
      state.gratitude.error = null;
    },
    clearStreakError(state) {
      state.streak.error = null;
    },
  },
  extraReducers: builder => {
    // --- Fetch today's gratitude ---
    builder.addCase(fetchTodayGratitude.pending, state => {
      state.gratitude.status = 'loading';
      state.gratitude.error = null;
    });
    builder.addCase(fetchTodayGratitude.fulfilled, (state, action) => {
      state.gratitude.status = 'succeeded';
      state.gratitude.todayEntry = action.payload;
    });
    builder.addCase(fetchTodayGratitude.rejected, (state, action) => {
      state.gratitude.status = 'failed';
      state.gratitude.error = action.payload as string;
    });

    // --- Fetch past entries ---
    builder.addCase(fetchPastGratitudeEntries.pending, state => {
      state.gratitude.status = 'loading';
    });
    builder.addCase(fetchPastGratitudeEntries.fulfilled, (state, action) => {
      state.gratitude.status = 'succeeded';
      state.gratitude.pastEntries = action.payload;
    });
    builder.addCase(fetchPastGratitudeEntries.rejected, (state, action) => {
      state.gratitude.status = 'failed';
      state.gratitude.error = action.payload as string;
    });

    // --- Save gratitude entry ---
    builder.addCase(saveGratitudeEntry.pending, state => {
      state.gratitude.saveStatus = 'saving';
      state.gratitude.error = null;
    });
    builder.addCase(
      saveGratitudeEntry.fulfilled,
      (state, action: PayloadAction<GratitudeEntry>) => {
        state.gratitude.saveStatus = 'saved';
        state.gratitude.todayEntry = action.payload;
        // Update past entries list (replace if same date)
        const idx = state.gratitude.pastEntries.findIndex(
          e => e.date === action.payload.date,
        );
        if (idx >= 0) {
          state.gratitude.pastEntries[idx] = action.payload;
        } else {
          state.gratitude.pastEntries.unshift(action.payload);
        }
      },
    );
    builder.addCase(saveGratitudeEntry.rejected, (state, action) => {
      state.gratitude.saveStatus = 'failed';
      state.gratitude.error = action.payload as string;
    });

    // --- Fetch streak ---
    builder.addCase(fetchStreak.pending, state => {
      state.streak.status = 'loading';
      state.streak.error = null;
    });
    builder.addCase(fetchStreak.fulfilled, (state, action) => {
      state.streak.status = 'succeeded';
      state.streak.data = action.payload;
    });
    builder.addCase(fetchStreak.rejected, (state, action) => {
      state.streak.status = 'failed';
      state.streak.error = action.payload as string;
    });

    // --- Record check-in ---
    builder.addCase(recordCheckIn.pending, state => {
      state.streak.status = 'loading';
      state.streak.error = null;
    });
    builder.addCase(
      recordCheckIn.fulfilled,
      (state, action: PayloadAction<StreakData>) => {
        state.streak.status = 'succeeded';
        state.streak.data = action.payload;
      },
    );
    builder.addCase(recordCheckIn.rejected, (state, action) => {
      state.streak.status = 'failed';
      state.streak.error = action.payload as string;
    });

    // Must come last: this registers a matcher, and RTK rejects any
    // addCase that follows one. Clears the slice when the signed-in user
    // changes — see store/userScope.ts.
    addUserScopeReset(builder, initialState);
  },
});

export const {clearGratitudeSaveStatus, clearStreakError} =
  engagementSlice.actions;

export default engagementSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const selectEngagement = (state: RootState) => state.engagement;

export const selectTodayGratitudeEntry = createSelector(
  selectEngagement,
  e => e.gratitude.todayEntry,
);

export const selectPastGratitudeEntries = createSelector(
  selectEngagement,
  e => e.gratitude.pastEntries,
);

export const selectGratitudeStatus = createSelector(
  selectEngagement,
  e => e.gratitude.status,
);

export const selectGratitudeSaveStatus = createSelector(
  selectEngagement,
  e => e.gratitude.saveStatus,
);

export const selectGratitudeError = createSelector(
  selectEngagement,
  e => e.gratitude.error,
);

export const selectStreakData = createSelector(
  selectEngagement,
  e => e.streak.data,
);

export const selectStreakStatus = createSelector(
  selectEngagement,
  e => e.streak.status,
);

export const selectCheckedInToday = createSelector(
  selectStreakData,
  streak => streak?.lastCheckIn === todayUTC(),
);
