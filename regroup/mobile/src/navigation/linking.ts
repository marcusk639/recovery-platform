/**
 * Deep Linking Configuration for React Navigation
 *
 * Phase 6.4: Configuration ready for implementation
 *
 * This file defines the deep linking configuration for the app.
 * When NavigationContainer is set up, pass this config to the linking prop.
 *
 * Usage:
 * ```typescript
 * import { linkingConfig } from './navigation/linking';
 *
 * <NavigationContainer linking={linkingConfig}>
 *   <RootNavigator />
 * </NavigationContainer>
 * ```
 *
 * For more info: https://reactnavigation.org/docs/deep-linking
 */

import { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList, Routes } from './types';

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'regroup://',  // Custom URL scheme
    'https://regroup-app.com',  // Universal link
    'https://*.regroup-app.com',  // Universal link wildcard
  ],

  config: {
    screens: {
      // Auth screens
      [Routes.PriorAuth]: {
        path: 'auth',
        screens: {
          [Routes.InitialLanding]: 'landing',
          [Routes.Login]: 'login',
          [Routes.Signup]: 'signup/:invitation?',  // Optional invitation parameter
          [Routes.NewAccount]: 'new-account',
          [Routes.HouseSearch]: 'house-search',
          [Routes.ManagerIntro]: 'manager-intro',
          [Routes.IntroHouseSummary]: 'intro-house',
        },
      } as any,

      // Setup screens
      [Routes.Setup]: {
        path: 'setup',
        screens: {
          [Routes.OrgSetup]: 'org',
          [Routes.OperatorSetupWizard]: 'wizard',
        },
      } as any,

      // Main app
      [Routes.Main]: {
        path: 'app',
        screens: {
          // Tab routes
          [Routes.House]: 'house',
          [Routes.Guest]: 'guest',
          [Routes.Activities]: 'activities',
          [Routes.Contacts]: 'contacts',
          [Routes.HouseChat]: 'chat',
          [Routes.Personal]: 'personal',
        },
      } as any,

      // House screens (modals)
      [Routes.HouseSummary]: 'house/:houseId?',
      [Routes.Beds]: 'house/:houseId/beds',
      [Routes.HouseDisputes]: 'house/:houseId/disputes',

      // Guest screens (modals)
      [Routes.GuestOverview]: 'guest/:guestId',
      [Routes.MeetingSummary]: 'guest/:guestId/meetings',
      [Routes.WorkSummary]: 'guest/:guestId/work',
      [Routes.ChoreSummary]: 'guest/:guestId/chores',
      [Routes.SupporterSummary]: 'guest/:guestId/supporter',

      // Contacts screens
      [Routes.ContactsScreen]: 'contacts',
      [Routes.DirectMessage]: 'chat/:userId',

      // Personal/Utilities screens
      [Routes.PersonalScreen]: 'personal',
      [Routes.EditUserInfo]: 'profile/edit',
      [Routes.InAppOrgSetup]: 'setup/org',

      // Shared screens
      [Routes.Issues]: 'issues',
      [Routes.Complaints]: 'complaints',

      // Other modal screens
      [Routes.HouseList]: 'houses',
      [Routes.NewMeeting]: 'meetings/new',
      [Routes.GuestList]: 'guests',
      [Routes.PhaseSetup]: 'setup/phase',
      [Routes.HouseSettings]: 'settings/house',
      [Routes.GuestInfo]: 'users/:userId',
      [Routes.PhaseCustomization]: 'phase/customize',
      [Routes.SubscriptionHandler]: 'subscription',
      [Routes.SendInvites]: 'invites/send',
      [Routes.MeetingSearch]: 'meetings/search',
      [Routes.NewAccount]: 'account/new',
    },
  },
};

/**
 * Example deep link URLs:
 *
 * - regroup://auth/login
 * - regroup://chat/user123
 * - regroup://guest/guest456/meetings
 * - https://regroup-app.com/house/house789
 * - https://regroup-app.com/app/activities
 *
 * To test deep links:
 *
 * iOS (Simulator):
 * ```bash
 * xcrun simctl openurl booted "regroup://app/house"
 * ```
 *
 * Android (Device/Emulator):
 * ```bash
 * adb shell am start -W -a android.intent.action.VIEW -d "regroup://app/house"
 * ```
 *
 * Universal Links (iOS):
 * Requires apple-app-site-association file at:
 * https://regroup-app.com/.well-known/apple-app-site-association
 *
 * App Links (Android):
 * Requires assetlinks.json file at:
 * https://regroup-app.com/.well-known/assetlinks.json
 */

export default linkingConfig;
