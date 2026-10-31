// React Native does not populate `process.env` at runtime. Metro's babel preset
// leaves `process.env.X` in place, and the RN runtime polyfills `process.env`
// with NODE_ENV alone — so a bare `process.env.MY_VAR` read in app code is
// always `undefined`, whatever the build shell exported.
//
// Every name in BUNDLED_ENV is substituted with a string literal while the
// bundle is built. That is the only way a build-time value reaches app code.
//
// Adding a name here bakes its value into a shipped artifact that anyone can
// unzip. Only non-secret, client-safe values belong: publishable keys, public
// base URLs, and API keys whose protection is server-side referrer/bundle-id
// restriction rather than secrecy. Never add a Stripe secret key, a webhook
// signing secret, or a service-account credential.
//
// E2E_VARIANT ('emulator' | 'staging', unset for every other build) is read via
// e2eVariant() in src/config/env.ts. Being bundle-time is the point: no launch
// argument can turn a store build into an e2e build.
//
// The list lives in scripts/bundled-env.js, which the Android bundle tasks'
// env stamp and scripts/check-release-env.js share; babel rejects unknown keys
// on this module's exports, so it cannot be exported from here.
const { BUNDLED_ENV } = require('./scripts/bundled-env');

// Under Jest the substitution is skipped so tests can set process.env and
// re-require a module. src/services/__tests__/google-apikeys.test.ts and
// src/screens/SubscriptionUpdateModal/__tests__/accountUrl.test.ts both rely on
// that; inlining at transform time would freeze the value and break them.
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  // Loads .env into process.env so a local `npm run ios` picks the values up.
  // CI and fastlane export them directly, where there is no .env to read.
  const variantBeforeDotenv = process.env.E2E_VARIANT;
  require('dotenv').config({ quiet: true });
  // E2E_VARIANT is set per build by the Gradle e2e bundle tasks, never from a
  // file: a line left in a developer's .env would make every bundle and every
  // Metro session from that checkout an e2e build. dotenv never overrides an
  // exported value, so a change here means .env supplied it.
  if (process.env.E2E_VARIANT !== variantBeforeDotenv) {
    throw new Error(
      'E2E_VARIANT must not be set in .env; the e2e build types set it per build. Remove it from .env.',
    );
  }
}

// A mistyped E2E_VARIANT would bundle as a non-e2e build that a harness still
// treats as one. Fail the bundle instead. Checked after .env is loaded.
const E2E_VARIANTS = ['emulator', 'staging'];
const e2eVariant = process.env.E2E_VARIANT;
if (e2eVariant && !E2E_VARIANTS.includes(e2eVariant)) {
  throw new Error(
    `E2E_VARIANT must be unset or one of ${E2E_VARIANTS.join(', ')}; got "${e2eVariant}"`,
  );
}

// An e2e bundle never carries a live Stripe key: e2e runs make test payments,
// and the release guard asks for pk_live_, which may well be sitting in .env.
// Never prints the key.
if (e2eVariant && (process.env.STRIPE_PUBLISHABLE_KEY || '').startsWith('pk_live_')) {
  throw new Error(
    `E2E_VARIANT=${e2eVariant} bundle with a live Stripe key (pk_live_): e2e builds need a pk_test_ ` +
      'key. Export STRIPE_PUBLISHABLE_KEY=pk_test_... for the e2e build, or remove pk_live_ from .env.',
  );
}

// One whole string literal naming the variant this bundle was built as, so a
// built artifact can be checked: scripts/verify-android-variants.sh greps the
// compiled bundle for it. The bare names cannot serve, since 'emulator' and
// 'staging' appear in every bundle as the E2E_VARIANTS list in src/config/env.ts.
// Not set under Jest, where nothing is inlined.
if (!isTest) {
  process.env.E2E_BUNDLE_MARKER = `regroup-e2e-variant=${e2eVariant || 'none'}`;
}

// @tanstack/query-core 5.x sets its package "react-native" field to
// "src/index.ts", so Metro compiles its TypeScript source rather than a built
// bundle. That source uses class private methods, which the RN preset does not
// enable — without this, `react-native bundle` dies on mutationObserver.ts.
const dependencySyntax = [
  '@babel/plugin-transform-private-methods',
  '@babel/plugin-transform-class-properties',
  '@babel/plugin-transform-private-property-in-object',
].map((plugin) => [plugin, { loose: true }]);

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Neither group applies under Jest: it resolves @tanstack via the package
  // "main" field, which is already-built JavaScript, so dependencySyntax is
  // unnecessary there — and enabling its loose class-property semantics fails
  // 28 suites.
  //
  // react-native-worklets/plugin (react-native-reanimated 4, needed by
  // react-native-keyboard-controller) must be the last plugin. It stays out of
  // Jest, where jest.setup.js mocks reanimated and keyboard-controller.
  plugins: isTest
    ? []
    : [
        ...dependencySyntax,
        ['transform-inline-environment-variables', { include: BUNDLED_ENV }],
        'react-native-worklets/plugin',
      ],
};
