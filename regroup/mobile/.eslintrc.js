// The app wraps third-party UI and native libraries so a change applies everywhere at once:
// only the wrapper modules import them. Each entry lists the files allowed to import it.
// (An override replaces a rule's options rather than merging them, so every file group gets
// the full list minus its own exemptions.)
const RESTRICTED = [
  {
    name: 'react-native-modal',
    message:
      'Use RatsModal (src/components/rats-modal) or RatsLoadingModal; they are the only react-native-modal importers.',
    allowedIn: ['src/components/rats-modal/**', 'src/components/rats-loading-modal/**'],
  },
  {
    name: '@react-native-vector-icons/fontawesome5',
    message:
      'Use src/components/rats-icon/font-awesome-5 (it keeps react-native-vector-icons 9 style selection).',
    allowedIn: ['src/components/rats-icon/font-awesome-5.tsx'],
  },
  {
    name: '@react-native-vector-icons/fontawesome5/static',
    message:
      'Use src/components/rats-icon/font-awesome-5 (it keeps react-native-vector-icons 9 style selection).',
    allowedIn: ['src/components/rats-icon/font-awesome-5.tsx'],
  },
  {
    name: 'react-native-notify-kit',
    message:
      'Use src/services/notifications (channels, remoteMessage, rentReminder); it is the only react-native-notify-kit importer.',
    allowedIn: ['src/services/notifications/**'],
  },
  {
    name: 'react-native-keyboard-controller',
    message:
      'Use src/components/rats-keyboard or RatsScrollView; with index.js they are the only react-native-keyboard-controller importers.',
    allowedIn: [
      'src/components/rats-keyboard/**',
      'src/components/rats-scroll-view/**',
      'index.js',
      // Tests inspect the library's components (its Jest mock).
      'src/**/__tests__/**',
    ],
  },
];

const PATTERNS = [
  {
    group: ['react-native-vector-icons', 'react-native-vector-icons/*'],
    message:
      'react-native-vector-icons is replaced by @react-native-vector-icons/<family>/static (FontAwesome5 via rats-icon/font-awesome-5).',
  },
];

const restrictedImports = (exempt = []) => [
  'error',
  {
    paths: RESTRICTED.filter((r) => !exempt.includes(r.name)).map(({ name, message }) => ({
      name,
      message,
    })),
    patterns: PATTERNS,
  },
];

const fileGroups = [...new Set(RESTRICTED.flatMap((r) => r.allowedIn))];

module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'no-restricted-imports': restrictedImports(),
  },
  overrides: fileGroups.map((files) => ({
    files: [files],
    rules: {
      'no-restricted-imports': restrictedImports(
        RESTRICTED.filter((r) => r.allowedIn.includes(files)).map((r) => r.name),
      ),
    },
  })),
};
