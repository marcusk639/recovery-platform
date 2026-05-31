import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import auth from '@react-native-firebase/auth';
import {GroupModel} from '../../models/GroupModel';
import {UserModel} from '../../models/UserModel';
import {MemberModel} from '../../models/MemberModel';
import {GroupMember} from '../../types';

// Define types
export interface GroupMilestone {
  memberId: string;
  memberName: string;
  date: Date;
  years: number;
}

// Define entity types
export interface GroupMemberEntity extends GroupMember {
  id: string;
}

export interface GroupMilestoneEntity extends GroupMilestone {
  id: string;
}

// Create entity adapters
const membersAdapter = createEntityAdapter<GroupMemberEntity>({
  sortComparer: (a, b) => {
    // Sort by admin status first, then by name
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    return a.name.localeCompare(b.name);
  },
});

const milestonesAdapter = createEntityAdapter<GroupMilestoneEntity>({
  sortComparer: (a, b) => a.date.getTime() - b.date.getTime(),
});

// State interface
export interface MembersState {
  members: ReturnType<typeof membersAdapter.getInitialState>;
  milestones: ReturnType<typeof milestonesAdapter.getInitialState>;
  groupMembers: Record<string, string[]>;
  groupMilestones: Record<string, string[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetched: Record<string, number>;
}

// Initial state
const initialState: MembersState = {
  members: membersAdapter.getInitialState(),
  milestones: milestonesAdapter.getInitialState(),
  groupMembers: {},
  groupMilestones: {},
  status: 'idle',
  error: null,
  lastFetched: {},
};

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Fetch members for a group
export const fetchGroupMembers = createAsyncThunk(
  'members/fetchForGroup',
  async (groupId: string, {getState, rejectWithValue}) => {
    try {
      // Get group to check if it exists
      const group = await GroupModel.getById(groupId);

      if (!group) {
        return rejectWithValue('Group not found');
      }

      // Get members list
      const members = await GroupModel.getMembers(groupId);

      // Sort members - admins first, then by name
      members.sort((a, b) => {
        if (a.isAdmin && !b.isAdmin) return -1;
        if (!a.isAdmin && b.isAdmin) return 1;
        return a.name.localeCompare(b.name);
      });

      return {groupId, members};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch group members');
    }
  },
  {
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;

      // If already loading, don't fetch again
      if (state.members.status === 'loading') return false;

      // Check if data for this group is stale
      return isDataStale(state.members.lastFetched[groupId]);
    },
  },
);

// Fetch group milestones (sobriety celebrations)
export const fetchGroupMilestones = createAsyncThunk(
  'members/fetchMilestones',
  async (
    {groupId, daysAhead = 30}: {groupId: string; daysAhead?: number},
    {rejectWithValue},
  ) => {
    try {
      const milestones = await GroupModel.getGroupMilestones(
        groupId,
        daysAhead,
      );
      return {groupId, milestones};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch group milestones',
      );
    }
  },
);

// Add member to group
export const addMemberToGroup = createAsyncThunk(
  'members/addToGroup',
  async (
    {
      groupId,
      userId,
      isAdmin = false,
      position = '',
    }: {
      groupId: string;
      userId: string;
      isAdmin?: boolean;
      position?: string;
    },
    {rejectWithValue},
  ) => {
    try {
      // Add member to group
      await GroupModel.addMember(groupId, userId, isAdmin);

      // If there's a position, update it
      if (position) {
        await GroupModel.updateMemberPosition(groupId, userId, position);
      }

      // Get user data
      const user = await UserModel.getById(userId);

      if (!user) {
        return rejectWithValue('User not found');
      }

      const member = await MemberModel.getMemberByUserId(userId);
      if (!member) {
        return rejectWithValue('Member not found');
      }

      return member;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to add member to group');
    }
  },
);

// Update member in group
export const updateGroupMember = createAsyncThunk(
  'members/update',
  async (
    {
      groupId,
      userId,
      isAdmin,
      position,
    }: {
      groupId: string;
      userId: string;
      isAdmin?: boolean;
      position?: string;
    },
    {getState, rejectWithValue},
  ) => {
    try {
      const state = getState() as RootState;
      const currentMember = state.members.members.entities[userId];

      if (!currentMember) {
        return rejectWithValue('Member not found');
      }

      // Update admin status if changed
      if (isAdmin !== undefined && isAdmin !== currentMember.isAdmin) {
        if (isAdmin) {
          await GroupModel.makeAdmin(groupId, userId);
        } else {
          await GroupModel.removeAdmin(groupId, userId);
        }
      }

      // Update position if changed
      if (position !== undefined && position !== currentMember.position) {
        await GroupModel.updateMemberPosition(groupId, userId, position);
      }

      // Return updated member data
      return {
        ...currentMember,
        isAdmin: isAdmin !== undefined ? isAdmin : currentMember.isAdmin,
        position: position !== undefined ? position : currentMember.position,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update group member');
    }
  },
);

// Remove member from group
export const removeMemberFromGroup = createAsyncThunk(
  'members/removeFromGroup',
  async (
    {groupId, userId}: {groupId: string; userId: string},
    {getState, rejectWithValue},
  ) => {
    try {
      await GroupModel.removeMember(groupId, userId);
      return {groupId, userId};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to remove member from group',
      );
    }
  },
);

// Add new thunk to update phone number visibility
export const updatePhoneNumberVisibility = createAsyncThunk(
  'members/updatePhoneNumberVisibility',
  async (
    {showPhoneNumber}: {showPhoneNumber: boolean},
    {getState, rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return rejectWithValue('User not authenticated');
      }

      // Update phone number visibility in all memberships
      await MemberModel.updateUserAcrossMemberships(currentUser.uid, {
        showPhoneNumber,
      });

      return {showPhoneNumber};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to update phone number visibility',
      );
    }
  },
);

export const toggleAdmin = createAsyncThunk(
  'members/toggleAdmin',
  async (
    {groupId, userId}: {groupId: string; userId: string},
    {getState, rejectWithValue},
  ) => {
    try {
      const state = getState() as RootState;
      const memberId = `${groupId}_${userId}`;
      const member = state.members.members.entities[memberId];
      if (member?.isAdmin) {
        await GroupModel.removeAdmin(groupId, userId);
      } else {
        await GroupModel.makeAdmin(groupId, userId);
      }
      return {groupId, userId, isAdmin: !member?.isAdmin};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to toggle admin');
    }
  },
);

export const removeMember = createAsyncThunk(
  'members/removeMember',
  async (
    {groupId, userId}: {groupId: string; userId: string},
    {rejectWithValue},
  ) => {
    try {
      await GroupModel.removeMember(groupId, userId);
      return {groupId, userId};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to remove member');
    }
  },
);

// Create the slice
const membersSlice = createSlice({
  name: 'members',
  initialState,
  reducers: {
    clearMembersError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      // Fetch group members
      .addCase(fetchGroupMembers.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchGroupMembers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, members} = action.payload;
        membersAdapter.upsertMany(state.members, members);
        state.groupMembers[groupId] = members.map(m => m.id);
        state.lastFetched[groupId] = Date.now();
        state.error = null;
      })
      .addCase(fetchGroupMembers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Fetch group milestones
      .addCase(fetchGroupMilestones.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchGroupMilestones.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, milestones} = action.payload;
        const milestoneEntities = milestones.map(milestone => ({
          ...milestone,
          id: `${milestone.memberId}-${milestone.date.getTime()}`,
        }));
        milestonesAdapter.upsertMany(state.milestones, milestoneEntities);
        state.groupMilestones[groupId] = milestoneEntities.map(m => m.id);
        state.error = null;
      })
      .addCase(fetchGroupMilestones.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Add member to group
      .addCase(addMemberToGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(addMemberToGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const member = action.payload;
        membersAdapter.upsertOne(state.members, member);
        if (!state.groupMembers[member.groupId]) {
          state.groupMembers[member.groupId] = [];
        }
        state.groupMembers[member.groupId].push(member.id);
        state.error = null;
      })
      .addCase(addMemberToGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Update group member
      .addCase(updateGroupMember.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateGroupMember.fulfilled, (state, action) => {
        state.status = 'succeeded';
        membersAdapter.upsertOne(state.members, action.payload);
        state.error = null;
      })
      .addCase(updateGroupMember.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Remove member from group
      .addCase(removeMemberFromGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(removeMemberFromGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, userId} = action.payload;
        const memberId = `${groupId}_${userId}`;

        // Remove the member entity
        membersAdapter.removeOne(state.members, memberId);

        // Remove from group members list
        if (state.groupMembers[groupId]) {
          state.groupMembers[groupId] = state.groupMembers[groupId].filter(
            id => id !== memberId,
          );
        }

        state.error = null;
      })
      .addCase(removeMemberFromGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Toggle admin
      .addCase(toggleAdmin.fulfilled, (state, action) => {
        const {groupId, userId, isAdmin} = action.payload;
        const memberId = `${groupId}_${userId}`;
        membersAdapter.updateOne(state.members, {
          id: memberId,
          changes: {isAdmin},
        });
      })

      // Remove member
      .addCase(removeMember.fulfilled, (state, action) => {
        const {groupId, userId} = action.payload;
        const memberId = `${groupId}_${userId}`;
        membersAdapter.removeOne(state.members, memberId);

        // Remove from group members list
        if (state.groupMembers[groupId]) {
          state.groupMembers[groupId] = state.groupMembers[groupId].filter(
            id => id !== memberId,
          );
        }
      });
  },
});

// Memoized selectors
const membersSelectors = membersAdapter.getSelectors<RootState>(
  state => state.members.members,
);

const milestonesSelectors = milestonesAdapter.getSelectors<RootState>(
  state => state.members.milestones,
);

export const selectAllMembers = membersSelectors.selectAll;
export const selectMemberById = membersSelectors.selectById;

export const selectMembersByGroupId = createSelector(
  [
    membersSelectors.selectEntities, // returns Record<string, GroupMemberEntity>
    (state: RootState, groupId: string) =>
      state.members.groupMembers[groupId] || [],
  ],
  (entities, memberIds) => memberIds.map(id => entities[id]).filter(Boolean),
);

export const selectGroupAdmins = createSelector(
  [selectMembersByGroupId],
  members =>
    members.filter(
      (member): member is GroupMemberEntity =>
        member !== undefined && member.isAdmin !== undefined && member.isAdmin,
    ),
);

export const selectGroupMilestones = createSelector(
  [
    milestonesSelectors.selectAll,
    (state: RootState, groupId: string) =>
      state.members.groupMilestones[groupId],
  ],
  (allMilestones, milestoneIds) => {
    const ids = milestoneIds || [];
    const milestones = ids
      .map(id => allMilestones.find(m => m.id === id))
      .filter((m): m is GroupMilestoneEntity => m !== undefined);
    return milestones;
  },
);

export const selectMemberByUserId = createSelector(
  [membersSelectors.selectEntities, (_: RootState, userId: string) => userId],
  (entities, userId) => entities[userId],
);

export const selectMembersStatus = (state: RootState) => state.members.status;
export const selectMembersError = (state: RootState) => state.members.error;

export const {clearMembersError} = membersSlice.actions;
export default membersSlice.reducer;
