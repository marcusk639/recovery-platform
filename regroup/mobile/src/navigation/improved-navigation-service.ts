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

      case UserState.GUEST_COMPLETE:
      case UserState.ADMIN_COMPLETE:
      case UserState.SUPER_ADMIN_COMPLETE:
        return {
          context: NavigationContext.MAIN,
          route: Routes.Main,
          mainRoute: this.getMainRouteForUser(userState),
        };

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
   * Get main route based on user state
   */
  private getMainRouteForUser(userState: UserState): keyof MainTabParamList {
    switch (userState) {
      case UserState.GUEST_COMPLETE:
        return Routes.Guest;
      case UserState.ADMIN_COMPLETE:
      case UserState.SUPER_ADMIN_COMPLETE:
        return Routes.House;
      default:
        return Routes.House;
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
