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
 *     [--key-stamp <file>]   on success, write the key's SHA-256 there
 *
 * Never prints the key; only its mode prefix.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
  if (
    !stripePublishableKey ||
    !stripePublishableKey.startsWith(LIVE_KEY_PREFIX) ||
    stripePublishableKey.length === LIVE_KEY_PREFIX.length
  ) {
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

/**
 * The string values of a binary plist's top-level dictionary (bplist00 format:
 * object table, offset table, 32-byte trailer). Non-string values are skipped.
 */
function readBinaryPlistTopLevelStrings(buf) {
  const trailer = buf.subarray(buf.length - 32);
  const offsetSize = trailer[6];
  const refSize = trailer[7];
  const top = Number(trailer.readBigUInt64BE(16));
  const table = Number(trailer.readBigUInt64BE(24));
  const uint = (at, size) => {
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + buf[at + i];
    return value;
  };
  const offsetOf = (ref) => uint(table + ref * offsetSize, offsetSize);
  // An object's length: the marker's low nibble, or a following int object.
  const lengthAt = (at) => {
    const nibble = buf[at] & 0x0f;
    if (nibble !== 0x0f) return [nibble, at + 1];
    const size = 1 << (buf[at + 1] & 0x0f);
    return [uint(at + 2, size), at + 2 + size];
  };
  const string = (ref) => {
    const at = offsetOf(ref);
    const [length, start] = lengthAt(at);
    switch (buf[at] >> 4) {
      case 0x5:
        return buf.subarray(start, start + length).toString('latin1');
      case 0x6:
        return Buffer.from(buf.subarray(start, start + length * 2)).swap16().toString('utf16le');
      default:
        return undefined;
    }
  };
  const at = offsetOf(top);
  if (buf[at] >> 4 !== 0xd) {
    throw new Error('binary plist top-level object is not a dictionary');
  }
  const [count, start] = lengthAt(at);
  const result = {};
  for (let i = 0; i < count; i++) {
    const key = string(uint(start + i * refSize, refSize));
    const value = string(uint(start + (count + i) * refSize, refSize));
    if (key !== undefined && value !== undefined) result[key] = value;
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
  const keyStamp = option('--key-stamp');
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
  if (keyStamp) {
    // A digest of the key the bundle will inline, never the key: the Android
    // release bundle task takes this file as an input, so a changed key
    // re-runs the bundle instead of shipping a stale one.
    fs.mkdirSync(path.dirname(keyStamp), { recursive: true });
    fs.writeFileSync(
      keyStamp,
      `${crypto.createHash('sha256').update(stripePublishableKey).digest('hex')}\n`,
    );
  }
  console.log(
    `Release guard OK: Firebase project ${firebaseProjectId}, STRIPE_PUBLISHABLE_KEY is ${describeKey(stripePublishableKey)}`,
  );
  return 0;
}

module.exports = { checkRelease, readFirebaseProjectId, readBinaryPlistTopLevelStrings };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
