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
const BUNDLED_ENV = ['STRIPE_PUBLISHABLE_KEY', 'RATS_WEB_URL', 'GOOGLE_MAPS_API_KEY'];

// Under Jest the substitution is skipped so tests can set process.env and
// re-require a module. src/services/__tests__/google-apikeys.test.ts and
// src/screens/SubscriptionUpdateModal/__tests__/accountUrl.test.ts both rely on
// that; inlining at transform time would freeze the value and break them.
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  // Loads .env into process.env so a local `npm run ios` picks the values up.
  // CI and fastlane export them directly, where there is no .env to read.
  require('dotenv').config({ quiet: true });
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
