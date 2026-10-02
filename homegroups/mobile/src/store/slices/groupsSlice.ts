import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createSelector,
  createEntityAdapter,
} from '@reduxjs/toolkit';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {HomeGroup, Meeting, PaymentLinks} from '../../types';
import {GroupModel} from '../../models/GroupModel';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {trackActivity} from '../../services/activityTracker';
import {syncUserClaims} from '../../services/firebase/auth';
import {setUser} from './authSlice';

// Define proper entity types
interface GroupEntity extends HomeGroup {
  id: string;
}

// Create entity adapter for better performance
const groupsAdapter = createEntityAdapter({
  selectId: (group: GroupEntity) => group.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

// Update state interface
export interface GroupsState {
  groups: ReturnType<typeof groupsAdapter.getInitialState>;
  memberGroups: string[];
  adminGroups: string[];
  /**
   * The uid `memberGroups`/`adminGroups` were loaded for. Group membership is
   * sensitive, so a membership list is only ever shown to the user it was read
   * for — never to whoever happens to be signed in later.
   */
  memberGroupsUserId: string | null;
  /**
   * In-flight `fetchUserGroups` requests, keyed by requestId, each holding the
   * uid that was signed in when the read was issued. An entry is removed when
   * the read settles, and when anything invalidates it (the user switched, or
   * the user changed their own membership), so a late payload carrying another
   * user's — or pre-change — membership can be recognised and dropped.
   */
  membershipRequests: Record<string, string | null>;
  /**
   * In-flight membership *mutations* (join/create), keyed by requestId, each
   * holding the uid that issued it. Separate from `membershipRequests`
   * because a mutation invalidates in-flight reads but must NOT invalidate a
   * sibling mutation the same user started concurrently.
   */
  membershipMutations: Record<string, string | null>;
  nearbyGroups: HomeGroup[];
  searchResults: HomeGroup[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetched: Record<string, number>;
}

// Update initial state
const initialState: GroupsState = {
  groups: groupsAdapter.getInitialState(),
  memberGroups: [],
  adminGroups: [],
  memberGroupsUserId: null,
  membershipRequests: {},
  membershipMutations: {},
  nearbyGroups: [],
  searchResults: [],
  status: 'idle',
  error: null,
  lastFetched: {},
};

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

/** The uid Firebase currently considers signed in, or null if nobody is. */
const signedInUid = (): string | null => auth().currentUser?.uid ?? null;

/**
 * Whether a settled request may still speak for the signed-in user's
 * membership: it must still be tracked — `setUser` drops requests issued for
 * anyone else, and a membership change clears the map — and the uid it was
 * issued for must still be the one signed in. Consumes the entry either way,
 * so a request is honoured at most once.
 */
const isCurrentUsersRequest = (
  state: GroupsState,
  requestId: string,
): boolean => {
  const issuedForUid = state.membershipRequests[requestId];
  const stillTracked = requestId in state.membershipRequests;
  delete state.membershipRequests[requestId];
  return stillTracked && issuedForUid === signedInUid();
};

/** The same test for an in-flight join/create. */
const isCurrentUsersMutation = (
  state: GroupsState,
  requestId: string,
): boolean => {
  const issuedForUid = state.membershipMutations[requestId];
  const stillTracked = requestId in state.membershipMutations;
  delete state.membershipMutations[requestId];
  return stillTracked && issuedForUid === signedInUid();
};

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Async thunks
export const fetchUserGroups = createAsyncThunk(
  'groups/fetchUserGroups',
  async (_, {getState, rejectWithValue}) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return rejectWithValue('User not authenticated');
      }

      const userGroups = await GroupModel.getUserGroups(currentUser.uid);
      return {groups: userGroups, userId: currentUser.uid};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch user groups');
    }
  },
  {
    // Only fetch if data is stale or empty
    condition: (_, {getState}) => {
      const state = getState() as RootState;
      const {status, lastFetched, memberGroups} = state.groups;

      // If already loading, don't fetch again
      if (status === 'loading') return false;

      // Always fetch if we have no groups loaded
      if (memberGroups.length === 0) return true;

      // Check if any of the user's existing groups data is stale
      const isAnyGroupStale = memberGroups.some(groupId =>
        isDataStale(lastFetched[groupId]),
      );

      return isAnyGroupStale;
    },
  },
);

export const fetchGroupById = createAsyncThunk(
  'groups/fetchGroupById',
  async (groupId: string, {getState, rejectWithValue}) => {
    try {
      const group = await GroupModel.getById(groupId);
      if (!group) {
        return rejectWithValue('Group not found');
      }
      return group;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch group');
    }
  },
  {
    // Only fetch if data is stale
    condition: (groupId, {getState}) => {
      const state = getState() as RootState;
      const lastFetchTime = state.groups.lastFetched[groupId];

      return isDataStale(lastFetchTime);
    },
  },
);

export const createGroup = createAsyncThunk(
  'groups/create',
  async (
    {
      groupData,
      meetings,
      paymentMethodId,
      onSuccess,
    }: {
      groupData: Partial<HomeGroup>;
      meetings: Meeting[];
      paymentMethodId: string;
      onSuccess?: (group: HomeGroup) => void;
    },
    {rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return rejectWithValue('No authenticated user');
      }

      const createGroupWithSubscriptionCallable = functions().httpsCallable<
        unknown,
        {success: boolean; group: HomeGroup}
      >('createGroupWithSubscription');
      const response = await createGroupWithSubscriptionCallable({
        groupData,
        meetings,
        paymentMethodId,
      });

      const {success, group} = response.data;

      if (!success || !group) {
        return rejectWithValue('Failed to create group with subscription.');
      }

      // Call onSuccess callback if provided
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(group);
      }

      return group;
    } catch (error: any) {
      console.error('Error creating group with subscription:', error);
      return rejectWithValue(
        error.message || 'Failed to create group with subscription.',
      );
    }
  },
);

export const completeDonation = createAsyncThunk(
  'groups/completeDonation',
  async (
    {
      groupId,
      amount,
      donationId,
    }: {groupId: string; amount: number; donationId: string},
    {rejectWithValue},
  ) => {
    try {
      const updatedGroup = await GroupModel.completeDonation(
        groupId,
        amount,
        donationId,
      );
      return updatedGroup;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to complete donation');
    }
  },
);

export const updateGroup = createAsyncThunk(
  'groups/updateGroup',
  async (
    {groupId, groupData}: {groupId: string; groupData: Partial<HomeGroup>},
    {rejectWithValue},
  ) => {
    try {
      const updatedGroup = await GroupModel.update(groupId, groupData);

      // Track group admin action for inactivity detection
      const currentUser = auth().currentUser;
      if (currentUser) {
        trackActivity(currentUser.uid, 'group_action', groupId);
      }

      return updatedGroup;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update group');
    }
  },
);

// Update group payment links (simple donation setup)
export const updateGroupPaymentLinks = createAsyncThunk(
  'groups/updatePaymentLinks',
  async (
    {groupId, paymentLinks}: {groupId: string; paymentLinks: PaymentLinks},
    {rejectWithValue},
  ) => {
    try {
      const updatedGroup = await GroupModel.update(groupId, {paymentLinks});

      // Track admin action
      const currentUser = auth().currentUser;
      if (currentUser) {
        trackActivity(currentUser.uid, 'group_action', groupId);
      }

      return updatedGroup;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update payment links');
    }
  },
);

export const joinGroup = createAsyncThunk(
  'groups/joinGroup',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return rejectWithValue('User not authenticated');
      }

      await GroupModel.addMember(groupId, currentUser.uid);

      try {
        // Sync claims via Cloud Function and refresh token
        await syncUserClaims();
        console.log('Claims synced after joining group');
      } catch (claimsError) {
        // Log but don't fail - claims will eventually sync
        console.warn('Failed to sync claims after joining group:', claimsError);
      }

      // Fetch updated group data
      const updatedGroup = await GroupModel.getById(groupId);
      return updatedGroup;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to join group');
    }
  },
);

export const leaveGroup = createAsyncThunk(
  'groups/leaveGroup',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return rejectWithValue('User not authenticated');
      }

      await GroupModel.removeMember(groupId, currentUser.uid);

      try {
        // Sync claims via Cloud Function and refresh token
        await syncUserClaims();
        console.log('Claims synced after leaving group');
      } catch (claimsError) {
        // Log but don't fail - claims will eventually sync
        console.warn('Failed to sync claims after leaving group:', claimsError);
      }

      return groupId;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to leave group');
    }
  },
);

// Search groups by name and/or location
export const searchGroups = createAsyncThunk(
  'groups/search',
  async (
    {
      name,
      location,
      coordinates,
      limit = 20,
    }: {
      name?: string;
      location?: string;
      coordinates?: {
        latitude: number;
        longitude: number;
        radiusKm?: number;
        programType?: string;
      };
      limit?: number;
    },
    {rejectWithValue},
  ) => {
    try {
      let results: HomeGroup[] = [];

      // When coordinates are provided (and no name), use the geohash Cloud Function
      // for accurate geographic proximity search instead of a naive Firestore scan.
      if (coordinates && !name) {
        const {latitude, longitude, radiusKm, programType} = coordinates;
        const searchGroupsByLocationFn = functions().httpsCallable(
          'searchGroupsByLocation',
        );
        const response = await searchGroupsByLocationFn({
          lat: latitude,
          lng: longitude,
          radius: radiusKm,
          type: programType,
        });
        const data = response.data;
        results = Array.isArray(data) ? data : [];
        return results.slice(0, limit);
      }

      const hasName = name && name.trim().length >= 2;
      const hasLocation = location && location.trim().length >= 2;

      // Search by name if provided
      if (hasName) {
        results = await GroupModel.searchGroups(name!.trim(), limit);

        // If location is also provided, filter name results by location
        if (hasLocation) {
          const locationLower = location!.toLowerCase().trim();
          results = results.filter(group => {
            const city = (group.city || '').toLowerCase();
            const state = (group.state || '').toLowerCase();
            const zip = (group.zip || '').toLowerCase();
            const groupLocation = (group.location || '').toLowerCase();
            return (
              city.includes(locationLower) ||
              state.includes(locationLower) ||
              zip.includes(locationLower) ||
              groupLocation.includes(locationLower)
            );
          });
        }
      } else if (hasLocation) {
        // Location-only text search: search by location text in city/state/zip fields
        const locationLower = location!.toLowerCase().trim();

        // Try searching with location as a name (for groups named after cities)
        const nameResults = await GroupModel.searchGroups(
          location!.trim(),
          limit,
        );

        // Also search by city/state/zip via indexed queries rather than a full scan
        const citySnapshot = await firestore()
          .collection('groups')
          .where('city', '==', location!.trim())
          .limit(limit)
          .get();

        const locationResults: HomeGroup[] = [];
        citySnapshot.docs.forEach(doc => {
          locationResults.push(
            GroupModel.fromFirestore({
              id: doc.id,
              data: () => doc.data() as any,
            }),
          );
        });

        // Merge and deduplicate results
        const merged = new Map<string, HomeGroup>();
        [...nameResults, ...locationResults].forEach(group => {
          if (group.id && !merged.has(group.id)) {
            merged.set(group.id, group);
          }
        });

        results = Array.from(merged.values()).slice(0, limit);
      }

      return results;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to search groups');
    }
  },
);

// Add new thunk for searching groups by location
export const searchGroupsByLocation = createAsyncThunk(
  'groups/searchByLocation',
  async (
    {
      latitude,
      longitude,
      radius = 25,
    }: {
      latitude: number;
      longitude: number;
      radius?: number;
    },
    {rejectWithValue},
  ) => {
    try {
      const groups = await GroupModel.searchGroupsByLocation(
        latitude,
        longitude,
        radius,
      );
      return groups;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to search groups by location',
      );
    }
  },
);

// Add the requestGroupAdminAccess thunk
export const requestGroupAdminAccess = createAsyncThunk(
  'groups/requestGroupAdminAccess',
  async (
    {
      groupId,
      userId,
      message,
      paymentMethodId,
      subscriptionId,
    }: {
      groupId: string;
      userId: string;
      message?: string;
      paymentMethodId?: string; // For in-app payment (Android)
      subscriptionId?: string; // For web-based payment (iOS)
    },
    {rejectWithValue},
  ) => {
    try {
      const requestAdminAccessWithSubscriptionCallable =
        functions().httpsCallable<
          unknown,
          {success: boolean; group: HomeGroup}
        >('requestAdminAccessWithSubscription');
      const response = await requestAdminAccessWithSubscriptionCallable({
        groupId,
        message,
        paymentMethodId,
        subscriptionId,
        userId,
      });

      const {success, group} = response.data;

      if (!success || !group) {
        return rejectWithValue(
          'Failed to request admin access with subscription.',
        );
      }
      return group;
    } catch (error: any) {
      console.error('Error requesting admin access with subscription:', error);
      return rejectWithValue(
        error.message || 'Failed to request admin access with subscription.',
      );
    }
  },
);

// Create the slice
const groupsSlice = createSlice({
  name: 'groups',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    clearSearchResults: state => {
      state.searchResults = [];
    },
  },
  extraReducers: builder => {
    builder
      // Fetch user groups
      .addCase(fetchUserGroups.pending, (state, action) => {
        state.status = 'loading';
        state.membershipRequests[action.meta.requestId] = signedInUid();
      })
      .addCase(fetchUserGroups.fulfilled, (state, action) => {
        state.status = 'succeeded';

        const {groups, userId} = action.payload;
        const issuedForUid = state.membershipRequests[action.meta.requestId];
        const stillTracked = action.meta.requestId in state.membershipRequests;
        delete state.membershipRequests[action.meta.requestId];

        // A membership read may only define the groups list while it is still
        // the current answer: it must not have been invalidated since it was
        // issued (user switch, or the user changing their own membership), and
        // the uid it was read for must still be the signed-in one. Anything
        // else describes someone else's membership, or a past state of this
        // user's, and is dropped rather than rendered.
        if (!stillTracked || issuedForUid !== userId || userId !== signedInUid()) {
          state.error = null;
          return;
        }

        // Add/update groups in the items dictionary
        groups.forEach((group: HomeGroup) => {
          if (group.id) {
            groupsAdapter.upsertOne(state.groups, group);
            state.lastFetched[group.id] = Date.now();
          }
        });

        // Update member and admin groups lists
        state.memberGroups = groups.map((group: HomeGroup) => group.id!);
        state.adminGroups = groups
          .filter((group: HomeGroup) => group.admins.includes(userId))
          .map((group: HomeGroup) => group.id!);
        state.memberGroupsUserId = userId;

        state.error = null;
      })
      .addCase(fetchUserGroups.rejected, (state, action) => {
        state.status = 'failed';
        delete state.membershipRequests[action.meta.requestId];
        state.error =
          (action.payload as string) || 'Failed to fetch user groups';
      })

      // The authenticated user changed. Membership read for the previous uid is
      // not this user's, so it is cleared before anything can render it, and
      // reads issued for anyone else are abandoned.
      .addCase(setUser, (state, action) => {
        const uid = action.payload?.uid ?? null;

        if (uid !== state.memberGroupsUserId) {
          state.memberGroups = [];
          state.adminGroups = [];
          state.memberGroupsUserId = null;
        }

        Object.keys(state.membershipMutations).forEach(requestId => {
          if (state.membershipMutations[requestId] !== uid) {
            delete state.membershipMutations[requestId];
          }
        });

        Object.keys(state.membershipRequests).forEach(requestId => {
          if (state.membershipRequests[requestId] !== uid) {
            delete state.membershipRequests[requestId];
          }
        });
      })

      // Fetch group by id
      .addCase(fetchGroupById.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchGroupById.fulfilled, (state, action) => {
        state.status = 'succeeded';

        // Add/update the group in the items dictionary
        if (action.payload) {
          groupsAdapter.upsertOne(state.groups, action.payload);
          state.lastFetched[action.payload.id!] = Date.now();
        }

        state.error = null;
      })
      .addCase(fetchGroupById.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to fetch group';
      })

      // Create group
      .addCase(createGroup.pending, (state, action) => {
        state.membershipMutations[action.meta.requestId] = signedInUid();
        state.status = 'loading';
      })
      .addCase(createGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const group = action.payload;
        groupsAdapter.upsertOne(state.groups, group);

        // Caching the entity is always safe; adding it to the membership list
        // is not. A create issued by the previous user can resolve after the
        // switch, at which point `??` leaves the new user's tag in place while
        // the group is pushed into their list. Gate it on the same request
        // tracking fetchUserGroups uses: setUser prunes entries issued for
        // anyone else, so an abandoned request is no longer tracked here.
        if (isCurrentUsersMutation(state, action.meta.requestId)) {
          if (!state.memberGroups.includes(group.id!)) {
            state.memberGroups.push(group.id!);
          }
          state.memberGroupsUserId = state.memberGroupsUserId ?? signedInUid();
          state.membershipRequests = {};
        }

        state.error = null;
      })
      .addCase(createGroup.rejected, (state, action) => {
        state.status = 'failed';
        delete state.membershipMutations[action.meta.requestId];
        state.error = (action.payload as string) || 'Failed to create group';
      })

      // Update group
      .addCase(updateGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';

        // Update the group
        groupsAdapter.upsertOne(state.groups, action.payload);
        state.lastFetched[action.payload.id!] = Date.now();

        state.error = null;
      })
      .addCase(updateGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to update group';
      })

      // Update payment links
      .addCase(updateGroupPaymentLinks.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateGroupPaymentLinks.fulfilled, (state, action) => {
        state.status = 'succeeded';
        groupsAdapter.upsertOne(state.groups, action.payload);
        state.lastFetched[action.payload.id!] = Date.now();
        state.error = null;
      })
      .addCase(updateGroupPaymentLinks.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to update payment links';
      })

      // Join group
      .addCase(joinGroup.pending, (state, action) => {
        state.membershipMutations[action.meta.requestId] = signedInUid();
        state.status = 'loading';
      })
      .addCase(joinGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';

        // Consume the tracked request before anything can short-circuit: the
        // thunk returns GroupModel.getById(), typed HomeGroup | null, so a
        // read-after-write miss resolves here with no payload and would
        // otherwise strand the entry for the rest of the session.
        const isOwnJoin = isCurrentUsersMutation(state, action.meta.requestId);

        if (action.payload) {
          // Update the group
          groupsAdapter.upsertOne(state.groups, action.payload);
          state.lastFetched[action.payload.id!] = Date.now();

          // Caching the entity is always safe; adding it to the membership
          // list is not — see the note on createGroup.fulfilled.
          if (isOwnJoin) {
            if (!state.memberGroups.includes(action.payload.id!)) {
              state.memberGroups.push(action.payload.id!);
            }
            state.memberGroupsUserId =
              state.memberGroupsUserId ?? signedInUid();
            state.membershipRequests = {};
          }
        }

        state.error = null;
      })
      .addCase(joinGroup.rejected, (state, action) => {
        state.status = 'failed';
        delete state.membershipMutations[action.meta.requestId];
        state.error = (action.payload as string) || 'Failed to join group';
      })

      // Leave group
      .addCase(leaveGroup.pending, state => {
        state.status = 'loading';
      })
      .addCase(leaveGroup.fulfilled, (state, action) => {
        state.status = 'succeeded';

        // Remove from member and admin groups
        state.memberGroups = state.memberGroups.filter(
          id => id !== action.payload,
        );
        state.adminGroups = state.adminGroups.filter(
          id => id !== action.payload,
        );
        // Any read already in flight was issued before the user left and would
        // resurrect the group, so it is no longer an answer we can use.
        //
        // In-flight *mutations* are deliberately left alone. Clearing them too
        // would discard a join of an unrelated group that happened to be in
        // flight while this one was left. A join that resolves after a leave
        // did succeed server-side for a different group, and mutations are
        // uid-gated anyway, so nothing here can cross users.
        state.membershipRequests = {};

        state.error = null;
      })
      .addCase(leaveGroup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to leave group';
      })

      // Search groups by location
      .addCase(searchGroupsByLocation.pending, state => {
        state.status = 'loading';
      })
      .addCase(searchGroupsByLocation.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.nearbyGroups = action.payload;

        // Also add groups to items dictionary
        action.payload.forEach((group: HomeGroup) => {
          if (group.id) {
            groupsAdapter.upsertOne(state.groups, group);
          }
        });

        state.error = null;
      })
      .addCase(searchGroupsByLocation.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to search nearby groups';
      })

      // Search groups
      .addCase(searchGroups.pending, state => {
        state.status = 'loading';
      })
      .addCase(searchGroups.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.searchResults = action.payload;

        // Also add groups to items dictionary
        action.payload.forEach((group: HomeGroup) => {
          if (group.id) {
            groupsAdapter.upsertOne(state.groups, group);
          }
        });

        state.error = null;
      })
      .addCase(searchGroups.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to search groups';
      })

      // Request group admin access
      .addCase(requestGroupAdminAccess.pending, state => {
        state.status = 'loading';
      })
      .addCase(requestGroupAdminAccess.fulfilled, (state, action) => {
        state.status = 'succeeded';

        // Update the group in the items dictionary
        if (action.payload && action.payload.id) {
          groupsAdapter.upsertOne(state.groups, action.payload);
          state.lastFetched[action.payload.id] = Date.now();
        }

        state.error = null;
      })
      .addCase(requestGroupAdminAccess.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to request admin access';
      })

      // Complete donation
      .addCase(completeDonation.pending, state => {
        state.status = 'loading';
      })
      .addCase(completeDonation.fulfilled, (state, action) => {
        state.status = 'succeeded';

        if (action.payload) {
          groupsAdapter.upsertOne(state.groups, action.payload);
          state.lastFetched[action.payload.id!] = Date.now();
        }

        state.error = null;
      })
      .addCase(completeDonation.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to complete donation';
      });
  },
});

// Export actions and reducer
export const {clearError, clearSearchResults} = groupsSlice.actions;

// Simple selectors that don't need memoization
export const selectAllGroups = (state: RootState) =>
  groupsAdapter.getSelectors().selectAll(state.groups.groups);

export const selectMemberGroupIds = (state: RootState) =>
  state.groups.memberGroups;

export const selectAdminGroupIds = (state: RootState) =>
  state.groups.adminGroups;

export const selectGroupById = (state: RootState, groupId: string) =>
  groupsAdapter.getSelectors().selectById(state.groups.groups, groupId);

export const selectNearbyGroups = (state: RootState) =>
  state.groups.nearbyGroups;

export const selectSearchResults = (state: RootState): HomeGroup[] =>
  state.groups.searchResults;

const selectMemberGroupsUserId = (state: RootState) =>
  state.groups.memberGroupsUserId;

const selectSignedInUid = (state: RootState) => state.auth.user?.uid ?? null;

/**
 * The groups list. A group may appear here only if the membership read that put
 * it in `memberGroups` was loaded for the uid that is signed in now, so the
 * list can never disclose another session's groups — not even for one frame.
 */
export const selectMemberGroups = createSelector(
  [
    selectAllGroups,
    selectMemberGroupIds,
    selectMemberGroupsUserId,
    selectSignedInUid,
  ],
  (allGroups, memberIds, memberGroupsUserId, signedIn) => {
    if (!signedIn || memberGroupsUserId !== signedIn) {
      return [];
    }
    return memberIds
      .map(id => allGroups.find(group => group.id === id))
      .filter((group): group is GroupEntity => group !== undefined);
  },
);

export const selectAdminGroups = createSelector(
  [selectAllGroups, selectAdminGroupIds],
  (allGroups, adminIds) => {
    return adminIds
      .map(id => allGroups.find(group => group.id === id))
      .filter(Boolean);
  },
);

export const selectUserGroups = createSelector(
  [(state: RootState) => state.groups.groups.entities],
  entities =>
    Object.values(entities).filter(
      (group): group is GroupEntity => group !== undefined,
    ),
);

export const selectIsGroupMember = (state: RootState, groupId: string) =>
  state.groups.memberGroups.includes(groupId);

export const selectIsGroupAdmin = (state: RootState, groupId: string) =>
  state.groups.adminGroups.includes(groupId);

// Simple selectors that don't need memoization
export const selectGroupsStatus = (state: RootState) => state.groups.status;
export const selectGroupsError = (state: RootState) => state.groups.error;

export default groupsSlice.reducer;
