/**
 * Tests for membersSlice — focusing on C-3:
 * toggleAdmin must call removeAdmin when the member is already an admin,
 * and makeAdmin when the member is not an admin.
 */

import {configureStore} from '@reduxjs/toolkit';
import membersReducer, {toggleAdmin} from '../membersSlice';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockMakeAdmin = jest.fn();
const mockRemoveAdmin = jest.fn();

jest.mock('../../../models/GroupModel', () => ({
  GroupModel: {
    makeAdmin: (...args: any[]) => mockMakeAdmin(...args),
    removeAdmin: (...args: any[]) => mockRemoveAdmin(...args),
    getById: jest.fn(() => Promise.resolve(null)),
    getMembers: jest.fn(() => Promise.resolve([])),
    getGroupMilestones: jest.fn(() => Promise.resolve([])),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    updateMemberPosition: jest.fn(),
    getUserGroups: jest.fn(() => Promise.resolve([])),
    searchGroups: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('../../../models/UserModel', () => ({
  UserModel: {
    getById: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('../../../models/MemberModel', () => ({
  MemberModel: {
    getMemberByUserId: jest.fn(() => Promise.resolve(null)),
    updateUserAcrossMemberships: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: {uid: 'test-uid'},
    onAuthStateChanged: jest.fn(() => jest.fn()),
  };
  return () => mockAuth;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a Redux store pre-populated with a single member entity.
 * The toggleAdmin thunk looks up the member via
 * `state.members.members.entities[`${groupId}_${userId}`]`, matching the
 * compound document ID format used by MemberModel.fromFirestore.
 */
function buildStoreWithMember(userId: string, isAdmin: boolean) {
  const groupId = 'group-1';
  const store = configureStore({
    reducer: {members: membersReducer},
  });

  // Entity adapter keys by entity.id. In production, MemberModel.fromFirestore
  // sets id = doc.id = `{groupId}_{userId}`. Seed with the compound key so the
  // thunk's `entities[`${groupId}_${userId}`]` lookup resolves correctly.
  store.dispatch({
    type: 'members/fetchForGroup/fulfilled',
    payload: {
      groupId,
      members: [
        {
          id: `${groupId}_${userId}`,  // compound key matching production format
          userId: userId,
          groupId,
          name: 'Test Member',
          isAdmin: isAdmin,
          joinedAt: Date.now(),
        },
      ],
    },
  });

  return store;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('toggleAdmin thunk — C-3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMakeAdmin.mockResolvedValue(undefined);
    mockRemoveAdmin.mockResolvedValue(undefined);
  });

  it('calls removeAdmin when the member is currently an admin', async () => {
    const userId = 'user-admin';
    const groupId = 'group-1';
    const store = buildStoreWithMember(userId, true);

    const result = await store.dispatch(toggleAdmin({groupId, userId}));

    expect(result.type).toBe('members/toggleAdmin/fulfilled');
    expect(mockRemoveAdmin).toHaveBeenCalledTimes(1);
    expect(mockRemoveAdmin).toHaveBeenCalledWith(groupId, userId);
    expect(mockMakeAdmin).not.toHaveBeenCalled();
  });

  it('calls makeAdmin when the member is not currently an admin', async () => {
    const userId = 'user-regular';
    const groupId = 'group-1';
    const store = buildStoreWithMember(userId, false);

    const result = await store.dispatch(toggleAdmin({groupId, userId}));

    expect(result.type).toBe('members/toggleAdmin/fulfilled');
    expect(mockMakeAdmin).toHaveBeenCalledTimes(1);
    expect(mockMakeAdmin).toHaveBeenCalledWith(groupId, userId);
    expect(mockRemoveAdmin).not.toHaveBeenCalled();
  });

  it('calls makeAdmin when the member is not found in the store (falls through to else branch)', async () => {
    // If the member entity doesn't exist, member?.isAdmin is undefined (falsy)
    // so the thunk should fall through to the else branch and call makeAdmin.
    const store = configureStore({
      reducer: {members: membersReducer},
    });

    const result = await store.dispatch(
      toggleAdmin({groupId: 'group-1', userId: 'unknown-user'}),
    );

    expect(result.type).toBe('members/toggleAdmin/fulfilled');
    expect(mockMakeAdmin).toHaveBeenCalledTimes(1);
    expect(mockMakeAdmin).toHaveBeenCalledWith('group-1', 'unknown-user');
    expect(mockRemoveAdmin).not.toHaveBeenCalled();
  });

  it('rejects with an error message when removeAdmin throws', async () => {
    const userId = 'user-admin';
    const groupId = 'group-1';
    const store = buildStoreWithMember(userId, true);

    mockRemoveAdmin.mockRejectedValue(new Error('Firestore permission denied'));

    const result = await store.dispatch(toggleAdmin({groupId, userId}));

    expect(result.type).toBe('members/toggleAdmin/rejected');
    expect(result.payload).toBe('Firestore permission denied');
  });

  it('rejects with an error message when makeAdmin throws', async () => {
    const userId = 'user-regular';
    const groupId = 'group-1';
    const store = buildStoreWithMember(userId, false);

    mockMakeAdmin.mockRejectedValue(new Error('Network error'));

    const result = await store.dispatch(toggleAdmin({groupId, userId}));

    expect(result.type).toBe('members/toggleAdmin/rejected');
    expect(result.payload).toBe('Network error');
  });

  it('does not call makeAdmin after calling removeAdmin (no double call)', async () => {
    const userId = 'user-admin';
    const groupId = 'group-1';
    const store = buildStoreWithMember(userId, true);

    await store.dispatch(toggleAdmin({groupId, userId}));

    expect(mockRemoveAdmin).toHaveBeenCalledTimes(1);
    expect(mockMakeAdmin).toHaveBeenCalledTimes(0);
  });

  it('does not call removeAdmin after calling makeAdmin (no double call)', async () => {
    const userId = 'user-regular';
    const groupId = 'group-1';
    const store = buildStoreWithMember(userId, false);

    await store.dispatch(toggleAdmin({groupId, userId}));

    expect(mockMakeAdmin).toHaveBeenCalledTimes(1);
    expect(mockRemoveAdmin).toHaveBeenCalledTimes(0);
  });
});
