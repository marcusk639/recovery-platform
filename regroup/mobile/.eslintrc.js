module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // The app wraps third-party UI and native libraries so a change applies
    // everywhere at once: only the wrapper modules import them.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native-modal',
            message:
              'Use RatsModal (src/components/rats-modal) or RatsLoadingModal; they are the only react-native-modal importers.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/components/rats-modal/**', 'src/components/rats-loading-modal/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
