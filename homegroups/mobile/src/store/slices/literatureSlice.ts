// mobile/src/store/slices/literatureSlice.ts
import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {
  LiteratureIndexDocument,
  GroupLiteratureBookmarkDocument,
} from '../../types/schema';

// Entity adapter keyed by id
const literatureAdapter = createEntityAdapter<LiteratureIndexDocument>({
  sortComparer: (a, b) => (b.saveCount || 0) - (a.saveCount || 0),
});

export interface LiteratureState {
  items: ReturnType<typeof literatureAdapter.getInitialState>;
  savedIds: string[];
  groupBookmarks: Record<
    string,
    {items: GroupLiteratureBookmarkDocument[]; loaded: boolean}
  >;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  searchQuery: string;
}

const initialState: LiteratureState = {
  items: literatureAdapter.getInitialState(),
  savedIds: [],
  groupBookmarks: {},
  status: 'idle',
  error: null,
  searchQuery: '',
};

/** Load literature index with optional filters */
export const loadLiteratureIndex = createAsyncThunk<
  LiteratureIndexDocument[],
  {tag?: string; program?: string; searchQuery?: string} | undefined,
  {rejectValue: string}
>('literature/loadIndex', async (options, {rejectWithValue}) => {
  try {
    let query: any = firestore()
      .collection('literature_index')
      .where('isApproved', '==', true)
      .orderBy('saveCount', 'desc')
      .limit(50);

    if (options?.program) {
      query = query.where('program', '==', options.program);
    }
    if (options?.tag) {
      query = query.where('tags', 'array-contains', options.tag);
    }

    const snap = await query.get();
    const items = snap.docs.map((doc: any) => ({
      ...doc.data(),
      id: doc.id,
    })) as LiteratureIndexDocument[];

    // Client-side search filter
    if (options?.searchQuery) {
      const q = options.searchQuery.toLowerCase();
      return items.filter(
        item =>
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.tags.some(t => t.toLowerCase().includes(q)),
      );
    }

    return items;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load literature');
  }
});

/** Load current user's saved literature */
export const loadSavedLiterature = createAsyncThunk<
  {savedIds: string[]; items: LiteratureIndexDocument[]},
  void,
  {rejectValue: string}
>('literature/loadSaved', async (_, {rejectWithValue}) => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('Not authenticated');

    const userDoc = await firestore().collection('users').doc(user.uid).get();
    const savedIds: string[] = userDoc.data()?.savedLiteratureIds || [];

    if (savedIds.length === 0) {
      return {savedIds: [], items: []};
    }

    // Fetch in batches of 10
    const items: LiteratureIndexDocument[] = [];
    for (let i = 0; i < savedIds.length; i += 10) {
      const batch = savedIds.slice(i, i + 10);
      const snap = await firestore()
        .collection('literature_index')
        .where('__name__', 'in', batch)
        .get();
      snap.docs.forEach((doc: any) => {
        items.push({...doc.data(), id: doc.id} as LiteratureIndexDocument);
      });
    }

    return {savedIds, items};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load saved literature');
  }
});

/** Load group bookmarks */
export const loadGroupBookmarks = createAsyncThunk<
  {groupId: string; bookmarks: GroupLiteratureBookmarkDocument[]; items: LiteratureIndexDocument[]},
  string,
  {rejectValue: string}
>('literature/loadGroupBookmarks', async (groupId, {rejectWithValue}) => {
  try {
    const snap = await firestore()
      .collection('groups')
      .doc(groupId)
      .collection('literatureBookmarks')
      .get();

    const bookmarks = snap.docs.map((doc: any) =>
      doc.data(),
    ) as GroupLiteratureBookmarkDocument[];

    const literatureIds = bookmarks.map(b => b.literatureId);
    const items: LiteratureIndexDocument[] = [];

    for (let i = 0; i < literatureIds.length; i += 10) {
      const batch = literatureIds.slice(i, i + 10);
      if (batch.length === 0) continue;
      const itemSnap = await firestore()
        .collection('literature_index')
        .where('__name__', 'in', batch)
        .get();
      itemSnap.docs.forEach((doc: any) => {
        items.push({...doc.data(), id: doc.id} as LiteratureIndexDocument);
      });
    }

    return {groupId, bookmarks, items};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load group bookmarks');
  }
});

/** Save or unsave a literature item */
export const saveLiterature = createAsyncThunk<
  {literatureId: string; saved: boolean; newCount: number},
  {literatureId: string; save: boolean},
  {rejectValue: string}
>('literature/save', async ({literatureId, save}, {rejectWithValue}) => {
  try {
    const fn = functions().httpsCallable('saveLiteratureItem');
    const result = await fn({literatureId, save});
    const data = result.data as {saved: boolean; newCount: number};
    return {literatureId, saved: data.saved, newCount: data.newCount};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to save literature item');
  }
});

/** Bookmark literature for group */
export const bookmarkForGroup = createAsyncThunk<
  {groupId: string; literatureId: string; bookmarked: boolean},
  {groupId: string; literatureId: string; note?: string; remove?: boolean},
  {rejectValue: string}
>(
  'literature/bookmarkForGroup',
  async ({groupId, literatureId, note, remove}, {rejectWithValue}) => {
    try {
      const fn = functions().httpsCallable('bookmarkLiteratureForGroup');
      const result = await fn({groupId, literatureId, note, remove});
      const data = result.data as {bookmarked: boolean};
      return {groupId, literatureId, bookmarked: data.bookmarked};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to bookmark literature for group',
      );
    }
  },
);

const literatureSlice = createSlice({
  name: 'literature',
  initialState,
  reducers: {
    setSearchQuery: (state, action) => {
      state.searchQuery = action.payload;
    },
    clearLiteratureError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadLiteratureIndex.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadLiteratureIndex.fulfilled, (state, action) => {
        state.status = 'succeeded';
        literatureAdapter.upsertMany(state.items, action.payload);
      })
      .addCase(loadLiteratureIndex.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(loadSavedLiterature.fulfilled, (state, action) => {
        state.savedIds = action.payload.savedIds;
        literatureAdapter.upsertMany(state.items, action.payload.items);
      })
      .addCase(loadGroupBookmarks.fulfilled, (state, action) => {
        const {groupId, bookmarks, items} = action.payload;
        state.groupBookmarks[groupId] = {items: bookmarks, loaded: true};
        literatureAdapter.upsertMany(state.items, items);
      })
      .addCase(saveLiterature.fulfilled, (state, action) => {
        const {literatureId, saved, newCount} = action.payload;
        if (saved) {
          if (!state.savedIds.includes(literatureId)) {
            state.savedIds.push(literatureId);
          }
        } else {
          state.savedIds = state.savedIds.filter(id => id !== literatureId);
        }
        // Update count in entity
        const existing = state.items.entities[literatureId];
        if (existing) {
          existing.saveCount = newCount;
        }
      });
  },
});

export const {setSearchQuery, clearLiteratureError} = literatureSlice.actions;
export default literatureSlice.reducer;

// Selectors
const literatureSelectors = literatureAdapter.getSelectors<RootState>(
  state => state.literature.items,
);

export const selectAllLiterature = literatureSelectors.selectAll;
export const selectLiteratureById = literatureSelectors.selectById;

export const selectSavedLiterature = (state: RootState) => {
  const {savedIds} = state.literature;
  return savedIds
    .map(id => state.literature.items.entities[id])
    .filter((item): item is LiteratureIndexDocument => item !== undefined);
};

export const selectGroupBookmarks = (state: RootState, groupId: string) =>
  state.literature.groupBookmarks[groupId]?.items || [];

export const selectLiteratureStatus = (state: RootState) =>
  state.literature.status;

export const selectLiteratureSearchQuery = (state: RootState) =>
  state.literature.searchQuery;

export const selectIsLiteratureSaved = (
  state: RootState,
  literatureId: string,
) => state.literature.savedIds.includes(literatureId);
