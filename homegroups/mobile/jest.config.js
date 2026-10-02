module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-redux|@reduxjs|@invertase|@stripe|immer))',
  ],
  setupFiles: [
    require.resolve('react-native/jest/setup.js'),
    './jest.setup.js',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    // Shared setup imported by the membership specs, not a suite of its own.
    // It sits under __tests__ so tsconfig's existing exclude keeps covering it;
    // without this line Jest collects it and fails it for having no tests.
    '<rootDir>/src/store/slices/__tests__/membershipHarness\\.ts$',
  ],
  moduleNameMapper: {
    // Mock App.tsx to avoid loading the entire app in smoke tests
    '\\.\\./App': '<rootDir>/__mocks__/App.js',
  },
};
