// mobile/src/store/slices/groupResourcesSlice.ts
import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {GroupResourceDocument} from '../../types/schema';

const resourcesAdapter = createEntityAdapter<GroupResourceDocument>({
  sortComparer: (a, b) => {
    const aTime =
      a.createdAt && typeof (a.createdAt as any).toDate === 'function'
        ? (a.createdAt as any).toDate().getTime()
        : 0;
    const bTime =
      b.createdAt && typeof (b.createdAt as any).toDate === 'function'
        ? (b.createdAt as any).toDate().getTime()
        : 0;
    return bTime - aTime;
  },
});

export interface GroupResourcesState {
  resources: ReturnType<typeof resourcesAdapter.getInitialState>;
  groupResourceIds: Record<string, string[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  uploading: boolean;
  uploadProgress: number;
}

const initialState: GroupResourcesState = {
  resources: resourcesAdapter.getInitialState(),
  groupResourceIds: {},
  status: 'idle',
  error: null,
  uploading: false,
  uploadProgress: 0,
};

/** Load active resources for a group */
export const loadGroupResources = createAsyncThunk<
  {groupId: string; resources: GroupResourceDocument[]},
  string,
  {rejectValue: string}
>('groupResources/load', async (groupId, {rejectWithValue}) => {
  try {
    const snap = await firestore()
      .collection('groups')
      .doc(groupId)
      .collection('resources')
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const resources = snap.docs.map((doc: any) => ({
      ...doc.data(),
      id: doc.id,
    })) as GroupResourceDocument[];

    return {groupId, resources};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to load group resources');
  }
});

/** Upload a file resource to Storage + write Firestore doc */
export const uploadGroupResource = createAsyncThunk<
  GroupResourceDocument,
  {
    groupId: string;
    title: string;
    description?: string;
    fileUri: string;
    filename: string;
    fileSize?: number;
    resourceType?: GroupResourceDocument['type'];
  },
  {rejectValue: string; dispatch: any}
>(
  'groupResources/upload',
  async (
    {groupId, title, description, fileUri, filename, fileSize, resourceType},
    {rejectWithValue, dispatch},
  ) => {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('Not authenticated');

      // Generate a resource ID
      const resourceId = firestore().collection('_temp').doc().id;
      const storagePath = `groups/${groupId}/resources/${resourceId}/${filename}`;
      const storageRef = storage().ref(storagePath);

      // Upload file
      const task = storageRef.putFile(fileUri);

      task.on('state_changed', snapshot => {
        const progress =
          snapshot.totalBytes > 0
            ? snapshot.bytesTransferred / snapshot.totalBytes
            : 0;
        dispatch(setUploadProgress(progress));
      });

      await task;
      const downloadUrl = await storageRef.getDownloadURL();

      // Fetch uploader name
      const userDoc = await firestore().collection('users').doc(user.uid).get();
      const uploaderName = userDoc.data()?.displayName || user.email || 'Admin';

      const now = firestore.Timestamp.now();
      const resourceData: GroupResourceDocument = {
        id: resourceId,
        groupId,
        title: title.trim(),
        type: resourceType || 'other',
        source: 'upload',
        storageRef: storagePath,
        downloadUrl,
        filename,
        uploadedBy: user.uid,
        uploaderName,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        ...(description ? {description: description.trim()} : {}),
        ...(fileSize ? {fileSize} : {}),
      };

      await firestore()
        .collection('groups')
        .doc(groupId)
        .collection('resources')
        .doc(resourceId)
        .set(resourceData);

      return resourceData;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to upload resource');
    }
  },
);

/** Add an external link resource (no Storage) — admin writes directly */
export const addGroupResourceLink = createAsyncThunk<
  GroupResourceDocument,
  {
    groupId: string;
    title: string;
    description?: string;
    url: string;
    type: GroupResourceDocument['type'];
  },
  {rejectValue: string}
>(
  'groupResources/addLink',
  async ({groupId, title, description, url, type}, {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('Not authenticated');

      const userDoc = await firestore().collection('users').doc(user.uid).get();
      const uploaderName = userDoc.data()?.displayName || user.email || 'Admin';

      const now = firestore.Timestamp.now();
      const resourceRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('resources')
        .doc();

      const resourceData: GroupResourceDocument = {
        id: resourceRef.id,
        groupId,
        title: title.trim(),
        type,
        source: 'external_link',
        externalUrl: url.trim(),
        uploadedBy: user.uid,
        uploaderName,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        ...(description ? {description: description.trim()} : {}),
      };

      await resourceRef.set(resourceData);
      return resourceData;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to add resource link',
      );
    }
  },
);

/** Delete a group resource via CF */
export const deleteGroupResource = createAsyncThunk<
  {groupId: string; resourceId: string},
  {groupId: string; resourceId: string},
  {rejectValue: string}
>(
  'groupResources/delete',
  async ({groupId, resourceId}, {rejectWithValue}) => {
    try {
      const fn = functions().httpsCallable('deleteGroupResource');
      await fn({groupId, resourceId});
      return {groupId, resourceId};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to delete group resource',
      );
    }
  },
);

const groupResourcesSlice = createSlice({
  name: 'groupResources',
  initialState,
  reducers: {
    setUploadProgress: (state, action) => {
      state.uploadProgress = action.payload;
    },
    clearGroupResourcesError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadGroupResources.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadGroupResources.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, resources} = action.payload;
        resourcesAdapter.upsertMany(state.resources, resources);
        state.groupResourceIds[groupId] = resources.map(r => r.id);
      })
      .addCase(loadGroupResources.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(uploadGroupResource.pending, state => {
        state.uploading = true;
        state.uploadProgress = 0;
        state.error = null;
      })
      .addCase(uploadGroupResource.fulfilled, (state, action) => {
        state.uploading = false;
        state.uploadProgress = 0;
        const resource = action.payload;
        resourcesAdapter.upsertOne(state.resources, resource);
        if (!state.groupResourceIds[resource.groupId]) {
          state.groupResourceIds[resource.groupId] = [];
        }
        state.groupResourceIds[resource.groupId].unshift(resource.id);
      })
      .addCase(uploadGroupResource.rejected, (state, action) => {
        state.uploading = false;
        state.uploadProgress = 0;
        state.error = action.payload as string;
      })
      .addCase(addGroupResourceLink.fulfilled, (state, action) => {
        const resource = action.payload;
        resourcesAdapter.upsertOne(state.resources, resource);
        if (!state.groupResourceIds[resource.groupId]) {
          state.groupResourceIds[resource.groupId] = [];
        }
        state.groupResourceIds[resource.groupId].unshift(resource.id);
      })
      .addCase(deleteGroupResource.fulfilled, (state, action) => {
        const {groupId, resourceId} = action.payload;
        resourcesAdapter.removeOne(state.resources, resourceId);
        if (state.groupResourceIds[groupId]) {
          state.groupResourceIds[groupId] = state.groupResourceIds[
            groupId
          ].filter(id => id !== resourceId);
        }
      });
  },
});

export const {setUploadProgress, clearGroupResourcesError} =
  groupResourcesSlice.actions;
export default groupResourcesSlice.reducer;

// Selectors
const resourceSelectors = resourcesAdapter.getSelectors<RootState>(
  state => state.groupResources.resources,
);

export const selectAllGroupResources = resourceSelectors.selectAll;

export const selectGroupResources = (state: RootState, groupId: string) => {
  const ids = state.groupResources.groupResourceIds[groupId] || [];
  return ids
    .map(id => state.groupResources.resources.entities[id])
    .filter((r): r is GroupResourceDocument => r !== undefined);
};

export const selectGroupResourcesStatus = (state: RootState) =>
  state.groupResources.status;

export const selectUploadProgress = (state: RootState) =>
  state.groupResources.uploadProgress;

export const selectIsUploading = (state: RootState) =>
  state.groupResources.uploading;
