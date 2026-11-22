// src/navigation/__tests__/improved-navigation-service.invitation.test.ts
//
// The signed-in invitation route (launch P5 Task 3): an invitation link opens
// the screen that shows the invitation (SignUp, testID invitation-info) for a
// signed-in user too, at cold start (initial route decision) and while the app
// runs (navigateToInvitation).

import improvedNavigationService, { navigationRef } from '../improved-navigation-service';
import { createMockInvitation, createMockUser, MockUser } from '../navigation-test-utils';
import { Routes } from '../types';

const routeFor = (overrides: MockUser | null, invitation?: unknown) =>
  improvedNavigationService.getInitialNavigation(
    overrides ? createMockUser(overrides) : null,
    invitation,
  );

const invitationScreen = {
  initialRoute: Routes.PriorAuth,
  authInitialRoute: Routes.Signup,
  initialMainRoute: undefined,
};

describe('initial route with an invitation', () => {
  const invitation = createMockInvitation();

  it.each([
    ['a guest', { isGuest: true }],
    ['an admin', { isAdmin: true }],
    ['a super admin', { isSuperAdmin: true }],
  ])('opens the invitation screen for %s who is signed in', (_label, user) => {
    expect(routeFor(user, invitation)).toEqual(invitationScreen);
  });

  it('still opens signup when nobody or an anonymous user is signed in', () => {
    expect(routeFor(null, invitation)).toEqual(invitationScreen);
    expect(routeFor({ isAnonymous: true }, invitation)).toEqual(invitationScreen);
  });

  it('still sends a guest who has not entered their info to NewAccount', () => {
    expect(routeFor({ isGuest: true, infoEntered: false }, invitation)).toEqual({
      initialRoute: Routes.PriorAuth,
      authInitialRoute: Routes.NewAccount,
      initialMainRoute: undefined,
    });
  });

  it('without an invitation a signed-in guest still opens Main', () => {
    expect(routeFor({ isGuest: true }).initialRoute).toBe(Routes.Main);
  });
});

describe('navigateToInvitation', () => {
  const navigate = jest.fn();
  const setRef = (ready: boolean) => {
    (navigationRef as { current: unknown }).current = { isReady: () => ready, navigate };
  };
  afterEach(() => {
    (navigationRef as { current: unknown }).current = null;
    navigate.mockClear();
  });

  it('opens SignUp inside PriorAuth', () => {
    setRef(true);
    improvedNavigationService.navigateToInvitation();
    expect(navigate).toHaveBeenCalledWith(Routes.PriorAuth, { screen: Routes.Signup });
  });

  it('does nothing before the navigator is ready', () => {
    setRef(false);
    improvedNavigationService.navigateToInvitation();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing without a navigator', () => {
    expect(() => improvedNavigationService.navigateToInvitation()).not.toThrow();
  });
});
