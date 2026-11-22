/**
 * Deep linking for React Navigation, wired into <NavigationContainer> in
 * index.js.
 *
 * Only an allowlist of routes resolves here: the six Main tabs and the two
 * auth screens. Nothing that opens outside SubscriptionGate, nothing
 * operator-only and nothing paywalled is listed. Invitation and checkout-return
 * links are not navigation: parseAppLink / deliverAppLink handle them, so this
 * config declines those URLs (getStateFromPath returns undefined).
 *
 * Test a link:
 *   iOS:     xcrun simctl openurl booted "regroup-app://app/house"
 *   Android: adb shell am start -W -a android.intent.action.VIEW -d "regroup-app://app/house"
 */

import {
  getStateFromPath as defaultGetStateFromPath,
  LinkingOptions,
} from '@react-navigation/native';
import { appLinkPrefixes } from './appLinkPrefixes';
import { RootStackParamList, Routes } from './types';

/** URLs handled by parseAppLink/deliverAppLink, never by navigation state. */
const isHandledElsewhere = (path: string): boolean => {
  const query = path.split('?')[1] ?? '';
  const type = new URLSearchParams(query).get('type');
  return (
    type === 'invitation' ||
    type === 'checkout-return' ||
    /(^|\/)checkout-return(\/|$|\?)/.test(path)
  );
};

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: appLinkPrefixes(),

  config: {
    screens: {
      [Routes.PriorAuth]: {
        path: 'auth',
        screens: {
          [Routes.Login]: 'login',
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

  getStateFromPath: (path, options) =>
    isHandledElsewhere(path) ? undefined : defaultGetStateFromPath(path, options),
};

export default linkingConfig;
