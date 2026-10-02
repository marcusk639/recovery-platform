/**
 * Shared harness for the groups-list membership oracle.
 *
 * The jest.mock calls live here rather than in each spec so the two suites
 * cannot drift apart on what is stubbed. Test files import ONLY from this
 * module, which guarantees the mocks are registered before the slices under
 * test are evaluated.
 */
import {configureStore} from '@reduxjs/toolkit';
import groupsReducer, {
  fetchUserGroups,
  fetchGroupById,
  searchGroups,
  searchGroupsByLocation,
  leaveGroup,
  joinGroup,
  createGroup,
  selectMemberGroups,
} from '../groupsSlice';
import authReducer, {setUser} from '../authSlice';
import type {RootState} from '../../types';
import type {HomeGroup} from '../../../types';

// ─── Native / model boundary stubs ────────────────────────────────────────────

jest.mock('../../../services/firebase/auth', () => ({
  syncUserClaims: jest.fn(() => Promise.resolve({success: true, message: 'ok'})),
}));

jest.mock('../../../models/GroupModel', () => ({
  GroupModel: {
    getUserGroups: jest.fn(() => Promise.resolve([])),
    getById: jest.fn(() => Promise.resolve(null)),
    addMember: jest.fn(() => Promise.resolve()),
    removeMember: jest.fn(() => Promise.resolve()),
    searchGroups: jest.fn(() => Promise.resolve([])),
    fromFirestore: jest.fn((doc: any) => ({id: doc.id, ...doc.data()})),
  },
}));

jest.mock('../../../models/UserModel', () => ({UserModel: {}}));
jest.mock('../../../models/MemberModel', () => ({MemberModel: {}}));

jest.mock('../../../services/activityTracker', () => ({
  trackActivity: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn: any = () => ({
    collection: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => Promise.resolve({empty: true, docs: []})),
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({exists: false, data: () => null})),
        set: jest.fn(() => Promise.resolve()),
      })),
    })),
  });
  fn.Timestamp = {
    now: jest.fn(() => ({toDate: () => new Date()})),
    fromDate: jest.fn((d: Date) => ({toDate: () => d})),
  };
  fn.FieldValue = {
    serverTimestamp: jest.fn(() => ({})),
    arrayUnion: jest.fn((...args: any[]) => args),
    arrayRemove: jest.fn((...args: any[]) => args),
    increment: jest.fn((n: number) => n),
    delete: jest.fn(() => ({})),
  };
  fn.CACHE_SIZE_UNLIMITED = -1;
  fn.settings = jest.fn();
  return fn;
});

jest.mock('@react-native-firebase/functions', () => {
  const instance = {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({data: []}))),
    useEmulator: jest.fn(),
  };
  return () => instance;
});

// The signed-in native user. `signInAs` keeps this in step with the auth slice.
const mockAuthState: {currentUser: {uid: string} | null} = {currentUser: null};

jest.mock('@react-native-firebase/auth', () => {
  const instance = {
    get currentUser() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return mockAuthState.currentUser;
    },
    onAuthStateChanged: jest.fn(() => jest.fn()),
  };
  return () => instance;
});

// ─── Fixtures & helpers ───────────────────────────────────────────────────────

const USER_A = 'user-a-uid';
const USER_B = 'user-b-uid';

function makeGroup(id: string, name: string, admins: string[] = []): HomeGroup {
  return {
    id,
    name,
    description: `${name} description`,
    location: 'Somewhere',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    memberCount: 1,
    admins,
    isClaimed: true,
    treasurers: [],
    type: 'AA',
    meetings: [],
    treasury: {balance: 0, transactions: [], monthlyAverage: 0} as any,
  } as unknown as HomeGroup;
}

function buildStore() {
  return configureStore({
    reducer: {auth: authReducer, groups: groupsReducer},
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({serializableCheck: false}),
  });
}

type TestStore = ReturnType<typeof buildStore>;

/** The authenticated user changes — exactly what AppNavigator does. */
function signInAs(store: TestStore, uid: string | null) {
  mockAuthState.currentUser = uid ? {uid} : null;
  store.dispatch(setUser(uid ? ({uid} as any) : null));
}

/** Start an in-flight `fetchUserGroups` request and return its requestId. */
function startMembershipFetch(store: TestStore, requestId: string): string {
  store.dispatch(fetchUserGroups.pending(requestId, undefined));
  return requestId;
}

/** Resolve a membership fetch with the groups the given uid belongs to. */
function resolveMembershipFetch(
  store: TestStore,
  requestId: string,
  userId: string,
  groups: HomeGroup[],
) {
  store.dispatch(
    fetchUserGroups.fulfilled({groups, userId} as any, requestId, undefined),
  );
}

/** Full happy-path membership load for the signed-in user. */
function loadMembership(
  store: TestStore,
  requestId: string,
  userId: string,
  groups: HomeGroup[],
) {
  startMembershipFetch(store, requestId);
  resolveMembershipFetch(store, requestId, userId, groups);
}

/** What the groups list would render, as ids. */
function renderedGroupIds(store: TestStore): string[] {
  return selectMemberGroups(store.getState() as unknown as RootState).map(
    group => group.id,
  );
}

const A1 = makeGroup('group-a1', 'Alpha Group', [USER_A]);
const A2 = makeGroup('group-a2', 'Bravo Group');
const B1 = makeGroup('group-b1', 'Charlie Group', [USER_B]);
const B2 = makeGroup('group-b2', 'Delta Group');

/** Reset the stubbed Firebase auth singleton between tests. */
export function resetMembershipHarness() {
  mockAuthState.currentUser = null;
}

export {
  fetchUserGroups,
  fetchGroupById,
  searchGroups,
  searchGroupsByLocation,
  leaveGroup,
  joinGroup,
  createGroup,
  selectMemberGroups,
  setUser,
  mockAuthState,
  USER_A,
  USER_B,
  A1,
  A2,
  B1,
  B2,
  makeGroup,
  buildStore,
  signInAs,
  startMembershipFetch,
  resolveMembershipFetch,
  loadMembership,
  renderedGroupIds,
};
export type {TestStore, HomeGroup, RootState};
