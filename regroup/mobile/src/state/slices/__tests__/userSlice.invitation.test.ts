/**
 * state.user.invitation is cleared once it has been used or abandoned
 * (launch P5 Task 3, fix round 1): App.tsx recomputes the start route with
 * it, so a stale invitation would send a signed-in user to the invitation
 * screen instead of Main.
 */
jest.mock('../../../services/users', () => ({}));

import { configureStore } from '@reduxjs/toolkit';
import userReducer, { clearInvitation, initializeInvitation } from '../userSlice';
import improvedNavigationService from '../../../navigation/improved-navigation-service';
import { invitationFromAppLink } from '../../../services/appLinks/invitationFromAppLink';
import { Routes } from '../../../navigation/types';

const completeGuest = {
  uid: 'e2e-guest-a',
  email: 'g@rats-e2e.com',
  isGuest: true,
  infoEntered: true,
  isAnonymous: false,
};

const withStaleInvitation = () => {
  const store = configureStore({ reducer: { user: userReducer } });
  store.dispatch(initializeInvitation(invitationFromAppLink({ kind: 'invitation', token: 't' })));
  return store;
};

describe('clearing state.user.invitation', () => {
  it('clearInvitation empties it', () => {
    const store = withStaleInvitation();
    store.dispatch(clearInvitation());
    expect(store.getState().user.invitation).toBeNull();
  });

  it('logout.fulfilled clears it', () => {
    const store = withStaleInvitation();
    store.dispatch({
      type: 'user/logout/fulfilled',
      payload: { user: { uid: 'anon', isAnonymous: true } },
    });
    expect(store.getState().user.invitation).toBeNull();
  });

  it('COMPLETE user + stale invitation after login ends on Main', () => {
    const store = withStaleInvitation();
    store.dispatch({
      type: 'user/login/fulfilled',
      payload: { user: completeGuest, token: {}, setupRecoveryFailed: false },
    });
    const { user, invitation } = store.getState().user;
    expect(invitation).toBeNull();
    const nav = improvedNavigationService.getInitialNavigation(user, invitation);
    expect(nav.initialRoute).toBe(Routes.Main);
    expect(nav.initialMainRoute).toBe(Routes.Guest);
  });

  it('keeps it through autoLogin, so a cold start by an invitation link still shows it', () => {
    const store = withStaleInvitation();
    store.dispatch({
      type: 'user/autoLogin/fulfilled',
      payload: { user: completeGuest, token: {}, setupRecoveryFailed: false },
    });
    expect(store.getState().user.invitation).toMatchObject({ token: 't' });
  });
});
