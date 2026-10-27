#!/usr/bin/env node
/**
 * Release-build guard: a store build must point at the production Firebase
 * project and carry a live Stripe publishable key.
 *
 * It judges the values the build actually resolved, never a string scan of the
 * source or the bundle (env.ts ships the literal 'pk_test_placeholder' as a
 * constant in every bundle):
 *   - the Firebase project: from the native config file that ships, passed as
 *     --config. Android: the values.xml processReleaseGoogleServices generated
 *     from the google-services.json the release variant uses. iOS: the
 *     GoogleService-Info.plist inside the built .app. A google-services.json is
 *     accepted too.
 *   - STRIPE_PUBLISHABLE_KEY: resolved the way babel.config.js resolves it for
 *     the bundle, an exported value first, then .env in the working directory
 *     via dotenv. The builds run this from regroup/mobile, as they run Metro.
 *   - E2E_VARIANT: must be unset, as scripts/check-release-env.js requires.
 *
 * Hooked into the Android `release` build type (preReleaseBuild) and the iOS
 * Release configuration only. The e2e build types and Debug are not checked.
 *
 *   node scripts/release-guard.js --config <values.xml | GoogleService-Info.plist | google-services.json>
 *
 * Never prints the key; only its mode prefix.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

const PRODUCTION_FIREBASE_PROJECT = 'phoenix-cleanhouse';
const LIVE_KEY_PREFIX = 'pk_live_';

/**
 * @param {{ firebaseProjectId?: string, stripePublishableKey?: string, e2eVariant?: string }} input
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function checkRelease({ firebaseProjectId, stripePublishableKey, e2eVariant }) {
  const reasons = [];
  if (firebaseProjectId !== PRODUCTION_FIREBASE_PROJECT) {
    reasons.push(
      `Firebase project is '${firebaseProjectId || ''}'; a release build must use '${PRODUCTION_FIREBASE_PROJECT}'`,
    );
  }
  if (!stripePublishableKey || !stripePublishableKey.startsWith(LIVE_KEY_PREFIX)) {
    reasons.push(
      `STRIPE_PUBLISHABLE_KEY is ${describeKey(stripePublishableKey)}; a release build requires a ${LIVE_KEY_PREFIX} key`,
    );
  }
  if (e2eVariant !== undefined) {
    reasons.push(
      'E2E_VARIANT is set; it must be unset outside the e2e build types (check your shell and .env)',
    );
  }
  return { ok: reasons.length === 0, reasons };
}

/** The key's mode only: safe for CI logs. */
function describeKey(key) {
  if (!key) {
    return 'empty';
  }
  const match = /^(pk|sk|rk)_(live|test)_/.exec(key);
  return match ? `a ${match[0]} key` : 'not a Stripe publishable key';
}

/** Reads the Firebase project id from a native config file. */
function readFirebaseProjectId(file) {
  const raw = fs.readFileSync(file);
  if (file.endsWith('.json')) {
    return JSON.parse(raw.toString('utf8')).project_info?.project_id;
  }
  if (file.endsWith('.plist')) {
    // Xcode may copy a plist resource as binary; plutil reads either form.
    const text =
      raw.subarray(0, 6).toString('latin1') === 'bplist'
        ? execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], {
            encoding: 'utf8',
          })
        : raw.toString('utf8');
    return /<key>PROJECT_ID<\/key>\s*<string>([^<]*)<\/string>/.exec(text)?.[1];
  }
  if (file.endsWith('.xml')) {
    return /<string name="project_id"[^>]*>([^<]*)<\/string>/.exec(raw.toString('utf8'))?.[1];
  }
  throw new Error(`unrecognised config file type: ${file}`);
}

function main(argv) {
  const index = argv.indexOf('--config');
  const config = index === -1 ? undefined : argv[index + 1];
  if (!config) {
    console.error(
      'usage: release-guard.js --config <values.xml | GoogleService-Info.plist | google-services.json>',
    );
    return 1;
  }

  try {
    require('dotenv').config({ quiet: true });
  } catch (_) {
    // dotenv is a devDependency; CI exports the variables directly.
  }

  let firebaseProjectId;
  try {
    firebaseProjectId = readFirebaseProjectId(config);
  } catch (error) {
    console.error(
      `error: Release guard could not read the Firebase config ${config}: ${error.message}`,
    );
    return 1;
  }

  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const { ok, reasons } = checkRelease({
    firebaseProjectId,
    stripePublishableKey,
    e2eVariant: process.env.E2E_VARIANT,
  });
  if (!ok) {
    console.error(`\nerror: Release guard failed (Firebase config ${config}):`);
    for (const reason of reasons) {
      console.error(`error:   - ${reason}`);
    }
    console.error(
      'Store builds need the production config. For an e2e build use the e2e build ' +
        'types (Android e2eEmulator/e2eStaging, iOS E2EEmulator/E2EStaging).\n',
    );
    return 1;
  }
  console.log(
    `Release guard OK: Firebase project ${firebaseProjectId}, STRIPE_PUBLISHABLE_KEY is ${describeKey(stripePublishableKey)}`,
  );
  return 0;
}

module.exports = { checkRelease, readFirebaseProjectId };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
