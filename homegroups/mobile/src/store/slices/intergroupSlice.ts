import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
  PayloadAction,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {IntergroupDocument, GroupDocument} from '../../types/schema';

// Entity adapter for affiliated groups
const affiliatedGroupsAdapter = createEntityAdapter<GroupDocument & { id: string }>();

export interface IntergroupState {
  intergroup: IntergroupDocument | null;
  affiliatedGroups: ReturnType<typeof affiliatedGroupsAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: IntergroupState = {
  intergroup: null,
  affiliatedGroups: affiliatedGroupsAdapter.getInitialState(),
  status: 'idle',
  error: null,
};

// Thunks

export const loadIntergroup = createAsyncThunk<
  IntergroupDocument,
  string,
  {rejectValue: string}
>('intergroup/load', async (intergroupId, {rejectWithValue}) => {
  try {
    const snap = await firestore().collection('intergroups').doc(intergroupId).get();
    if (!snap.exists) throw new Error('Intergroup not found');
    return {id: snap.id, ...snap.data()} as IntergroupDocument;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load intergroup');
  }
});

export const loadAffiliatedGroups = createAsyncThunk<
  (GroupDocument & {id: string})[],
  string,
  {rejectValue: string}
>('intergroup/loadAffiliatedGroups', async (intergroupId, {rejectWithValue}) => {
  try {
    const intergroupSnap = await firestore()
      .collection('intergroups')
      .doc(intergroupId)
      .get();
    if (!intergroupSnap.exists) return [];

    const affiliatedGroupIds: string[] =
      intergroupSnap.data()?.affiliatedGroupIds || [];
    if (affiliatedGroupIds.length === 0) return [];

    const groups: (GroupDocument & {id: string})[] = [];
    // Firestore 'in' queries support max 10 items; batch if needed
    for (let i = 0; i < affiliatedGroupIds.length; i += 10) {
      const batch = affiliatedGroupIds.slice(i, i + 10);
      const snap = await firestore()
        .collection('groups')
        .where(firestore.FieldPath.documentId(), 'in', batch)
        .get();
      snap.docs.forEach(doc => {
        groups.push({id: doc.id, ...doc.data()} as GroupDocument & {id: string});
      });
    }
    return groups;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load affiliated groups');
  }
});

export const affiliateGroup = createAsyncThunk<
  void,
  {intergroupId: string; groupId: string},
  {rejectValue: string}
>('intergroup/affiliateGroup', async ({intergroupId, groupId}, {rejectWithValue}) => {
  try {
    await functions().httpsCallable('affiliateGroupToIntergroup')({
      intergroupId,
      groupId,
    });
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to affiliate group');
  }
});

export const deaffiliateGroup = createAsyncThunk<
  void,
  {intergroupId: string; groupId: string},
  {rejectValue: string}
>('intergroup/deaffiliateGroup', async ({intergroupId, groupId}, {rejectWithValue}) => {
  try {
    await functions().httpsCallable('deaffiliateGroupFromIntergroup')({
      intergroupId,
      groupId,
    });
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to deaffiliate group');
  }
});

const intergroupSlice = createSlice({
  name: 'intergroup',
  initialState,
  reducers: {
    clearIntergroupError: state => {
      state.error = null;
    },
    clearIntergroup: state => {
      state.intergroup = null;
      affiliatedGroupsAdapter.removeAll(state.affiliatedGroups);
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      // loadIntergroup
      .addCase(loadIntergroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(loadIntergroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.intergroup = action.payload;
        state.error = null;
      })
      .addCase(loadIntergroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // loadAffiliatedGroups
      .addCase(loadAffiliatedGroups.pending, state => {
        state.status = 'loading';
      })
      .addCase(loadAffiliatedGroups.fulfilled, (state, action) => {
        state.status = 'succeeded';
        affiliatedGroupsAdapter.setAll(state.affiliatedGroups, action.payload);
        state.error = null;
      })
      .addCase(loadAffiliatedGroups.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Selectors
const affiliatedGroupsSelectors = affiliatedGroupsAdapter.getSelectors<RootState>(
  state => (state as any).intergroup?.affiliatedGroups ?? affiliatedGroupsAdapter.getInitialState(),
);

export const selectIntergroup = (state: RootState) =>
  (state as any).intergroup?.intergroup as IntergroupDocument | null;

export const selectAffiliatedGroups = affiliatedGroupsSelectors.selectAll;

export const selectIntergroupGroupCount = (state: RootState) =>
  (state as any).intergroup?.intergroup?.affiliatedGroupIds?.length ?? 0;

export const selectIsAtGroupLimit = (state: RootState) => {
  const ig = selectIntergroup(state);
  if (!ig) return false;
  return ig.affiliatedGroupIds.length >= ig.maxGroups;
};

export const selectIntergroupStatus = (state: RootState) =>
  (state as any).intergroup?.status ?? 'idle';

export const {clearIntergroupError, clearIntergroup} = intergroupSlice.actions;
export default intergroupSlice.reducer;
