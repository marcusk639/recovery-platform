import { Linking, Platform } from 'react-native';
import {
  createNewInviteLink,
  // createEmailConfirmationLink removed - no longer needed
} from './native-deep-links';

/**
 * Debug-specific deep link utilities
 * These functions help test deep links in debug mode
 */

/**
 * Test if the app can handle deep links
 */
export const testDeepLinkCapability = async (): Promise<boolean> => {
  try {
    // Test if we can open a simple custom scheme
    const testUrl = 'regroup-app://test';
    const canOpen = await Linking.canOpenURL(testUrl);
    console.log('Deep link capability test:', canOpen);
    return canOpen;
  } catch (error) {
    console.error('Deep link capability test failed:', error);
    return false;
  }
};

/**
 * Create a debug-friendly deep link that works in both debug and release
 */
export const createDebugInviteLink = async (
  houseId: string,
  inviterUserId: string,
  email: string,
  invitationType: any,
  ownerId?: string,
  initialPhase?: string,
): Promise<string> => {
  // Create the standard deep link
  const standardLink = await createNewInviteLink(
    houseId,
    inviterUserId,
    email,
    invitationType,
    ownerId,
    initialPhase,
  );

  // In debug mode, also create a universal link as fallback
  if (__DEV__) {
    const universalLink = standardLink.replace(
      'regroup-app://',
      'https://regroup-app.com/',
    );
    console.log('Debug mode - Standard link:', standardLink);
    console.log('Debug mode - Universal link:', universalLink);

    // Return both options
    return `${standardLink} | Universal: ${universalLink}`;
  }

  return standardLink;
};

/**
 * Test deep link opening
 */
export const testOpenDeepLink = async (url: string): Promise<boolean> => {
  try {
    console.log('Attempting to open deep link:', url);
    const opened = await Linking.openURL(url);
    console.log('Deep link opened successfully:', opened);
    return true;
  } catch (error) {
    console.error('Failed to open deep link:', error);
    return false;
  }
};

/**
 * Get device information for debugging
 */
export const getDeviceInfo = () => {
  return {
    platform: Platform.OS,
    version: Platform.Version,
    isDebug: __DEV__,
    canOpenURL: Linking.canOpenURL,
  };
};

/**
 * Debug deep link configuration
 */
export const debugConfig = {
  // Test URLs for different scenarios
  testUrls: {
    invitation:
      'regroup-app://?type=invitation&house=test123&email=test@example.com&invitationType=guest',
    // emailConfirmation removed - no longer needed
    universalInvitation:
      'https://regroup-app.com/?type=invitation&house=test123&email=test@example.com&invitationType=guest',
    // universalEmailConfirmation removed - no longer needed
  },

  // Bundle identifiers
  bundleIds: {
    debug: 'com.rats.dev',
    release: 'com.rats.dev', // Same for both in your case
  },

  // Custom schemes
  schemes: {
    custom: 'regroup-app://',
    universal: 'https://regroup-app.com/',
  },
};
