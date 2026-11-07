/**
 * Tests for the e2e-staging config generator. Uses a temp config dir and a temp
 * output path, so nothing here reads ~/.config or writes into src/.
 *
 * Run: node --test scripts/gen-e2e-staging-config.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderConfig, generate } = require('./gen-e2e-staging-config');

const WEB_CONFIG = {
  apiKey: 'AIzaStagingKey',
  appId: '1:706803426891:web:abc',
  authDomain: 'regroup-e2e.firebaseapp.com',
  messagingSenderId: '706803426891',
  projectId: 'regroup-e2e',
  projectNumber: '706803426891',
  storageBucket: 'regroup-e2e.appspot.com',
  version: '2',
};

function configDir({ web = WEB_CONFIG, pk } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-cfg-'));
  if (web) fs.writeFileSync(path.join(dir, 'firebase-web-config.json'), JSON.stringify(web));
  if (pk !== undefined)
    fs.writeFileSync(path.join(dir, 'stripe-e2e-publishable-key.txt'), `${pk}\n`);
  return dir;
}

test('renderConfig keeps only the firebaseConfig fields and the key', () => {
  const out = renderConfig(WEB_CONFIG, 'pk_test_abc');
  assert.match(out, /export const e2eStaging = /);
  assert.match(out, /"projectId": "regroup-e2e"/);
  assert.match(out, /"stripePublishableKey": "pk_test_abc"/);
  assert.doesNotMatch(out, /projectNumber|"version"/);
});

test('generate writes the file from the config dir', () => {
  const dir = configDir({ pk: 'pk_test_abc' });
  const outFile = path.join(dir, 'out.ts');
  const r = generate({ configDir: dir, outFile });
  assert.strictEqual(r.placeholder, false);
  assert.match(fs.readFileSync(outFile, 'utf8'), /pk_test_abc/);
});

test('a missing key file yields a placeholder, reported as such', () => {
  const dir = configDir();
  const outFile = path.join(dir, 'out.ts');
  const r = generate({ configDir: dir, outFile });
  assert.strictEqual(r.placeholder, true);
  assert.match(fs.readFileSync(outFile, 'utf8'), /pk_test_PLACEHOLDER_NO_CHECKOUT/);
});

test('refuses a live key', () => {
  const dir = configDir({ pk: 'pk_live_abc' });
  assert.throws(() => generate({ configDir: dir, outFile: path.join(dir, 'o.ts') }), /pk_test_/);
});

test('refuses a web config for another project', () => {
  const dir = configDir({
    web: { ...WEB_CONFIG, projectId: 'phoenix-cleanhouse' },
    pk: 'pk_test_abc',
  });
  assert.throws(() => generate({ configDir: dir, outFile: path.join(dir, 'o.ts') }), /regroup-e2e/);
});

test('refuses when the web config is missing', () => {
  const dir = configDir({ web: null, pk: 'pk_test_abc' });
  assert.throws(
    () => generate({ configDir: dir, outFile: path.join(dir, 'o.ts') }),
    /firebase-web-config\.json/,
  );
});
