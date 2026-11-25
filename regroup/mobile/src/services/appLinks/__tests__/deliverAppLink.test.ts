/**
 * deliverAppLink routes a parsed link now, or holds it until sign-in
 * (launch P5 Task 3). The cases run against the real user slice, so they
 * assert the state the app reads, not only that something was dispatched.
 */
jest.mock('../../users', () => ({}));
jest.mock('../../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: { navigateToInvitation: jest.fn() },
}));

import { configureStore } from '@reduxjs/toolkit';
import userReducer, {
  clearPendingAppLink,
  resetUserState,
  setPendingAppLink,
} from '../../../state/slices/userSlice';
import navigationService from '../../../navigation/improved-navigation-service';
import { AppLink } from '../parseAppLink';
import { deliverAppLink, deliverPendingAppLink, isSignedInUser } from '../deliverAppLink';

const navigateToInvitation = navigationService.navigateToInvitation as jest.Mock;

const makeStore = () => configureStore({ reducer: { user: userReducer } });

const token: AppLink = { kind: 'invitation', token: 'abc' };
const legacy: AppLink = {
  kind: 'invitation-legacy',
  params: {
    type: 'invitation',
    invitationType: 'admin',
    house: 'h1',
    inviter: 'u1',
    email: 'a@rats-e2e.com',
    owner: 'o1',
    initialPhase: 'Phase 1',
  },
};
const checkout: AppLink = { kind: 'checkout-return', result: 'success' };

beforeEach(() => navigateToInvitation.mockClear());

describe('deliverAppLink, signed out', () => {
  it('holds a checkout return as the pending link and routes nothing', () => {
    const store = makeStore();
    deliverAppLink(checkout, { signedIn: false, dispatch: store.dispatch });
    expect(store.getState().user.pendingAppLink).toEqual(checkout);
    expect(store.getState().user.invitation).toBeNull();
    expect(navigateToInvitation).not.toHaveBeenCalled();
  });

  it('stores an invitation for signup and navigates nothing itself', () => {
    const store = makeStore();
    deliverAppLink(token, { signedIn: false, dispatch: store.dispatch });
    expect(store.getState().user.invitation).toMatchObject({ token: 'abc', email: '' });
    // Signup consumes the invitation; it is not replayed after sign-up.
    expect(store.getState().user.pendingAppLink).toBeNull();
    expect(navigateToInvitation).not.toHaveBeenCalled();
  });

  it('stores a legacy invitation with its params', () => {
    const store = makeStore();
    deliverAppLink(legacy, { signedIn: false, dispatch: store.dispatch });
    expect(store.getState().user.invitation).toMatchObject({
      type: 'admin',
      houseId: 'h1',
      inviterId: 'u1',
      ownerId: 'o1',
      email: 'a@rats-e2e.com',
      initialPhase: 'Phase 1',
    });
    expect(store.getState().user.invitation?.token).toBeUndefined();
  });
});

describe('deliverAppLink, signed in', () => {
  it('stores a token invitation and opens the invitation screen', () => {
    const store = makeStore();
    deliverAppLink(token, { signedIn: true, dispatch: store.dispatch });
    expect(store.getState().user.invitation).toMatchObject({ token: 'abc' });
    expect(navigateToInvitation).toHaveBeenCalledTimes(1);
  });

  it('stores a legacy invitation and opens the invitation screen', () => {
    const store = makeStore();
    deliverAppLink(legacy, { signedIn: true, dispatch: store.dispatch });
    expect(store.getState().user.invitation).toMatchObject({ houseId: 'h1' });
    expect(navigateToInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not hold a checkout return', () => {
    const store = makeStore();
    deliverAppLink(checkout, { signedIn: true, dispatch: store.dispatch });
    expect(store.getState().user.pendingAppLink).toBeNull();
  });

  // Task 10: the hand-back refreshes the plan state, and the gate decides.
  it.each(['success', 'canceled', 'portal'] as const)(
    'refreshes the plan state once for a %s hand-back, and navigates nothing',
    (result) => {
      const store = makeStore();
      const onCheckoutReturn = jest.fn();
      deliverAppLink({ kind: 'checkout-return', result }, { signedIn: true, dispatch: store.dispatch, onCheckoutReturn });
      expect(onCheckoutReturn).toHaveBeenCalledTimes(1);
      expect(onCheckoutReturn).toHaveBeenCalledWith(result);
      expect(navigateToInvitation).not.toHaveBeenCalled();
    },
  );

  it('does not refresh the plan state for an invitation', () => {
    const store = makeStore();
    const onCheckoutReturn = jest.fn();
    deliverAppLink(token, { signedIn: true, dispatch: store.dispatch, onCheckoutReturn });
    expect(onCheckoutReturn).not.toHaveBeenCalled();
  });
});

describe('checkout hand-back while signed out', () => {
  it('refreshes nothing until sign-in, then once', () => {
    const store = makeStore();
    const onCheckoutReturn = jest.fn();
    deliverAppLink(checkout, { signedIn: false, dispatch: store.dispatch, onCheckoutReturn });
    expect(onCheckoutReturn).not.toHaveBeenCalled();
    const held = store.getState().user;
    expect(
      deliverPendingAppLink(held, { signedIn: true, dispatch: store.dispatch, onCheckoutReturn }, held.pendingAppLinkReceivedAt! + 1000),
    ).toBe(true);
    expect(onCheckoutReturn).toHaveBeenCalledTimes(1);
    expect(onCheckoutReturn).toHaveBeenCalledWith('success');
  });
});

describe('deliverPendingAppLink', () => {
  it('delivers the held link once on sign-in and clears it', () => {
    const store = makeStore();
    deliverAppLink(token, { signedIn: false, dispatch: store.dispatch });
    deliverAppLink(checkout, { signedIn: false, dispatch: store.dispatch });

    const deliver = () =>
      deliverPendingAppLink(store.getState().user, {
        signedIn: true,
        dispatch: store.dispatch,
      });
    expect(deliver()).toBe(true);
    expect(store.getState().user.pendingAppLink).toBeNull();
    expect(deliver()).toBe(false);
  });

  it('delivers a held invitation to the invitation screen once', () => {
    const store = makeStore();
    store.dispatch(setPendingAppLink(token));
    const ctx = { signedIn: true, dispatch: store.dispatch };
    deliverPendingAppLink(store.getState().user, ctx);
    deliverPendingAppLink(store.getState().user, ctx);
    expect(navigateToInvitation).toHaveBeenCalledTimes(1);
    expect(store.getState().user.invitation).toMatchObject({ token: 'abc' });
    expect(store.getState().user.pendingAppLink).toBeNull();
  });

  it('keeps the link while still signed out', () => {
    const store = makeStore();
    deliverAppLink(checkout, { signedIn: false, dispatch: store.dispatch });
    expect(
      deliverPendingAppLink(store.getState().user, {
        signedIn: false,
        dispatch: store.dispatch,
      }),
    ).toBe(false);
    expect(store.getState().user.pendingAppLink).toEqual(checkout);
  });
});

describe('deliverPendingAppLink expiry (15 minutes)', () => {
  const TTL = 15 * 60 * 1000;
  const ctxFor = (store: ReturnType<typeof makeStore>) => ({
    signedIn: true,
    dispatch: store.dispatch,
  });

  it('records when the link was received', () => {
    const store = makeStore();
    store.dispatch(setPendingAppLink(checkout, 1_000));
    expect(store.getState().user.pendingAppLinkReceivedAt).toBe(1_000);
  });

  it('stamps the receive time with the clock by default', () => {
    const store = makeStore();
    const t0 = Date.now();
    deliverAppLink(checkout, { signedIn: false, dispatch: store.dispatch });
    expect(store.getState().user.pendingAppLinkReceivedAt).toBeGreaterThanOrEqual(t0);
  });

  it('delivers a link held for less than 15 minutes', () => {
    const store = makeStore();
    store.dispatch(setPendingAppLink(token, 1_000));
    expect(deliverPendingAppLink(store.getState().user, ctxFor(store), 1_000 + TTL)).toBe(true);
    expect(navigateToInvitation).toHaveBeenCalledTimes(1);
  });

  it('drops a link held for more than 15 minutes without delivering it', () => {
    const store = makeStore();
    store.dispatch(setPendingAppLink(token, 1_000));
    expect(deliverPendingAppLink(store.getState().user, ctxFor(store), 1_001 + TTL)).toBe(false);
    expect(navigateToInvitation).not.toHaveBeenCalled();
    expect(store.getState().user.invitation).toBeNull();
    expect(store.getState().user.pendingAppLink).toBeNull();
    expect(store.getState().user.pendingAppLinkReceivedAt).toBeNull();
  });

  it('drops a held link with no receive time', () => {
    const store = makeStore();
    store.dispatch(setPendingAppLink(token, 1_000));
    const held = { ...store.getState().user, pendingAppLinkReceivedAt: null };
    expect(deliverPendingAppLink(held, ctxFor(store), 1_000)).toBe(false);
    expect(navigateToInvitation).not.toHaveBeenCalled();
  });
});

describe('isSignedInUser', () => {
  it('is true only for a user who is not anonymous', () => {
    expect(isSignedInUser(null)).toBe(false);
    expect(isSignedInUser(undefined)).toBe(false);
    expect(isSignedInUser({ uid: 'a', isAnonymous: true })).toBe(false);
    expect(isSignedInUser({ uid: 'u', isAnonymous: false })).toBe(true);
    expect(isSignedInUser({ uid: 'u' })).toBe(true);
  });
});

describe('userSlice pending link', () => {
  it('starts empty, is set and cleared, and resets with the user state', () => {
    const store = makeStore();
    expect(store.getState().user.pendingAppLink).toBeNull();
    store.dispatch(setPendingAppLink(checkout));
    expect(store.getState().user.pendingAppLink).toEqual(checkout);
    store.dispatch(clearPendingAppLink());
    expect(store.getState().user.pendingAppLink).toBeNull();
    store.dispatch(setPendingAppLink(checkout));
    store.dispatch(resetUserState());
    expect(store.getState().user.pendingAppLink).toBeNull();
  });

  it('is cleared, with the invitation, when the user logs out', () => {
    const store = makeStore();
    store.dispatch(setPendingAppLink(checkout));
    deliverAppLink(token, { signedIn: false, dispatch: store.dispatch });
    store.dispatch({ type: 'user/logout/fulfilled', payload: { user: { uid: 'anon', isAnonymous: true } } });
    expect(store.getState().user.pendingAppLink).toBeNull();
    expect(store.getState().user.pendingAppLinkReceivedAt).toBeNull();
    expect(store.getState().user.invitation).toBeNull();
  });
});
