/**
 * One invariant, checked for every slice that holds one person's data:
 *
 *   when the authenticated user changes, nothing the previous user loaded
 *   may remain in the slice.
 *
 * This app runs on shared devices and the data implies recovery status, so a
 * slice that keeps its contents across a user switch is a privacy failure.
 * The table below is the list of slices that must satisfy it — adding a
 * user-scoped slice without adding it here is the mistake this file exists to
 * catch.
 *
 * `groupsSlice` is intentionally absent: its entity cache is shared with
 * search and nearby results, so it cannot reset wholesale and carries its own
 * narrower guard, covered by groupsListMembership.test.ts.
 */

jest.mock('@react-native-firebase/auth', () => {
  const fn: any = () => ({currentUser: null});
  return {__esModule: true, default: fn};
});
jest.mock('@react-native-firebase/firestore', () => {
  const doc: any = () => ({
    get: jest.fn(async () => ({exists: false, data: () => undefined})),
    set: jest.fn(),
    update: jest.fn(),
    onSnapshot: jest.fn(() => jest.fn()),
    collection: () => collection(),
  });
  const collection: any = () => ({
    doc,
    where: () => collection(),
    orderBy: () => collection(),
    limit: () => collection(),
    get: jest.fn(async () => ({docs: [], empty: true})),
    onSnapshot: jest.fn(() => jest.fn()),
  });
  const fn: any = () => ({
    settings: jest.fn(),
    collection,
    doc,
    batch: () => ({set: jest.fn(), update: jest.fn(), commit: jest.fn()}),
    runTransaction: jest.fn(),
  });
  fn.FieldValue = {
    serverTimestamp: jest.fn(),
    increment: jest.fn(),
    arrayUnion: jest.fn(),
    arrayRemove: jest.fn(),
    delete: jest.fn(),
  };
  fn.Timestamp = {now: jest.fn(), fromDate: jest.fn()};
  return {__esModule: true, default: fn};
});
jest.mock('@react-native-firebase/storage', () => ({
  __esModule: true,
  default: () => ({ref: () => ({putFile: jest.fn(), getDownloadURL: jest.fn()})}),
}));
jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({getToken: jest.fn(), onMessage: jest.fn(() => jest.fn())}),
}));
jest.mock('@react-native-firebase/functions', () => {
  const fn: any = () => ({httpsCallable: () => async () => ({data: {}})});
  return {__esModule: true, default: fn};
});
jest.mock('../../../models/DirectMessageModel', () => ({
  DirectMessageModel: {},
  generateThreadId: jest.fn(),
}));
jest.mock('../../../services/activityTracker', () => ({trackActivity: jest.fn()}));

import {setUser} from '../authSlice';
import {USER_CHANGED_ACTION} from '../../userScope';
import directMessagesReducer from '../directMessagesSlice';
import stepWorkReducer from '../stepWorkSlice';
import engagementReducer from '../engagementSlice';
import sponsorshipReducer from '../sponsorshipSlice';

const USER_A = {uid: 'user-a-uid'} as any;
const USER_B = {uid: 'user-b-uid'} as any;

const SLICES: Array<{
  name: string;
  reducer: (state: any, action: any) => any;
  /** Plant data as if the previous user had loaded it. */
  dirty: (state: any) => any;
}> = [
  {
    name: 'directMessages',
    reducer: directMessagesReducer,
    dirty: s => ({
      ...s,
      conversations: {ids: ['t1'], entities: {t1: {id: 't1'}}},
      threadMessageIds: {t1: ['m1']},
    }),
  },
  {
    name: 'stepWork',
    reducer: stepWorkReducer,
    dirty: s => ({
      ...s,
      progress: {currentStep: 4} as any,
      notes: {1: {text: 'private'} as any},
    }),
  },
  {
    name: 'engagement',
    reducer: engagementReducer,
    dirty: s => ({
      ...s,
      gratitude: {...s.gratitude, pastEntries: [{id: 'g1'} as any]},
    }),
  },
  {
    name: 'sponsorship',
    reducer: sponsorshipReducer,
    dirty: s => ({
      ...s,
      chatMessages: {s1: [{id: 'c1'} as any]},
      analytics: {total: 3} as any,
    }),
  },
];

describe.each(SLICES)('$name is scoped to the signed-in user', ({reducer, dirty}) => {
  /** State as it would be after user A signed in and loaded their data. */
  function loadedForUserA() {
    const signedIn = reducer(undefined, setUser(USER_A));
    return dirty(signedIn);
  }

  it('is emptied when a different user signs in', () => {
    const next = reducer(loadedForUserA(), setUser(USER_B));

    expect(next).toEqual({
      ...reducer(undefined, {type: '@@INIT'}),
      loadedForUserId: USER_B.uid,
    });
  });

  it('is emptied on sign-out', () => {
    const next = reducer(loadedForUserA(), setUser(null as any));

    expect(next).toEqual({
      ...reducer(undefined, {type: '@@INIT'}),
      loadedForUserId: null,
    });
  });

  it('is left alone when the same user is re-announced', () => {
    const loaded = loadedForUserA();
    const next = reducer(loaded, setUser(USER_A));

    // A token refresh re-dispatches setUser with the same uid; discarding the
    // inbox there would be a visible, pointless reload.
    expect(next).toEqual(loaded);
  });
});

describe('the user-changed signal', () => {
  // userScope matches this action by type string rather than importing the
  // creator, so that user-scoped slices do not pull in authSlice and its
  // Firebase dependencies. That trade is only safe while the string is right:
  // if setUser is renamed or moved to another slice, every reset above stops
  // firing and does so silently, in the direction that leaks. This test is
  // what turns that into a loud failure.
  it('still matches the action userScope keys off', () => {
    expect(USER_CHANGED_ACTION).toBe(setUser.type);
  });
});
