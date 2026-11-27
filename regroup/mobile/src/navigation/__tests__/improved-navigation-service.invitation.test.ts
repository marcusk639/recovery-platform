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

describe('resetToStartRoute (leaving the invitation screen)', () => {
  const dispatch = jest.fn();
  const setRef = (ready: boolean) => {
    (navigationRef as { current: unknown }).current = { isReady: () => ready, dispatch };
  };
  afterEach(() => {
    (navigationRef as { current: unknown }).current = null;
    dispatch.mockClear();
  });
  const resetRoutes = () => dispatch.mock.calls[0][0].payload.routes;

  it('resets a guest to Main on the Guest tab', () => {
    setRef(true);
    improvedNavigationService.resetToStartRoute(createMockUser({ isGuest: true }));
    expect(resetRoutes()).toEqual([
      { name: Routes.Main, state: { index: 0, routes: [{ name: Routes.Guest }] } },
    ]);
  });

  it('resets an admin to Main on the House tab', () => {
    setRef(true);
    improvedNavigationService.resetToStartRoute(createMockUser({ isAdmin: true }));
    expect(resetRoutes()).toEqual([
      { name: Routes.Main, state: { index: 0, routes: [{ name: Routes.House }] } },
    ]);
  });

  it('resets an operator who has not finished setup to Setup', () => {
    setRef(true);
    improvedNavigationService.resetToStartRoute(
      createMockUser({ isSuperAdmin: true, orgSetupCompleted: false }),
    );
    expect(resetRoutes()).toEqual([{ name: Routes.Setup }]);
  });

  it('resets nobody signed in to the landing screen', () => {
    setRef(true);
    improvedNavigationService.resetToStartRoute(null);
    expect(resetRoutes()).toEqual([
      { name: Routes.PriorAuth, state: { index: 0, routes: [{ name: Routes.InitialLanding }] } },
    ]);
  });

  it('does nothing before the navigator is ready', () => {
    setRef(false);
    improvedNavigationService.resetToStartRoute(createMockUser({ isGuest: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
