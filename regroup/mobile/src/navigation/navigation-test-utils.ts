// Navigation Testing Utilities
import { User } from '../entities/User';
import { UserState, NavigationContext } from './improved-navigation-service';

export interface MockUser extends Partial<User> {
  isAnonymous?: boolean;
  isGuest?: boolean;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  infoEntered?: boolean;
  orgSetupCompleted?: boolean;
  guestId?: string;
}

export const createMockUser = (overrides: MockUser = {}): User =>
  ({
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    isAnonymous: false,
    isGuest: false,
    isAdmin: false,
    isSuperAdmin: false,
    infoEntered: true,
    orgSetupCompleted: true,
    guestId: null,
    ...overrides,
  } as User);

export const createMockInvitation = (overrides: any = {}) => ({
  type: 'invitation',
  invitationType: 'guest',
  house: 'test-house-id',
  inviter: 'test-inviter-id',
  email: 'test@example.com',
  ...overrides,
});

// Test scenarios
export const testScenarios = {
  noUser: {
    user: null,
    invitation: null,
    expectedContext: NavigationContext.AUTH,
    expectedRoute: 'priorAuth',
  },

  anonymousUser: {
    user: createMockUser({ isAnonymous: true }),
    invitation: null,
    expectedContext: NavigationContext.AUTH,
    expectedRoute: 'priorAuth',
  },

  guestIncomplete: {
    user: createMockUser({
      isGuest: true,
      infoEntered: false,
    }),
    invitation: null,
    // Regular login always routes authenticated guest users to Main,
    // regardless of infoEntered. The infoEntered gate only applies during
    // the invitation flow (handleInvitationFlow).
    expectedContext: NavigationContext.MAIN,
    expectedRoute: 'main',
  },

  guestComplete: {
    user: createMockUser({
      isGuest: true,
      infoEntered: true,
    }),
    invitation: null,
    expectedContext: NavigationContext.MAIN,
    expectedRoute: 'main',
  },

  adminIncomplete: {
    user: createMockUser({
      isAdmin: true,
      infoEntered: false,
    }),
    invitation: null,
    // Regular login always routes authenticated admin users to Main,
    // regardless of infoEntered. The infoEntered gate only applies during
    // the invitation flow (handleInvitationFlow).
    expectedContext: NavigationContext.MAIN,
    expectedRoute: 'main',
  },

  adminComplete: {
    user: createMockUser({
      isAdmin: true,
      infoEntered: true,
    }),
    invitation: null,
    expectedContext: NavigationContext.MAIN,
    expectedRoute: 'main',
  },

  superAdminIncomplete: {
    user: createMockUser({
      isSuperAdmin: true,
      orgSetupCompleted: false,
    }),
    invitation: null,
    // Super admins who haven't completed org setup go to the Setup stack.
    expectedContext: NavigationContext.SETUP,
    expectedRoute: 'setup',
  },

  superAdminComplete: {
    user: createMockUser({
      isSuperAdmin: true,
      orgSetupCompleted: true,
    }),
    invitation: null,
    expectedContext: NavigationContext.MAIN,
    expectedRoute: 'main',
  },

  // Invitation scenarios
  invitationNoUser: {
    user: null,
    invitation: createMockInvitation(),
    expectedContext: NavigationContext.AUTH,
    expectedRoute: 'priorAuth',
  },

  invitationAnonymousUser: {
    user: createMockUser({ isAnonymous: true }),
    invitation: createMockInvitation(),
    expectedContext: NavigationContext.AUTH,
    expectedRoute: 'priorAuth',
  },

  invitationGuestIncomplete: {
    user: createMockUser({
      isGuest: true,
      infoEntered: false,
    }),
    invitation: createMockInvitation(),
    expectedContext: NavigationContext.AUTH,
    expectedRoute: 'priorAuth',
  },

  invitationGuestComplete: {
    user: createMockUser({
      isGuest: true,
      infoEntered: true,
    }),
    invitation: createMockInvitation(),
    expectedContext: NavigationContext.MAIN,
    expectedRoute: 'main',
  },
};

// Test runner
export const runNavigationTests = (navigationService: any) => {
  const results: Array<{
    scenario: string;
    passed: boolean;
    expected: any;
    actual: any;
  }> = [];

  Object.entries(testScenarios).forEach(([scenarioName, scenario]) => {
    const result = navigationService.getInitialNavigation(
      scenario.user,
      scenario.invitation,
    );

    const passed = result.initialRoute === scenario.expectedRoute;

    results.push({
      scenario: scenarioName,
      passed,
      expected: scenario.expectedRoute,
      actual: result.initialRoute,
    });
  });

  return results;
};
