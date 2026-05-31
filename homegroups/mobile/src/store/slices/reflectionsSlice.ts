// mobile/src/store/slices/reflectionsSlice.ts
import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import {RootState} from '../types';
import {DailyReflectionDocument, GroupDailyThoughtDocument} from '../../types/schema';

export interface ReflectionsState {
  today: DailyReflectionDocument | null;
  groupThought: GroupDailyThoughtDocument | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: ReflectionsState = {
  today: null,
  groupThought: null,
  status: 'idle',
  error: null,
};

/** Compute 1-based day of year */
function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

/** Load today's reflection from Firestore */
export const loadTodayReflection = createAsyncThunk<
  DailyReflectionDocument | null,
  {date?: string; dayOfYear?: number} | undefined,
  {rejectValue: string}
>('reflections/loadToday', async (params, {rejectWithValue}) => {
  try {
    let dayOfYear: number;
    if (params?.dayOfYear) {
      dayOfYear = params.dayOfYear;
    } else if (params?.date) {
      const d = new Date(params.date + 'T12:00:00');
      dayOfYear = getDayOfYear(d);
    } else {
      dayOfYear = getDayOfYear(new Date());
    }

    const docId = dayOfYear.toString().padStart(3, '0');
    const snap = await firestore()
      .collection('daily_reflections')
      .doc(docId)
      .get();

    if (!snap.exists) {
      return null;
    }

    const data = snap.data()!;
    return {
      dayOfYear: data.dayOfYear,
      title: data.title,
      body: data.body,
      theme: data.theme,
      tags: data.tags,
      source: data.source,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as DailyReflectionDocument;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load reflection');
  }
});

/** Load group daily thought for today */
export const loadGroupDailyThought = createAsyncThunk<
  GroupDailyThoughtDocument | null,
  {groupId: string; date?: string},
  {rejectValue: string}
>('reflections/loadGroupThought', async ({groupId, date}, {rejectWithValue}) => {
  try {
    const today = date || new Date().toISOString().split('T')[0];
    const snap = await firestore()
      .collection('groups')
      .doc(groupId)
      .collection('dailyThoughts')
      .doc(today)
      .get();

    if (!snap.exists) {
      return null;
    }

    const data = snap.data()!;
    return {
      date: data.date,
      groupId: data.groupId,
      content: data.content,
      authorId: data.authorId,
      authorName: data.authorName,
      createdAt: data.createdAt,
    } as GroupDailyThoughtDocument;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load group thought');
  }
});

const reflectionsSlice = createSlice({
  name: 'reflections',
  initialState,
  reducers: {
    clearReflectionsError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadTodayReflection.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadTodayReflection.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.today = action.payload;
      })
      .addCase(loadTodayReflection.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(loadGroupDailyThought.fulfilled, (state, action) => {
        state.groupThought = action.payload;
      });
  },
});

export const {clearReflectionsError} = reflectionsSlice.actions;
export default reflectionsSlice.reducer;

export const selectTodayReflection = (state: RootState) =>
  state.reflections.today;
export const selectGroupDailyThought = (state: RootState) =>
  state.reflections.groupThought;
export const selectReflectionsStatus = (state: RootState) =>
  state.reflections.status;
export const selectReflectionsError = (state: RootState) =>
  state.reflections.error;
