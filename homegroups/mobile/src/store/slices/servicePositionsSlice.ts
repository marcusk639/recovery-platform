import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import {ServicePosition} from '../../types';
import {ServicePositionModel} from '../../models/ServicePositionModel';
import {extractError} from '../thunkHelpers';

// Define proper entity type
export interface ServicePositionEntity extends ServicePosition {
  id: string;
}

// Create entity adapter for better performance
const servicePositionsAdapter = createEntityAdapter({
  selectId: (position: ServicePositionEntity) => position.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

// Update state interface
export interface ServicePositionsState {
  positions: ReturnType<typeof servicePositionsAdapter.getInitialState>;
  groupPositionIds: Record<string, string[]>;
  memberPositionsByGroup: Record<string, Record<string, string[]>>; // groupId -> memberId -> positionIds
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetchedGroup: Record<string, number>;
}

// Initial State
const initialState: ServicePositionsState = {
  positions: servicePositionsAdapter.getInitialState(),
  groupPositionIds: {},
  memberPositionsByGroup: {},
  status: 'idle',
  error: null,
  lastFetchedGroup: {},
};

// --- Async Thunks ---

export const fetchServicePositionsForGroup = createAsyncThunk<
  ServicePosition[],
  string,
  {state: RootState; rejectValue: string}
>(
  'servicePositions/fetchForGroup',
  async (groupId, {rejectWithValue}) => {
    try {
      return await ServicePositionModel.getPositionsForGroup(groupId);
    } catch (error: unknown) {
      return rejectWithValue(
        extractError(error, 'Failed to fetch service positions'),
      );
    }
  },
  {
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      const lastFetched = state.servicePositions.lastFetchedGroup[groupId];
      if (lastFetched && Date.now() - lastFetched < 1000 * 60 * 5) {
        return false;
      }
    },
  },
);

export const createServicePosition = createAsyncThunk<
  ServicePosition,
  {
    groupId: string;
    name: string;
    description?: string;
    commitmentLength?: number;
    termStartDate?: Date;
    termEndDate?: Date;
  },
  {rejectValue: string}
>(
  'servicePositions/create',
  async (
    {groupId, name, description, commitmentLength, termStartDate, termEndDate},
    {rejectWithValue},
  ) => {
    try {
      return await ServicePositionModel.createPosition(groupId, {
        name,
        description,
        commitmentLength,
        termStartDate,
        termEndDate,
      });
    } catch (error: unknown) {
      return rejectWithValue(
        extractError(error, 'Failed to create service position'),
      );
    }
  },
);

export const updateServicePosition = createAsyncThunk<
  ServicePosition,
  {
    groupId: string;
    positionId: string;
    updateData: Partial<Omit<ServicePosition, 'id' | 'groupId' | 'createdAt'>>;
  },
  {rejectValue: string}
>(
  'servicePositions/update',
  async ({groupId, positionId, updateData}, {rejectWithValue}) => {
    try {
      return await ServicePositionModel.updatePosition(
        groupId,
        positionId,
        updateData,
      );
    } catch (error: unknown) {
      return rejectWithValue(
        extractError(error, 'Failed to update service position'),
      );
    }
  },
);

export const deleteServicePosition = createAsyncThunk<
  {groupId: string; positionId: string},
  {groupId: string; positionId: string},
  {rejectValue: string}
>(
  'servicePositions/delete',
  async ({groupId, positionId}, {rejectWithValue}) => {
    try {
      await ServicePositionModel.deletePosition(groupId, positionId);
      return {groupId, positionId};
    } catch (error: unknown) {
      return rejectWithValue(extractError(error, 'Failed to delete position'));
    }
  },
);

// --- Slice Definition ---

const servicePositionsSlice = createSlice({
  name: 'servicePositions',
  initialState,
  reducers: {
    clearServicePositionsError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      // Fetch Positions
      .addCase(fetchServicePositionsForGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchServicePositionsForGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const positions = action.payload;
        const positionIds: string[] = [];

        if (positions.length > 0) {
          servicePositionsAdapter.upsertMany(state.positions, positions);
          positionIds.push(...positions.map(pos => pos.id));
          state.groupPositionIds[positions[0].groupId] = positionIds;
          state.lastFetchedGroup[positions[0].groupId] = Date.now();

          // Update member positions mapping
          const groupId = positions[0].groupId;
          if (!state.memberPositionsByGroup[groupId]) {
            state.memberPositionsByGroup[groupId] = {};
          }

          positions.forEach(position => {
            if (position.currentHolderId) {
              if (
                !state.memberPositionsByGroup[groupId][position.currentHolderId]
              ) {
                state.memberPositionsByGroup[groupId][
                  position.currentHolderId
                ] = [];
              }
              if (
                !state.memberPositionsByGroup[groupId][
                  position.currentHolderId
                ].includes(position.id)
              ) {
                state.memberPositionsByGroup[groupId][
                  position.currentHolderId
                ].push(position.id);
              }
            }
          });
        } else {
          state.groupPositionIds[action.meta.arg] = [];
          state.lastFetchedGroup[action.meta.arg] = Date.now();
        }

        state.error = null;
      })
      .addCase(fetchServicePositionsForGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Create Position
      .addCase(createServicePosition.pending, state => {
        state.status = 'loading';
      })
      .addCase(createServicePosition.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const newPosition = action.payload;
        servicePositionsAdapter.upsertOne(state.positions, newPosition);
        if (!state.groupPositionIds[newPosition.groupId]) {
          state.groupPositionIds[newPosition.groupId] = [];
        }
        state.groupPositionIds[newPosition.groupId].push(newPosition.id);
        state.error = null;
      })
      .addCase(createServicePosition.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Update Position
      .addCase(updateServicePosition.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateServicePosition.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const updatedPosition = action.payload;
        servicePositionsAdapter.upsertOne(state.positions, updatedPosition);

        // Update member positions mapping
        const groupId = updatedPosition.groupId;
        if (!state.memberPositionsByGroup[groupId]) {
          state.memberPositionsByGroup[groupId] = {};
        }

        // Remove position from old holder if exists
        const oldPosition = state.positions.entities[updatedPosition.id];
        if (oldPosition?.currentHolderId) {
          const oldHolderPositions =
            state.memberPositionsByGroup[groupId][oldPosition.currentHolderId];
          if (oldHolderPositions) {
            state.memberPositionsByGroup[groupId][oldPosition.currentHolderId] =
              oldHolderPositions.filter(id => id !== updatedPosition.id);
          }
        }

        // Add position to new holder if exists
        if (updatedPosition.currentHolderId) {
          if (
            !state.memberPositionsByGroup[groupId][
              updatedPosition.currentHolderId
            ]
          ) {
            state.memberPositionsByGroup[groupId][
              updatedPosition.currentHolderId
            ] = [];
          }
          if (
            !state.memberPositionsByGroup[groupId][
              updatedPosition.currentHolderId
            ].includes(updatedPosition.id)
          ) {
            state.memberPositionsByGroup[groupId][
              updatedPosition.currentHolderId
            ].push(updatedPosition.id);
          }
        }

        state.error = null;
      })
      .addCase(updateServicePosition.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Delete Position
      .addCase(deleteServicePosition.pending, state => {
        state.status = 'loading';
      })
      .addCase(deleteServicePosition.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, positionId} = action.payload;
        servicePositionsAdapter.removeOne(state.positions, positionId);
        if (state.groupPositionIds[groupId]) {
          state.groupPositionIds[groupId] = state.groupPositionIds[
            groupId
          ].filter(id => id !== positionId);
        }
        state.error = null;
      })
      .addCase(deleteServicePosition.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Optimize selectors with proper memoization
export const selectAllServicePositions = createSelector(
  [(state: RootState) => state.servicePositions.positions],
  positions => servicePositionsAdapter.getSelectors().selectAll(positions),
);

export const selectGroupPositionIds = (state: RootState, groupId: string) =>
  state.servicePositions.groupPositionIds[groupId];

export const selectServicePositionsByGroup = createSelector(
  [
    (state: RootState) => state.servicePositions.positions,
    (state: RootState, groupId: string) => groupId,
  ],
  (positions, groupId) => {
    const entities = positions.entities;
    return Object.values(entities).filter(
      (position): position is ServicePositionEntity =>
        position !== undefined && position.groupId === groupId,
    );
  },
);

export const selectServicePositionById = (
  state: RootState,
  positionId: string,
) => {
  return servicePositionsAdapter
    .getSelectors()
    .selectById(state.servicePositions.positions, positionId);
};

export const selectServicePositionsByMember = createSelector(
  [
    (state: RootState) => state.servicePositions.positions,
    (state: RootState, memberId: string) => memberId,
  ],
  (positions, memberId) => {
    const entities = positions.entities;
    return Object.values(entities).filter(
      (position): position is ServicePositionEntity =>
        position !== undefined && position.currentHolderId === memberId,
    );
  },
);

// Simple selectors that don't need memoization
export const selectServicePositionsStatus = (state: RootState) =>
  state.servicePositions.status;
export const selectServicePositionsError = (state: RootState) =>
  state.servicePositions.error;

export const {clearServicePositionsError} = servicePositionsSlice.actions;
export default servicePositionsSlice.reducer;

// Add new selector for efficient lookup
export const selectMemberServicePositionsForGroup = createSelector(
  [
    (state: RootState) => state.servicePositions.positions,
    (state: RootState) => state.servicePositions.memberPositionsByGroup,
    (state: RootState, groupId: string) => groupId,
    (state: RootState, groupId: string, memberId: string) => memberId,
  ],
  (positions, memberPositionsByGroup, groupId, memberId) => {
    const positionIds = memberPositionsByGroup[groupId]?.[memberId] || [];
    return positionIds
      .map((id: string) => positions.entities[id])
      .filter(
        (position): position is ServicePositionEntity => position !== undefined,
      );
  },
);

// Add new selector for efficient group positions lookup
export const selectServicePositionsForGroup = createSelector(
  [
    (state: RootState) => state.servicePositions.positions,
    (state: RootState) => state.servicePositions.groupPositionIds,
    (state: RootState, groupId: string) => groupId,
  ],
  (positions, groupPositionIds, groupId) => {
    const positionIds = groupPositionIds[groupId] || [];
    return positionIds
      .map((id: string) => positions.entities[id])
      .filter(
        (position): position is ServicePositionEntity => position !== undefined,
      );
  },
);

// Selector to check if a user is the Treasurer for a group (cached, no Firestore calls)
export const selectIsTreasurerForGroup = createSelector(
  [
    (state: RootState) => state.servicePositions.positions,
    (state: RootState, groupId: string) => groupId,
    (state: RootState, groupId: string, userId: string) => userId,
  ],
  (positions, groupId, userId) => {
    const allPositions = Object.values(positions.entities);
    return allPositions.some(
      position =>
        position &&
        position.groupId === groupId &&
        position.name === 'Treasurer' &&
        position.currentHolderId === userId,
    );
  },
);
