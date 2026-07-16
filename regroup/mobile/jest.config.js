/**
 * Unit-test Jest config (see .claude/testing.md).
 *
 * - Integration tests (*.integration.test.ts) are excluded here; they
 *   require Firebase emulators and run via jest.config.integration.js.
 * - `firebase-setup` imports (any relative depth) resolve to the shared
 *   manual mock in __mocks__/firebase-setup.ts. Test-local
 *   jest.mock('.../firebase-setup', factory) calls still take precedence.
 * - "@/" maps to src/ in tests only (source code does not use the alias).
 */
// Committed snapshots (e.g. rats-datepicker) were recorded in US Central
// time. Set TZ here (parent process, before workers fork) so date-bearing
// snapshots are machine-independent; setting it in jest.setup.js is too
// late — the worker's VM context has already cached the host timezone.
process.env.TZ = process.env.TZ || 'America/Chicago';

module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  // Only real test files — __tests__/ dirs also hold shared helpers
  // (e.g. src/services/__tests__/firebase-test-utils.ts).
  testMatch: ['**/*.test.[jt]s?(x)', '**/__tests__/*-test.[jt]s?(x)'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/_archive/',
    '<rootDir>/_legacy/',
    '<rootDir>/.full-review-archive-2026-05-23/',
    // Emulator-backed suites — run via jest.config.integration.js /
    // jest.config.rules.js (npm run test:integration / test:rules).
    '<rootDir>/firebase/__tests__/',
    '\\.integration\\.test\\.tsx?$',
    '\\.emulator\\.test\\.tsx?$',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|@reduxjs|react-redux|@tanstack|@invertase|@notifee|@stripe|@sentry|@callstack|victory|immer|redux|uuid|ngeohash))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/)+firebase-setup$': '<rootDir>/__mocks__/firebase-setup.ts',
  },
};
