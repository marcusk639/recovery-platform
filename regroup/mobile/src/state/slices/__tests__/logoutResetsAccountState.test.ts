/**
 * Nothing from the account that signed out reaches the next one on the same
 * phone. The paywall gate decides from houses.selectedHouseId, and DataContext
 * auto-selects a house only while none is selected, so a house left selected
 * showed the next operator the previous operator's house (paywall or spinner).
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
jest.mock('../../../navigation/service', () => ({
  __esModule: true,
  default: {},
  navigationRef: { current: { dispatch: jest.fn() } },
  improvedNavigationService: {},
}));
jest.mock('@react-navigation/native', () => ({
  CommonActions: { reset: jest.fn((payload) => ({ type: 'RESET', payload })) },
}));
const mockClear = jest.fn();
jest.mock('../../queryClient', () => ({ queryClient: { clear: () => mockClear() } }));

import { configureStore } from '@reduxjs/toolkit';
import userReducer, { login, logout, setSubscriptionStatus } from '../userSlice';
import housesReducer, { selectHouse, selectHouseById } from '../housesSlice';
import guestsReducer, { selectGuestById, setUserAsGuest } from '../guestsSlice';
import adminReducer, { setUserAsAdmin } from '../adminSlice';

const makeStore = () =>
  configureStore({
    reducer: {
      user: userReducer,
      houses: housesReducer,
      guests: guestsReducer,
      admin: adminReducer,
    },
  });

const signInOperatorA = (store: ReturnType<typeof makeStore>) => {
  store.dispatch(
    login.fulfilled(
      {
        user: { id: 'operator-a' },
        token: { claims: { superAdmin: { 'house-a': true } } },
        setupRecoveryFailed: false,
      } as any,
      'req-1',
      { email: 'operator-a@rats-e2e.com', password: 'x' },
    ),
  );
  store.dispatch(setSubscriptionStatus('canceled'));
  store.dispatch(selectHouseById('house-a'));
  store.dispatch(selectHouse({ id: 'house-a' } as any));
  store.dispatch(selectGuestById('guest-a'));
  store.dispatch(setUserAsGuest({ id: 'guest-a' } as any));
  store.dispatch(setUserAsAdmin({ id: 'admin-a' } as any));
};

describe('logout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockClear.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('clears the selected house, so the next account gets its own', async () => {
    const store = makeStore();
    signInOperatorA(store);
    await store.dispatch(logout() as any);
    expect(store.getState().houses.selectedHouseId).toBeNull();
    expect(store.getState().houses.selectedHouse).toBeNull();
  });

  it("clears the previous account's guest and admin records", async () => {
    const store = makeStore();
    signInOperatorA(store);
    await store.dispatch(logout() as any);
    expect(store.getState().guests.userAsGuest).toBeNull();
    expect(store.getState().guests.selectedGuestId).toBeNull();
    expect(store.getState().admin.userAsAdmin).toBeNull();
  });

  it("clears the previous account's subscription status and claims", async () => {
    const store = makeStore();
    signInOperatorA(store);
    await store.dispatch(logout() as any);
    expect(store.getState().user.subscriptionStatus).toBeNull();
    expect(store.getState().user.token).toEqual({ claims: {} });
  });

  it('empties the server-data cache', async () => {
    const store = makeStore();
    signInOperatorA(store);
    await store.dispatch(logout() as any);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});
