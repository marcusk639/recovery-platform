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
const BUNDLED_ENV = [
  'STRIPE_PUBLISHABLE_KEY',
  'RATS_WEB_URL',
  'GOOGLE_MAPS_API_KEY',
  'E2E_VARIANT',
  'E2E_BUNDLE_MARKER',
];

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
  presets: ['module:metro-react-native-babel-preset'],
  // Neither group applies under Jest: it resolves @tanstack via the package
  // "main" field, which is already-built JavaScript, so dependencySyntax is
  // unnecessary there — and enabling its loose class-property semantics fails
  // 28 suites.
  plugins: isTest
    ? []
    : [...dependencySyntax, ['transform-inline-environment-variables', { include: BUNDLED_ENV }]],
};
