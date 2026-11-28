/**
 * The version name this build ships with, per platform: what the store shows
 * and what the minimum-version gate compares (components/version-gate).
 *
 * Bump it with every release, together with ios/rats/Info.plist
 * (CFBundleShortVersionString), MARKETING_VERSION in the Xcode project and
 * versionName in android/app/build.gradle. scripts/app-version.test.js fails
 * while they differ.
 */
export const APP_VERSION = {
  ios: '1.54',
  android: '0.56',
} as const;
