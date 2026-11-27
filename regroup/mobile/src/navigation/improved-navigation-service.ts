// Improved Navigation Service
import { createRef } from 'react';
import {
  NavigationContainerRef,
  StackActions,
  CommonActions,
} from '@react-navigation/native';
import {
  AuthStackParamList,
  MainTabParamList,
  RootStackParamList,
  Routes,
} from './types';
import { User } from '../entities/User';
import { logDebug } from '../util/simple-debug-logger';

export const navigationRef =
  createRef<NavigationContainerRef<RootStackParamList>>();

// Define user states more clearly
export enum UserState {
  NO_USER = 'NO_USER',
  ANONYMOUS = 'ANONYMOUS',
  GUEST_INCOMPLETE = 'GUEST_INCOMPLETE',
  GUEST_COMPLETE = 'GUEST_COMPLETE',
  ADMIN_INCOMPLETE = 'ADMIN_INCOMPLETE',
  ADMIN_COMPLETE = 'ADMIN_COMPLETE',
  SUPER_ADMIN_INCOMPLETE = 'SUPER_ADMIN_INCOMPLETE',
  SUPER_ADMIN_COMPLETE = 'SUPER_ADMIN_COMPLETE',
}

// Define navigation contexts
export enum NavigationContext {
  AUTH = 'AUTH',
  SETUP = 'SETUP',
  MAIN = 'MAIN',
}

interface NavigationDecision {
  context: NavigationContext;
  route: keyof RootStackParamList;
  authRoute?: keyof AuthStackParamList;
  mainRoute?: keyof MainTabParamList;
}

class ImprovedNavigationService {
  /**
   * Determine user state from user object
   */
  private getUserState(user: User | null): UserState {
    if (!user) return UserState.NO_USER;
    if (user.isAnonymous) return UserState.ANONYMOUS;

    if (user.isGuest) {
      return user.infoEntered
        ? UserState.GUEST_COMPLETE
        : UserState.GUEST_INCOMPLETE;
    }

    if (user.isAdmin && !user.isSuperAdmin) {
      return user.infoEntered
        ? UserState.ADMIN_COMPLETE
        : UserState.ADMIN_INCOMPLETE;
    }

    if (user.isSuperAdmin) {
      return user.orgSetupCompleted
        ? UserState.SUPER_ADMIN_COMPLETE
        : UserState.SUPER_ADMIN_INCOMPLETE;
    }

    // An operator who signed up but has not finished setup: the user-doc
    // potentialSuperAdmin flag is set at signup, while isSuperAdmin is written
    // only once setup completes (same rule as useSubscriptionGate).
    if (user.potentialSuperAdmin === true && !user.orgSetupCompleted) {
      return UserState.SUPER_ADMIN_INCOMPLETE;
    }

    return UserState.NO_USER;
  }

  /**
   * Make navigation decision based on user state and invitation
   */
  private makeNavigationDecision(
    user: User | null,
    invitation?: any,
  ): NavigationDecision {
    const userState = this.getUserState(user);

    logDebug('NavigationService - User state:', {
      userState,
      hasInvitation: !!invitation,
      user,
      invitation,
    });

    // Handle invitation flow
    if (invitation) {
      return this.handleInvitationFlow(userState, invitation);
    }

    // Handle regular user flow
    return this.handleRegularFlow(userState);
  }

  /**
   * Handle invitation-based navigation
   */
  private handleInvitationFlow(
    userState: UserState,
    invitation: any,
  ): NavigationDecision {
    switch (userState) {
      case UserState.NO_USER:
      case UserState.ANONYMOUS:
        return {
          context: NavigationContext.AUTH,
          route: Routes.PriorAuth,
          authRoute: Routes.Signup,
        };

      case UserState.GUEST_INCOMPLETE:
      case UserState.ADMIN_INCOMPLETE:
        return {
          context: NavigationContext.AUTH,
          route: Routes.PriorAuth,
          authRoute: Routes.NewAccount,
        };

      // Signed in with an invitation (e.g. the app was cold-started by an
      // invitation link): open the invitation screen, the signup screen that
      // shows it (testID invitation-info). A link that arrives while the app
      // runs goes there through navigateToInvitation.
      case UserState.GUEST_COMPLETE:
      case UserState.ADMIN_COMPLETE:
      case UserState.SUPER_ADMIN_COMPLETE:
      default:
        return {
          context: NavigationContext.AUTH,
          route: Routes.PriorAuth,
          authRoute: Routes.Signup,
        };
    }
  }

  /**
   * Handle regular user navigation (no invitation)
   *
   * For regular logins, authenticated admin/guest users always go to Main
   * regardless of infoEntered state. The infoEntered check only applies in
   * the invitation flow (handleInvitationFlow) for first-time setup.
   * This matches the pre-migration determineInitialRoute behavior.
   */
  private handleRegularFlow(userState: UserState): NavigationDecision {
    switch (userState) {
      case UserState.NO_USER:
      case UserState.ANONYMOUS:
        return {
          context: NavigationContext.AUTH,
          route: Routes.PriorAuth,
          authRoute: Routes.InitialLanding,
        };

      case UserState.GUEST_INCOMPLETE:
      case UserState.GUEST_COMPLETE:
        return {
          context: NavigationContext.MAIN,
          route: Routes.Main,
          mainRoute: Routes.Guest,
        };

      case UserState.ADMIN_INCOMPLETE:
      case UserState.ADMIN_COMPLETE:
        return {
          context: NavigationContext.MAIN,
          route: Routes.Main,
          mainRoute: Routes.House,
        };

      case UserState.SUPER_ADMIN_INCOMPLETE:
        return {
          context: NavigationContext.SETUP,
          route: Routes.Setup,
        };

      case UserState.SUPER_ADMIN_COMPLETE:
        return {
          context: NavigationContext.MAIN,
          route: Routes.Main,
          mainRoute: Routes.House,
        };

      default:
        return {
          context: NavigationContext.AUTH,
          route: Routes.PriorAuth,
          authRoute: Routes.InitialLanding,
        };
    }
  }

  /**
   * Get initial navigation configuration
   * Accepts Partial<User> to handle incomplete user data from Redux state
   */
  getInitialNavigation(user: Partial<User> | User | null, invitation?: any) {
    const decision = this.makeNavigationDecision(user as User | null, invitation);

    logDebug('NavigationService - Navigation decision:', decision);

    return {
      initialRoute: decision.route,
      authInitialRoute: decision.authRoute,
      initialMainRoute: decision.mainRoute,
    };
  }

  // Standard navigation methods
  navigate<RouteName extends keyof RootStackParamList>(
    routeName: RouteName,
    params?: RootStackParamList[RouteName],
  ) {
    if (navigationRef.current) {
      navigationRef.current.navigate(routeName as any, params as any);
    }
  }

  reset<RouteName extends keyof RootStackParamList>(
    routeName: RouteName,
    params?: RootStackParamList[RouteName],
  ) {
    if (navigationRef.current) {
      navigationRef.current.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: routeName, params }],
        }),
      );
    }
  }

  /**
   * The signed-in invitation route: the screen that shows the invitation in
   * state.user.invitation (SignUp, testID invitation-info). deliverAppLink
   * calls it after storing the invitation. Before the navigator is ready
   * (cold start) the initial route decision (handleInvitationFlow) opens it.
   */
  navigateToInvitation() {
    if (navigationRef.current?.isReady()) {
      navigationRef.current.navigate(Routes.PriorAuth, { screen: Routes.Signup } as any);
    }
  }

  /**
   * Leaves the invitation screen: resets to the start route the user would
   * get with no invitation (getInitialNavigation), e.g. Main on the user's
   * tab. Used after "Accept as this account" and "Continue to the app".
   */
  resetToStartRoute(user: Partial<User> | User | null) {
    if (!navigationRef.current?.isReady()) return;
    const { initialRoute, authInitialRoute, initialMainRoute } = this.getInitialNavigation(user);
    let route: { name: keyof RootStackParamList; state?: any };
    if (initialRoute === Routes.Main) {
      route = {
        name: Routes.Main,
        state: { index: 0, routes: [{ name: initialMainRoute ?? Routes.House }] },
      };
    } else if (initialRoute === Routes.PriorAuth) {
      route = {
        name: Routes.PriorAuth,
        state: { index: 0, routes: [{ name: authInitialRoute ?? Routes.InitialLanding }] },
      };
    } else {
      route = { name: initialRoute as keyof RootStackParamList };
    }
    navigationRef.current.dispatch(CommonActions.reset({ index: 0, routes: [route] }));
  }

  goBack() {
    if (navigationRef.current) {
      navigationRef.current.goBack();
    }
  }

  getCurrentRoute() {
    if (navigationRef.current) {
      return navigationRef.current.getCurrentRoute()?.name;
    }
    return null;
  }
}

export default new ImprovedNavigationService();
