module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-redux|@reduxjs|@invertase|@stripe|immer))',
  ],
  setupFiles: [
    require.resolve('react-native/jest/setup.js'),
    './jest.setup.js',
  ],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/e2e/'],
  moduleNameMapper: {
    // Mock App.tsx to avoid loading the entire app in smoke tests
    '\\.\\./App': '<rootDir>/__mocks__/App.js',
  },
};
