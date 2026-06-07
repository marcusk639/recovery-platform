import {
  createSlice,
  createAsyncThunk,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import firestore from '@react-native-firebase/firestore';
import {BrandingDocument} from '../../types/schema';

export interface BrandingState {
  branding: BrandingDocument | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: BrandingState = {
  branding: null,
  status: 'idle',
  error: null,
};

/**
 * loadBrandingForUser — resolves branding based on user's groups' orgId.
 * Accepts the list of homeGroup IDs from the auth state.
 */
export const loadBrandingForUser = createAsyncThunk<
  BrandingDocument | null,
  string[],  // homeGroupIds
  {rejectValue: string}
>('branding/loadForUser', async (homeGroupIds, {rejectWithValue}) => {
  try {
    if (!homeGroupIds || homeGroupIds.length === 0) return null;

    // Check each group for an orgId (check up to 5 groups to avoid excessive reads)
    for (const groupId of homeGroupIds.slice(0, 5)) {
      const groupSnap = await firestore().collection('groups').doc(groupId).get();
      if (!groupSnap.exists) continue;

      const orgId = groupSnap.data()?.orgId as string | undefined;
      if (!orgId) continue;

      // Load the intergroup to get brandingId
      const intergroupSnap = await firestore()
        .collection('intergroups')
        .doc(orgId)
        .get();
      if (!intergroupSnap.exists) continue;

      const brandingId = intergroupSnap.data()?.brandingId as string | undefined;
      if (!brandingId) continue;

      // Load branding document (only approved)
      const brandingSnap = await firestore()
        .collection('branding')
        .doc(brandingId)
        .get();
      if (!brandingSnap.exists) continue;

      const brandingData = brandingSnap.data()!;
      if (brandingData.status !== 'approved') continue;

      return {id: brandingSnap.id, ...brandingData} as BrandingDocument;
    }

    return null;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load branding');
  }
});

const brandingSlice = createSlice({
  name: 'branding',
  initialState,
  reducers: {
    clearBranding: state => {
      state.branding = null;
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadBrandingForUser.pending, state => {
        state.status = 'loading';
      })
      .addCase(loadBrandingForUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.branding = action.payload;
        state.error = null;
      })
      .addCase(loadBrandingForUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Selectors
export const selectBranding = (state: RootState) =>
  (state as any).branding?.branding as BrandingDocument | null;

export const selectPrimaryColor = (state: RootState) =>
  (state as any).branding?.branding?.primaryColor ?? '#2196F3';

export const selectAccentColor = (state: RootState) =>
  (state as any).branding?.branding?.accentColor ?? '#4CAF50';

export const selectOrgName = (state: RootState) =>
  (state as any).branding?.branding?.orgName ?? 'Homegroups';

export const selectBrandingStatus = (state: RootState) =>
  (state as any).branding?.status ?? 'idle';

export const {clearBranding} = brandingSlice.actions;
export default brandingSlice.reducer;
