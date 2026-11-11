// The explicit list of native imports the portal knows about. Anything native
// that is not listed fails the build, so nothing gets silently stubbed.
//
//   real      a web-safe package, bundled as is
//   replace   swapped for a portal module, or another package when target is bare
//   deferred  not built yet: renders a visible message, throws when called
//   inert     no meaning on the web: does nothing, and must say why

const REAL = [
  'react-native-web',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-modal',
  'react-native-animatable',
  'react-native-popover-view',
  'react-native-collapsible',
  'react-native-size-matters',
  'react-native-simple-radio-button',
  '@react-native/normalize-colors',
  '@react-native/normalize-color',
  '@react-native-vector-icons/ionicons/glyphmaps',
  '@react-native-vector-icons/ionicons/fonts',
  '@react-native-vector-icons/material-icons/glyphmaps',
  '@react-native-vector-icons/material-icons/fonts',
  '@react-native-vector-icons/fontawesome5/glyphmaps',
  '@react-native-vector-icons/fontawesome5/fonts',
];

const REPLACE = {
  'react-native': 'src/adapter/react-native.ts',
  'victory-native': 'victory',
  '@react-native-firebase/app': 'src/adapter/firebase/app.ts',
  '@react-native-firebase/auth': 'src/adapter/firebase/auth.ts',
  '@react-native-firebase/firestore': 'src/adapter/firebase/firestore.ts',
  '@react-native-firebase/functions': 'src/adapter/firebase/functions.ts',
  '@react-native-firebase/storage': 'src/adapter/firebase/storage.ts',
  '@sentry/react-native': 'src/adapter/sentry.ts',
  'react-native-keyboard-controller': 'src/adapter/keyboard-controller.tsx',
  'react-native-picker-select': 'src/adapter/picker-select.tsx',
  'react-native-gesture-handler': 'src/adapter/gesture-handler.ts',
  '@react-native-documents/picker': 'src/adapter/document-picker.ts',
  'react-native-iphone-x-helper': 'src/adapter/iphone-x-helper.ts',
  'deprecated-react-native-prop-types': 'src/adapter/prop-types.ts',
  '@react-native-vector-icons/ionicons/static': 'src/adapter/icons/ionicons.tsx',
  '@react-native-vector-icons/material-icons/static': 'src/adapter/icons/material-icons.tsx',
  '@react-native-vector-icons/fontawesome5/static': 'src/adapter/icons/fontawesome5.tsx',
  // The browser's print dialog saves the phone's own HTML as a PDF.
  'react-native-html-to-pdf': 'src/adapter/html-to-pdf.ts',
};

const DEFERRED = [
  'react-native-google-places-autocomplete',
  'react-native-image-picker',
  '@stripe/stripe-react-native',
  'react-native-date-picker',
];

const INERT = {
  '@react-native-community/geolocation':
    'util/geolocation.ts configures it while loading, and desk workflows use no location.',
  '@react-native-firebase/messaging': 'Push notifications belong to the phone.',
  '@react-native-firebase/analytics': 'The portal sends no analytics, to keep resident data out of them.',
  'react-native-notify-kit': 'Device notifications belong to the phone.',
  'react-native-launch-arguments': 'Launch arguments only exist in native e2e builds.',
};

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function isNative(specifier) {
  return packageName(specifier).includes('react-native') || specifier === '@sentry/react-native';
}

// Longest listed prefix wins, so a listed subpath can differ from its package.
function lookup(list, specifier) {
  return list
    .filter((name) => specifier === name || specifier.startsWith(`${name}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function classify(specifier) {
  const candidates = [
    ['real', lookup(REAL, specifier)],
    ['replace', lookup(Object.keys(REPLACE), specifier)],
    ['deferred', lookup(DEFERRED, specifier)],
    ['inert', lookup(Object.keys(INERT), specifier)],
  ].filter(([, name]) => name);
  if (candidates.length > 0) {
    const [kind, name] = candidates.sort((a, b) => b[1].length - a[1].length)[0];
    if (kind === 'replace') return { kind, target: REPLACE[name] };
    if (kind === 'inert') return { kind, reason: INERT[name] };
    return { kind };
  }
  return { kind: isNative(specifier) ? 'unknown' : 'real' };
}

export function inertEntries() {
  return Object.entries(INERT).map(([name, reason]) => ({ name, reason }));
}
