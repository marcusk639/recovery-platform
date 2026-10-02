/**
 * Security-rules Jest config (Firestore + Storage).
 *
 * `npm run test:rules` referenced this file but it did not exist, so the
 * emulator-backed suites under firebase/__tests__/ — ~2.3k lines covering
 * payments, Oxford gates, applications, guest self-edit guards and invitations
 * — had no working runner and were effectively untested.
 *
 * These suites need a live Firestore emulator. Run them through
 * `firebase emulators:exec` so one is guaranteed:
 *
 *   cd firebase && firebase emulators:exec --only firestore \
 *     "cd .. && npx jest --config jest.config.rules.js --no-coverage --forceExit"
 *
 * Deliberately NOT the react-native preset: these tests drive the Firebase web
 * SDK and @firebase/rules-unit-testing, which need a plain node environment.
 */
process.env.TZ = process.env.TZ || 'America/Chicago';

module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  testMatch: ['<rootDir>/firebase/__tests__/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  // Emulator round-trips are slower than unit tests.
  testTimeout: 30000,
};
