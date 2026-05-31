import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {RootState} from '../types';
import {
  AdminRemovalRequest,
  AdminRemovalVote,
} from '../../types/domain/admin-removal';
import {
  AdminRemovalRequestDocument,
  AdminRemovalVoteDocument,
  COLLECTION_PATHS,
} from '../../types/schema';

function docToRequest(doc: any, id: string): AdminRemovalRequest {
  const d = doc as AdminRemovalRequestDocument;
  return {
    id,
    groupId: d.groupId,
    targetAdminId: d.targetAdminId,
    targetAdminName: d.targetAdminName,
    initiatedBy: d.initiatedBy,
    initiatedByName: d.initiatedByName,
    reason: d.reason,
    status: d.status,
    createdAt: d.createdAt.toDate().toISOString(),
    expiresAt: d.expiresAt.toDate().toISOString(),
    resolvedAt: d.resolvedAt?.toDate().toISOString(),
    votesFor: d.votesFor,
    votesAgainst: d.votesAgainst,
    votesAbstain: d.votesAbstain,
    totalEligibleVoters: d.totalEligibleVoters,
    adminResponse: d.adminResponse,
    adminRespondedAt: d.adminRespondedAt?.toDate().toISOString(),
  };
}

const requestsAdapter = createEntityAdapter<AdminRemovalRequest>({
  sortComparer: (a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
});

export interface AdminRemovalState {
  requests: ReturnType<typeof requestsAdapter.getInitialState>;
  groupRequestIds: Record<string, string[]>;
  votes: Record<string, AdminRemovalVote[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AdminRemovalState = {
  requests: requestsAdapter.getInitialState(),
  groupRequestIds: {},
  votes: {},
  status: 'idle',
  error: null,
};

export const fetchAdminRemovalRequests = createAsyncThunk(
  'adminRemoval/fetchRequests',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.ADMIN_REMOVAL_REQUESTS)
        .where('groupId', '==', groupId)
        .orderBy('createdAt', 'desc')
        .get();
      const requests = snapshot.docs.map(doc =>
        docToRequest(doc.data(), doc.id),
      );
      return {groupId, requests};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch removal requests',
      );
    }
  },
);

export const fetchRemovalVotes = createAsyncThunk(
  'adminRemoval/fetchVotes',
  async (requestId: string, {rejectWithValue}) => {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.ADMIN_REMOVAL_VOTES(requestId))
        .get();
      const votes: AdminRemovalVote[] = snapshot.docs.map(doc => {
        const d = doc.data() as AdminRemovalVoteDocument;
        return {
          userId: d.userId,
          userName: d.userName,
          vote: d.vote,
          votedAt: d.votedAt.toDate().toISOString(),
        };
      });
      return {requestId, votes};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch votes');
    }
  },
);

export const initiateAdminRemoval = createAsyncThunk(
  'adminRemoval/initiate',
  async (
    params: {
      groupId: string;
      targetAdminId: string;
      targetAdminName: string;
      reason: string;
    },
    {rejectWithValue},
  ) => {
    try {
      const result = await functions()
        .httpsCallable('initiateAdminRemoval')(params);
      return result.data as {requestId: string};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initiate removal');
    }
  },
);

export const castVote = createAsyncThunk(
  'adminRemoval/castVote',
  async (
    params: {requestId: string; vote: 'yes' | 'no' | 'abstain'},
    {rejectWithValue},
  ) => {
    try {
      const result = await functions()
        .httpsCallable('voteOnAdminRemoval')(params);
      return result.data as {success: boolean};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to cast vote');
    }
  },
);

export const submitAdminResponse = createAsyncThunk(
  'adminRemoval/submitResponse',
  async (
    params: {requestId: string; response: string},
    {rejectWithValue},
  ) => {
    try {
      const result = await functions()
        .httpsCallable('submitAdminRemovalResponse')(params);
      return result.data as {success: boolean};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to submit response');
    }
  },
);

const adminRemovalSlice = createSlice({
  name: 'adminRemoval',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchAdminRemovalRequests.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAdminRemovalRequests.fulfilled, (state, action) => {
        state.status = 'succeeded';
        requestsAdapter.upsertMany(state.requests, action.payload.requests);
        state.groupRequestIds[action.payload.groupId] =
          action.payload.requests.map(r => r.id);
      })
      .addCase(fetchAdminRemovalRequests.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(fetchRemovalVotes.fulfilled, (state, action) => {
        state.votes[action.payload.requestId] = action.payload.votes;
      });
  },
});

export default adminRemovalSlice.reducer;

const requestsSelectors = requestsAdapter.getSelectors(
  (state: RootState) => state.adminRemoval.requests,
);

export const selectRemovalRequestsByGroup = createSelector(
  [
    (state: RootState) => state.adminRemoval.groupRequestIds,
    requestsSelectors.selectEntities,
    (_: RootState, groupId: string) => groupId,
  ],
  (groupRequestIds, entities, groupId) =>
    (groupRequestIds[groupId] || [])
      .map(id => entities[id])
      .filter((r): r is AdminRemovalRequest => r !== undefined),
);

export const selectPendingRequestsForGroup = createSelector(
  [selectRemovalRequestsByGroup],
  requests => requests.filter(r => r.status === 'pending'),
);

export const selectVotesForRequest = (state: RootState, requestId: string) =>
  state.adminRemoval.votes[requestId] || [];

export const selectAdminRemovalStatus = (state: RootState) =>
  state.adminRemoval.status;
