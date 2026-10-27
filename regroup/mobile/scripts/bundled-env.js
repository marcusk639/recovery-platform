#!/usr/bin/env node
/**
 * The environment values babel.config.js inlines into the JS bundle, and a
 * digest of them for the Android bundle tasks. Side-effect free when required:
 * babel.config.js, scripts/check-release-env.js and scripts/release-guard.js
 * all use it, and babel.config.js loads .env itself.
 *
 * Why the digest: the React Native Gradle plugin's bundle task tracks only JS
 * sources, so a value changed in the shell or in .env leaves it UP-TO-DATE with
 * the old value inlined. Each bundle task takes this stamp as an input file:
 *
 *   node scripts/bundled-env.js --stamp <file>
 *
 * The stamp holds a SHA-256, never a value.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Every name here is substituted with a string literal while the bundle is
// built; see babel.config.js for what may and may not be added.
const BUNDLED_ENV = [
  'STRIPE_PUBLISHABLE_KEY',
  'RATS_WEB_URL',
  'GOOGLE_MAPS_API_KEY',
  'E2E_VARIANT',
  'E2E_BUNDLE_MARKER',
];

// Left out of the stamp: E2E_VARIANT is set per variant by the bundle task's
// own command line (already a task input), and E2E_BUNDLE_MARKER derives from it.
const STAMPED_ENV = BUNDLED_ENV.filter(
  (name) => name !== 'E2E_VARIANT' && name !== 'E2E_BUNDLE_MARKER',
).sort();

const has = (object, name) => Object.prototype.hasOwnProperty.call(object, name);

/**
 * The stamped values as babel.config.js resolves them: an exported value (even
 * an empty one) first, then .env in `cwd` as dotenv reads it. Unset is null, so
 * unset and empty differ.
 */
function resolveBundledEnv({ env = process.env, cwd = process.cwd() } = {}) {
  let fromFile = {};
  const file = path.join(cwd, '.env');
  if (fs.existsSync(file)) {
    try {
      fromFile = require('dotenv').parse(fs.readFileSync(file));
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
      // dotenv is a devDependency; babel.config.js cannot read .env without it either.
    }
  }
  const values = {};
  for (const name of STAMPED_ENV) {
    if (has(env, name)) {
      values[name] = env[name];
    } else if (has(fromFile, name)) {
      values[name] = fromFile[name];
    } else {
      values[name] = null;
    }
  }
  return values;
}

/** SHA-256 hex of the values as JSON with sorted keys. */
function bundledEnvDigest(values) {
  const sorted = {};
  for (const name of Object.keys(values).sort()) {
    sorted[name] = values[name];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/** Writes the digest of the currently resolved bundled env to `file`. */
function writeBundledEnvStamp(file, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${bundledEnvDigest(resolveBundledEnv(options))}\n`);
}

module.exports = {
  BUNDLED_ENV,
  STAMPED_ENV,
  resolveBundledEnv,
  bundledEnvDigest,
  writeBundledEnvStamp,
};

if (require.main === module) {
  const index = process.argv.indexOf('--stamp');
  const file = index === -1 ? undefined : process.argv[index + 1];
  if (!file) {
    console.error('usage: bundled-env.js --stamp <file>');
    process.exit(1);
  }
  writeBundledEnvStamp(file);
  console.log(`Bundled env stamp written: ${file}`);
}
