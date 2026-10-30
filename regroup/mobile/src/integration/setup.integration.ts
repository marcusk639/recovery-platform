/**
 * Setup for jest.config.integration.js: the unit setup's native-module mocks,
 * minus its React Native Firebase mocks.
 *
 * The integration config maps @react-native-firebase/{app,auth,firestore,
 * functions,storage} to rnfb-to-web.ts (the JS SDK on the emulators), so the
 * unit setup's jest.mock() of those names lands on that one file. dontMock
 * releases it. It must be dontMock, not unmock: babel-jest hoists unmock above
 * the require below, where the unit setup's mocks would then override it.
 * Messaging and analytics keep their unit mocks (no JS SDK equivalent).
 */
require('../../jest.setup');

for (const name of [
  '@react-native-firebase/app',
  '@react-native-firebase/auth',
  '@react-native-firebase/firestore',
  '@react-native-firebase/functions',
  '@react-native-firebase/storage',
]) {
  jest.dontMock(name);
}
