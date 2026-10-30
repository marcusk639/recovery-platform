/**
 * Emulator-backed integration Jest config.
 *
 * `npm run test:integration` referenced this file but it did not exist: the
 * blanket JavaScript rule in regroup/.gitignore meant it could never be
 * committed, the same reason jest.config.rules.js was missing. So six
 * integration suites under src/integration/ plus the emulator suites in
 * src/services never ran anywhere.
 *
 * jest.config.js deliberately ignores both patterns and defers here.
 *
 * Needs the Firestore and Auth emulators. Run through `firebase emulators:exec`
 * so they are guaranteed:
 *
 *   cd firebase && firebase emulators:exec --only firestore,auth \
 *     --project demo-test \
 *     "cd .. && npx jest --config jest.config.integration.js --no-coverage --forceExit"
 *
 * Keeps the react-native preset, unlike the rules config: these exercise app
 * services that import React Native modules. React Native Firebase is replaced
 * by the Firebase JS SDK on the emulators (src/integration/rnfb-to-web.ts):
 * services run as a signed-in Auth-emulator user, so the security rules apply,
 * and suites seed and check data through the Admin SDK
 * (src/integration/firebase-admin-setup.ts).
 */
process.env.TZ = process.env.TZ || 'America/Chicago';

module.exports = {
  preset: '@react-native/jest-preset',
  // The preset's environment resolves the 'react-native' export condition,
  // which loads the JS SDK's React Native builds (AsyncStorage persistence,
  // XHR transport). These run in Node, so use the Node builds.
  testEnvironment: 'node',
  testEnvironmentOptions: { customExportConditions: ['node', 'require', 'default'] },
  setupFiles: ['./src/integration/setup.integration.ts'],
  testMatch: [
    '**/*.integration.test.[jt]s?(x)',
    '**/*.emulator.test.[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/_archive/',
    '<rootDir>/_legacy/',
    '<rootDir>/.full-review-archive-2026-05-23/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|@reduxjs|react-redux|@tanstack|@invertase|@notifee|@stripe|@sentry|@callstack|victory|immer|redux|uuid|ngeohash|@dr\\.pogodin))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Unit tests alias firebase-setup to a mock; here it and the RNFirebase
    // packages the JS SDK covers are the emulator-backed client.
    '^(\\.{1,2}/)+firebase-setup$': '<rootDir>/src/integration/rnfb-to-web.ts',
    '^@react-native-firebase/(app|auth|firestore|functions|storage)$':
      '<rootDir>/src/integration/rnfb-to-web.ts',
  },
  // Emulator round-trips are slower than unit tests.
  testTimeout: 30000,
};
