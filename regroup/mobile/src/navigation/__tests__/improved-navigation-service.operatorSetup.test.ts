// src/navigation/__tests__/improved-navigation-service.operatorSetup.test.ts
//
// An operator who signed up but has not finished setup has only the user-doc
// potentialSuperAdmin flag (isSuperAdmin is written once setup completes), so
// it must route to Setup like an incomplete super admin. Nobody else's routing
// changes.

jest.mock('../service', () => ({
  __esModule: true,
  default: {},
  navigationRef: { current: null },
}));

import improvedNavigationService from '../improved-navigation-service';
import { createMockInvitation, createMockUser, MockUser } from '../navigation-test-utils';
import { Routes } from '../types';

const routeFor = (overrides: MockUser & { potentialSuperAdmin?: boolean }, invitation?: unknown) =>
  improvedNavigationService.getInitialNavigation(createMockUser(overrides), invitation);

describe('improvedNavigationService — operator who has not finished setup', () => {
  it('potentialSuperAdmin + !orgSetupCompleted → Setup', () => {
    expect(routeFor({ potentialSuperAdmin: true, orgSetupCompleted: false })).toEqual({
      initialRoute: Routes.Setup,
      authInitialRoute: undefined,
      initialMainRoute: undefined,
    });
  });

  it('potentialSuperAdmin with orgSetupCompleted missing → Setup', () => {
    expect(
      routeFor({ potentialSuperAdmin: true, orgSetupCompleted: undefined }).initialRoute,
    ).toBe(Routes.Setup);
  });

  it('potentialSuperAdmin + orgSetupCompleted → the same route as without the flag', () => {
    const completedOperator = { isAdmin: true, isSuperAdmin: true, orgSetupCompleted: true };
    expect(routeFor({ ...completedOperator, potentialSuperAdmin: true })).toEqual(
      routeFor(completedOperator),
    );
    expect(routeFor({ ...completedOperator, potentialSuperAdmin: true })).toMatchObject({
      initialRoute: Routes.Main,
      initialMainRoute: Routes.House,
    });
    // Completed but without isSuperAdmin: unchanged from before this rule.
    expect(routeFor({ potentialSuperAdmin: true, orgSetupCompleted: true })).toEqual(
      routeFor({ orgSetupCompleted: true }),
    );
  });

  it('neither flag → unchanged (landing)', () => {
    expect(routeFor({ orgSetupCompleted: false })).toEqual({
      initialRoute: Routes.PriorAuth,
      authInitialRoute: Routes.InitialLanding,
      initialMainRoute: undefined,
    });
  });

  it('potentialSuperAdmin: false is not treated as an operator', () => {
    expect(routeFor({ potentialSuperAdmin: false, orgSetupCompleted: false }).initialRoute).toBe(
      Routes.PriorAuth,
    );
  });

  it.each([
    ['guest', { isGuest: true }, Routes.Main],
    ['house admin', { isAdmin: true }, Routes.Main],
  ])('does not change routing for a %s', (_label, roles, expected) => {
    const flagged = routeFor({ ...roles, potentialSuperAdmin: true, orgSetupCompleted: false });
    expect(flagged.initialRoute).toBe(expected);
    expect(flagged).toEqual(routeFor({ ...roles, orgSetupCompleted: false }));
  });

  it('does not change the invitation flow', () => {
    const invitation = createMockInvitation();
    expect(
      routeFor({ potentialSuperAdmin: true, orgSetupCompleted: false }, invitation),
    ).toEqual(routeFor({ orgSetupCompleted: false }, invitation));
  });
});
