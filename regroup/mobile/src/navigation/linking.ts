/**
 * Deep linking for React Navigation, wired into <NavigationContainer> in
 * index.js.
 *
 * Only an allowlist of routes resolves here: the six Main tabs and the two
 * auth screens. Nothing that opens outside SubscriptionGate, nothing
 * operator-only and nothing paywalled is listed. Invitation and checkout-return
 * links are not navigation: parseAppLink / deliverAppLink handle them, so this
 * config declines every URL parseAppLink claims (getStateFromPath returns
 * undefined).
 *
 * An `app/*` (Main tab) link opens only for a signed-in, non-anonymous user.
 * Signed out or anonymous, it is dropped and the app stays where it is (the
 * landing screen): it is not held for after sign-in, because sign-in itself
 * resets navigation to the user's own start route (LoginForm, signup).
 * Firebase Auth's currentUser is read, not the store: at cold start the store
 * has no user yet, while the native session is restored synchronously.
 *
 * Test a link:
 *   iOS:     xcrun simctl openurl booted "regroup-app://app/house"
 *   Android: adb shell am start -W -a android.intent.action.VIEW -d "regroup-app://app/house"
 */

import {
  getStateFromPath as defaultGetStateFromPath,
  LinkingOptions,
} from '@react-navigation/native';
import { getAuth } from '@react-native-firebase/auth';
import { appLinkPrefixes } from './appLinkPrefixes';
import { parseAppLink } from '../services/appLinks/parseAppLink';
import { RootStackParamList, Routes } from './types';

const stripLeadingSlashes = (path: string): string => path.replace(/^\/+/, '');

/**
 * URLs handled by parseAppLink/deliverAppLink, never by navigation state.
 * React Navigation passes the path after the prefix (query included), so it is
 * re-read on the canonical scheme: every accepted prefix shares these paths.
 */
export const isHandledElsewhere = (path: string): boolean =>
  parseAppLink(`regroup-app://${stripLeadingSlashes(path)}`) !== null;

const isMainRoute = (path: string): boolean =>
  /^app(\/|\?|#|$)/.test(stripLeadingSlashes(path));

const isSignedIn = (): boolean => {
  const user = getAuth().currentUser;
  return !!user && !user.isAnonymous;
};

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: appLinkPrefixes(),

  config: {
    screens: {
      [Routes.PriorAuth]: {
        path: 'auth',
        screens: {
          [Routes.Login]: 'login',
          // The :invitation param is never consumed: invitations arrive only
          // through parseAppLink -> deliverAppLink -> initializeInvitation.
          [Routes.Signup]: 'signup/:invitation?',
        },
      } as any,

      [Routes.Main]: {
        path: 'app',
        screens: {
          [Routes.House]: 'house',
          [Routes.Guest]: 'guest',
          [Routes.Activities]: 'activities',
          [Routes.Contacts]: 'contacts',
          [Routes.HouseChat]: 'chat',
          [Routes.Personal]: 'personal',
        },
      } as any,
    },
  },

  getStateFromPath: (path, options) => {
    if (isHandledElsewhere(path)) return undefined;
    if (isMainRoute(path) && !isSignedIn()) return undefined;
    return defaultGetStateFromPath(path, options);
  },
};

export default linkingConfig;
