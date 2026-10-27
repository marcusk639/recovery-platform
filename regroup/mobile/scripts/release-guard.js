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
 *   - E2E_VARIANT: must be unset.
 * scripts/check-release-env.js --release applies the same key and E2E_VARIANT
 * rules (stripeKeyReleaseProblem, e2eVariantProblem).
 *
 * Hooked into the Android `release` build type (preReleaseBuild) and every iOS
 * configuration except Debug and E2E*. The e2e build types are not checked.
 *
 *   node scripts/release-guard.js --config <values.xml | GoogleService-Info.plist | google-services.json>
 *     [--env-stamp <file>]   on success, write the bundled-env digest there
 *                            (scripts/bundled-env.js), an input of the
 *                            Android release bundle task
 *
 * Never prints the key; only its mode prefix.
 */

const { Buffer } = require('buffer');
const fs = require('fs');
const { writeBundledEnvStamp } = require('./bundled-env');

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
      `Firebase project is '${
        firebaseProjectId || ''
      }'; a release build must use '${PRODUCTION_FIREBASE_PROJECT}'`,
    );
  }
  for (const problem of [
    stripeKeyReleaseProblem(stripePublishableKey),
    e2eVariantProblem(e2eVariant),
  ]) {
    if (problem) {
      reasons.push(problem);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/** Why a release build cannot ship this key, or null. Never includes the key. */
function stripeKeyReleaseProblem(key) {
  if (key && key.startsWith(LIVE_KEY_PREFIX) && key.length > LIVE_KEY_PREFIX.length) {
    return null;
  }
  return `STRIPE_PUBLISHABLE_KEY is ${describeKey(
    key,
  )}; a release build requires a ${LIVE_KEY_PREFIX} key`;
}

/** Why E2E_VARIANT must not be set here, or null. Empty counts as set. */
function e2eVariantProblem(variant) {
  return variant === undefined
    ? null
    : 'E2E_VARIANT is set; it must be unset outside the e2e build types (check your shell and .env)';
}

/** The key's mode only: safe for CI logs. */
function describeKey(key) {
  if (!key) {
    return 'empty';
  }
  const match = /^(pk|sk|rk)_(live|test)_/.exec(key);
  return match ? `a ${match[0]} key` : 'not a Stripe publishable key';
}

/**
 * The string values of a binary plist's top-level dictionary (bplist00 format:
 * object table, offset table, 32-byte trailer). Non-string values are skipped.
 */
function readBinaryPlistTopLevelStrings(buf) {
  if (buf.length < 8 + 32) {
    throw new Error('binary plist is truncated');
  }
  const byte = (at) => {
    if (!Number.isInteger(at) || at < 8 || at >= buf.length - 32) {
      throw new Error(`binary plist reference out of range (${at})`);
    }
    return buf[at];
  };
  const trailer = buf.subarray(buf.length - 32);
  const offsetSize = trailer[6];
  const refSize = trailer[7];
  if (offsetSize < 1 || offsetSize > 8 || refSize < 1 || refSize > 8) {
    throw new Error('binary plist trailer is malformed');
  }
  const top = Number(trailer.readBigUInt64BE(16));
  const table = Number(trailer.readBigUInt64BE(24));
  const uint = (at, size) => {
    let value = 0;
    for (let i = 0; i < size; i++) {
      value = value * 256 + byte(at + i);
    }
    return value;
  };
  const offsetOf = (ref) => uint(table + ref * offsetSize, offsetSize);
  // An object's length: the marker's low nibble, or a following int object.
  const lengthAt = (at) => {
    const nibble = byte(at) & 0x0f;
    if (nibble !== 0x0f) {
      return [nibble, at + 1];
    }
    const size = 1 << (byte(at + 1) & 0x0f);
    return [uint(at + 2, size), at + 2 + size];
  };
  const string = (ref) => {
    const at = offsetOf(ref);
    const [length, start] = lengthAt(at);
    const type = byte(at) >> 4;
    if (type !== 0x5 && type !== 0x6) {
      return undefined;
    }
    const end = start + (type === 0x6 ? length * 2 : length);
    if (length > 0) {
      byte(end - 1);
    }
    return type === 0x5
      ? buf.subarray(start, end).toString('latin1')
      : Buffer.from(buf.subarray(start, end)).swap16().toString('utf16le');
  };
  const at = offsetOf(top);
  if (byte(at) >> 4 !== 0xd) {
    throw new Error('binary plist top-level object is not a dictionary');
  }
  const [count, start] = lengthAt(at);
  if (count > (buf.length - start) / (2 * refSize)) {
    throw new Error(`binary plist dictionary count ${count} exceeds the file`);
  }
  const result = {};
  for (let i = 0; i < count; i++) {
    const key = string(uint(start + i * refSize, refSize));
    const value = string(uint(start + (count + i) * refSize, refSize));
    if (key !== undefined && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/** Reads the Firebase project id from a native config file. */
function readFirebaseProjectId(file) {
  const raw = fs.readFileSync(file);
  if (file.endsWith('.json')) {
    return JSON.parse(raw.toString('utf8')).project_info?.project_id;
  }
  if (file.endsWith('.plist')) {
    // Xcode may copy a plist resource as binary. Parsed here rather than with
    // plutil, which the Linux CI runner does not have.
    if (raw.subarray(0, 8).toString('latin1') === 'bplist00') {
      return readBinaryPlistTopLevelStrings(raw).PROJECT_ID;
    }
    return /<key>PROJECT_ID<\/key>\s*<string>([^<]*)<\/string>/.exec(raw.toString('utf8'))?.[1];
  }
  if (file.endsWith('.xml')) {
    return /<string name="project_id"[^>]*>([^<]*)<\/string>/.exec(raw.toString('utf8'))?.[1];
  }
  throw new Error(`unrecognised config file type: ${file}`);
}

function main(argv) {
  const option = (name) => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const config = option('--config');
  const envStamp = option('--env-stamp');
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
  if (envStamp) {
    // A digest of every value the bundle will inline (scripts/bundled-env.js),
    // never a value: the Android release bundle task takes this file as an
    // input, so a changed key or URL re-runs the bundle instead of shipping a
    // stale one. Written only when the guard passes.
    writeBundledEnvStamp(envStamp);
  }
  console.log(
    `Release guard OK: Firebase project ${firebaseProjectId}, STRIPE_PUBLISHABLE_KEY is ${describeKey(
      stripePublishableKey,
    )}`,
  );
  return 0;
}

module.exports = {
  checkRelease,
  stripeKeyReleaseProblem,
  e2eVariantProblem,
  readFirebaseProjectId,
  readBinaryPlistTopLevelStrings,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
