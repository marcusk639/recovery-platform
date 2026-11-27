/**
 * The logout thunk lands on the landing screen from wherever it is called.
 * InitialLanding lives in the auth stack (Routes.PriorAuth), not the root
 * stack, so a root reset straight to InitialLanding left callers outside
 * Profile (the subscription gate's Sign out) in the main stack, showing the
 * signed-out session the previous operator's house (found by
 * billing-link-out.yaml on the iOS simulator).
 */
jest.mock('../../../../firebase-setup', () => ({ firestore: {}, functions: {} }));
jest.mock('../../../services/users', () => ({
  signOut: jest.fn(() => Promise.resolve()),
  anonymouslyLogin: jest.fn(() => Promise.resolve({ user: { uid: 'anon' } })),
  getUser: jest.fn(() => Promise.resolve({ id: 'anon', isAnonymous: true })),
  createAnonUser: jest.fn(),
  userCollection: {},
}));
jest.mock('../../../util/user', () => ({
  getFirebaseUserFromUserCredential: (c: { user: { uid: string } }) => c.user,
}));
jest.mock('../../../util/subscription', () => ({ subscriptionStatus: jest.fn() }));
const mockDispatch = jest.fn();
jest.mock('../../../navigation/service', () => ({
  __esModule: true,
  default: {},
  navigationRef: { current: { dispatch: (a: unknown) => mockDispatch(a) } },
  improvedNavigationService: {},
}));
jest.mock('@react-navigation/native', () => ({
  CommonActions: { reset: jest.fn((payload) => ({ type: 'RESET', payload })) },
}));

import { configureStore } from '@reduxjs/toolkit';
import userReducer, { logout } from '../userSlice';
import { Routes } from '../../../navigation/types';

describe('logout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockDispatch.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('resets to the auth stack with the landing screen on top', async () => {
    const store = configureStore({ reducer: { user: userReducer } });
    await store.dispatch(logout() as any);
    jest.runAllTimers();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toEqual({
      type: 'RESET',
      payload: {
        index: 0,
        routes: [{ name: Routes.PriorAuth, state: { index: 0, routes: [{ name: Routes.InitialLanding }] } }],
      },
    });
  });
});
