import { CommonActions } from '@react-navigation/native';
import type { User as FirebaseUser } from '@react-native-firebase/auth';
import { User } from '../entities/User';
import improvedNavigationService from './improved-navigation-service';
import { navigationRef } from './service';
import { Routes } from './types';
import { logException } from '../util/logging';

/**
 * How long after a sign-in the root reset waits. A sign-in changes App.tsx's
 * `navigationKey` (uid, loggedIn, anonymous), which remounts the root
 * navigator on its old initial route (the landing screen: App recomputes the
 * routes only in an effect, after that render). The reset must land on the
 * new navigator, so it waits for the remount to commit.
 */
export const SIGNED_IN_RESET_DELAY_MS = 300;

/**
 * After a sign-in, reset the root navigator to the signed-in user's start
 * route: Setup for an operator who hasn't finished setup, Main on its tab
 * (House, or Guest for a resident), or, with an invitation held from before
 * sign-in, the invitation screen (SignUp shows a signed-in user Accept /
 * Continue).
 *
 * Every sign-in that starts on an auth screen must use this, through the
 * global `navigationRef`: the screen's own `navigation` belongs to the
 * navigator the sign-in unmounts, so navigating with it does nothing (the
 * landing screen's Demo link did, and stayed on the landing screen).
 */
export function resetToSignedInRoute(
  user: (User & Partial<FirebaseUser>) | null | undefined,
  { hasInvitation = false, onDone }: { hasInvitation?: boolean; onDone?: () => void } = {},
): void {
  const route = signedInRoute(user, hasInvitation);
  setTimeout(() => {
    const nav = navigationRef.current;
    if (!nav) {
      logException(new Error('signedInNavigation: navigationRef.current is null on signin'));
    } else if (route) {
      nav.dispatch(CommonActions.reset({ index: 0, routes: [route] }));
      // On a slow phone the remount may land after the reset and put the
      // landing screen back: check once more and reset again if so.
      setTimeout(() => {
        if (
          (navigationRef.current?.getCurrentRoute?.()?.name as string | undefined) ===
          Routes.InitialLanding
        ) {
          navigationRef.current?.dispatch(CommonActions.reset({ index: 0, routes: [route] }));
        }
      }, SIGNED_IN_RECHECK_MS);
    }
    onDone?.();
  }, SIGNED_IN_RESET_DELAY_MS);
}

/** After the reset, how long until the landing-screen check. */
export const SIGNED_IN_RECHECK_MS = 1000;

type ResetRoute = { name: Routes; state?: { routes: { name: Routes }[]; index: number } };

function signedInRoute(
  user: (User & Partial<FirebaseUser>) | null | undefined,
  hasInvitation: boolean,
): ResetRoute | null {
  const navigationConfig = hasInvitation
    ? {
        initialRoute: Routes.PriorAuth,
        authInitialRoute: Routes.Signup,
        initialMainRoute: undefined,
      }
    : improvedNavigationService.getInitialNavigation(user ?? null);
  if (navigationConfig.initialRoute === Routes.Setup) return { name: Routes.Setup };
  if (navigationConfig.initialRoute === Routes.Main) {
    const mainRoute =
      navigationConfig.initialMainRoute || (user?.isGuest ? Routes.Guest : Routes.House);
    return { name: Routes.Main, state: { routes: [{ name: mainRoute as Routes }], index: 0 } };
  }
  if (navigationConfig.initialRoute === Routes.PriorAuth && navigationConfig.authInitialRoute) {
    return {
      name: Routes.PriorAuth,
      state: { routes: [{ name: navigationConfig.authInitialRoute as Routes }], index: 0 },
    };
  }
  return null;
}
