/**
 * A signed-in user holding an invitation (launch P5 Task 3, fix round 1):
 * "Accept as this account" redeems the token, refreshes the ID token so the
 * new house claims apply, reloads the user, clears the invitation and resets
 * to the user's start route. "Continue to the app" clears it and resets.
 * Runs against the real user slice and autoLogin thunk; the callable, the
 * users service and navigation are the seams.
 */
jest.mock('../../invitations', () => ({ redeemInvitation: jest.fn() }));
jest.mock('../../users', () => ({
  getAuthUser: jest.fn(),
  getUserFinishingSetup: jest.fn(),
  createAnonUser: jest.fn(),
  convertFirebaseUserToRatsUser: jest.fn(),
}));
jest.mock('../../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: { resetToStartRoute: jest.fn(), navigateToInvitation: jest.fn() },
}));

import { configureStore } from '@reduxjs/toolkit';
import { getAuth } from '@react-native-firebase/auth';
import userReducer, { initializeInvitation } from '../../../state/slices/userSlice';
import { redeemInvitation } from '../../invitations';
import * as users from '../../users';
import navigationService from '../../../navigation/improved-navigation-service';
import { invitationFromAppLink } from '../invitationFromAppLink';
import {
  acceptInvitationAsCurrentUser,
  invitationErrorMessage,
  leaveInvitation,
} from '../signedInInvitation';

const redeem = redeemInvitation as jest.Mock;
const getAuthUser = users.getAuthUser as jest.Mock;
const getUserFinishingSetup = users.getUserFinishingSetup as jest.Mock;
const resetToStartRoute = navigationService.resetToStartRoute as jest.Mock;
const auth = getAuth() as unknown as { currentUser: unknown };

const before = { uid: 'e2e-guest-b', email: 'g@rats-e2e.com', isGuest: true, isAnonymous: false };
const after = { ...before, isAdmin: true };

const makeStore = () => {
  const store = configureStore({ reducer: { user: userReducer } });
  store.dispatch({ type: 'user/autoLogin/fulfilled', payload: { user: before, token: {} } });
  store.dispatch(
    initializeInvitation(invitationFromAppLink({ kind: 'invitation', token: 'tok-1' })),
  );
  return store;
};

const httpsError = (code: string, message: string) =>
  Object.assign(new Error(`[functions/${code}] ${message}`), { code: `functions/${code}` });

beforeEach(() => {
  jest.clearAllMocks();
  auth.currentUser = { uid: 'e2e-guest-b', isAnonymous: false };
  getAuthUser.mockResolvedValue({ claims: { admin: { h1: true } } });
  getUserFinishingSetup.mockResolvedValue({ user: after, setupRecoveryFailed: false });
});
afterEach(() => {
  auth.currentUser = null;
});

describe('acceptInvitationAsCurrentUser', () => {
  it('redeems, refreshes the token, reloads the user, clears the invitation and resets to the start route', async () => {
    redeem.mockResolvedValue({ houseId: 'h1', role: 'admin' });
    const store = makeStore();

    const result = await acceptInvitationAsCurrentUser('tok-1', store.dispatch);

    expect(result).toEqual({ ok: true });
    expect(redeem).toHaveBeenCalledWith('tok-1');
    expect(getAuthUser).toHaveBeenCalledWith(true);
    expect(store.getState().user.user).toMatchObject({ isAdmin: true });
    expect(store.getState().user.invitation).toBeNull();
    expect(resetToStartRoute).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });

  it('refreshes the token before reloading the user', async () => {
    redeem.mockResolvedValue({ houseId: 'h1', role: 'admin' });
    const order: string[] = [];
    getAuthUser.mockImplementation(async () => {
      order.push('token');
      return {};
    });
    getUserFinishingSetup.mockImplementation(async () => {
      order.push('user');
      return { user: after, setupRecoveryFailed: false };
    });
    await acceptInvitationAsCurrentUser('tok-1', makeStore().dispatch);
    expect(order[0]).toBe('token');
  });

  it.each([
    [
      'permission-denied',
      'Invitation was issued to a different email address',
      /different email address/,
    ],
    ['failed-precondition', 'Invitation already redeemed', /already been used/],
    ['failed-precondition', 'Invitation has expired', /expired/],
    ['not-found', 'Invitation not found', /no longer valid/],
  ])(
    'shows a clear message for a %s refusal and keeps the invitation',
    async (code, msg, shown) => {
      redeem.mockRejectedValue(httpsError(code, msg));
      const store = makeStore();

      const result = await acceptInvitationAsCurrentUser('tok-1', store.dispatch);

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toMatch(shown);
      expect(store.getState().user.invitation).not.toBeNull();
      expect(getAuthUser).not.toHaveBeenCalled();
      expect(resetToStartRoute).not.toHaveBeenCalled();
    },
  );

  it('still leaves the invitation when the redeem succeeded but the reload failed', async () => {
    redeem.mockResolvedValue({ houseId: 'h1', role: 'admin' });
    getUserFinishingSetup.mockRejectedValue(new Error('offline'));
    const store = makeStore();

    expect(await acceptInvitationAsCurrentUser('tok-1', store.dispatch)).toEqual({ ok: true });
    expect(store.getState().user.invitation).toBeNull();
    expect(resetToStartRoute).toHaveBeenCalledWith(expect.objectContaining({ uid: 'e2e-guest-b' }));
  });
});

describe('leaveInvitation ("Continue to the app")', () => {
  it('clears the invitation and resets to the start route without redeeming', () => {
    const store = makeStore();
    leaveInvitation(store.dispatch, store.getState().user.user);
    expect(store.getState().user.invitation).toBeNull();
    expect(resetToStartRoute).toHaveBeenCalledWith(before);
    expect(redeem).not.toHaveBeenCalled();
  });
});

describe('invitationErrorMessage', () => {
  it('falls back to a generic message for an unknown error', () => {
    expect(invitationErrorMessage(new Error('boom'))).toMatch(/couldn't accept/i);
    expect(invitationErrorMessage(undefined)).toMatch(/couldn't accept/i);
  });

  it('shows another failed-precondition reason from the server', () => {
    expect(
      invitationErrorMessage(
        httpsError('failed-precondition', 'You already have a resident record in this house'),
      ),
    ).toBe('You already have a resident record in this house');
  });

  it('reads a code without the functions/ prefix', () => {
    expect(invitationErrorMessage({ code: 'permission-denied', message: 'x' })).toMatch(
      /different email address/,
    );
  });
});
