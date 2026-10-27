#!/usr/bin/env node
/**
 * Fails a release build whose bundle would ship without usable configuration.
 *
 * Why this exists: `process.env.STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder'`
 * shipped in every build for months. Nothing caught it, because an unconfigured
 * key is invisible until a resident tries to pay. A missing value must break the
 * build, not the payment.
 *
 * Run before bundling a release artifact:
 *   node scripts/check-release-env.js --release
 *
 * Without --release only presence is checked, so a developer using a pk_test_
 * key still gets told when a variable is missing entirely.
 */

const { BUNDLED_ENV } = require('./bundled-env');
const { stripeKeyReleaseProblem, e2eVariantProblem } = require('./release-guard');

const RELEASE = process.argv.includes('--release');

// Every name must be in BUNDLED_ENV (scripts/bundled-env.js, which
// babel.config.js inlines). A name missing there is never substituted into the
// bundle, so the check would pass while the app still reads undefined.
//
// Release-mode Stripe and E2E_VARIANT rules are scripts/release-guard.js's own,
// so the two checks cannot drift. GOOGLE_MAPS_API_KEY stays here only: the
// release guard checks that a store build points at production (Firebase
// project, live payments), and a missing Maps key breaks a feature rather than
// pointing the app at the wrong environment.
const REQUIRED = [
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
    releaseOnly: false,
    validate: (value) => {
      if (value === 'pk_test_placeholder') {
        return 'is the historical placeholder, which is not a usable Stripe key';
      }
      if (!value.startsWith('pk_')) {
        return 'does not look like a Stripe publishable key (expected a pk_ prefix)';
      }
      if (value.startsWith('sk_')) {
        return 'is a SECRET key; publishable keys start with pk_';
      }
      if (RELEASE) {
        const problem = stripeKeyReleaseProblem(value);
        // The shared message starts with the variable's name.
        return problem && problem.replace(/^STRIPE_PUBLISHABLE_KEY /, '');
      }
      return null;
    },
  },
  {
    name: 'GOOGLE_MAPS_API_KEY',
    releaseOnly: true,
    validate: () => null,
  },
];

try {
  require('dotenv').config({ quiet: true });
} catch (_) {
  // dotenv is a devDependency; CI exports the variables directly.
}

const problems = [];

for (const { name } of REQUIRED) {
  if (!BUNDLED_ENV.includes(name)) {
    problems.push(`${name} is checked here but not in BUNDLED_ENV (scripts/bundled-env.js)`);
  }
}

// babel.config.js inlines E2E_VARIANT into the bundle. Set in a release or
// developer environment (an exported shell variable, or a line in .env), it
// would turn that bundle into an e2e build. Only the Gradle e2e build types
// set it, on their own bundle tasks.
const variantProblem = e2eVariantProblem(process.env.E2E_VARIANT);
if (variantProblem) {
  problems.push(variantProblem);
}

for (const { name, releaseOnly, validate } of REQUIRED) {
  if (releaseOnly && !RELEASE) {
    continue;
  }
  const value = process.env[name];
  if (!value) {
    problems.push(`${name} is not set`);
    continue;
  }
  const problem = validate(value);
  if (problem) {
    problems.push(`${name} ${problem}`);
  }
}

if (problems.length > 0) {
  const mode = RELEASE ? 'release' : 'development';
  // Never print the values themselves — this output reaches CI logs.
  console.error(`\nBuild configuration is not valid for a ${mode} build:\n`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(
    '\nSet these in regroup/mobile/.env for a local build, or in the CI / ' +
      'fastlane environment for a release build. See .env.example.\n',
  );
  process.exit(1);
}

console.log(`Build configuration OK (${RELEASE ? 'release' : 'development'} mode).`);
