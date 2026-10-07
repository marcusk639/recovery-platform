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

const RELEASE = process.argv.includes('--release');

// Mirrors BUNDLED_ENV in babel.config.js. A name here that is missing there is
// never substituted into the bundle, so the check would pass while the app
// still reads undefined.
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
      if (RELEASE && !value.startsWith('pk_live_')) {
        return 'is a test-mode key; a release build requires pk_live_';
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
