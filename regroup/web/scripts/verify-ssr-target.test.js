/**
 * Tests for the bundle check. Fixture trees live in a temp dir and the config
 * readers are stubs, so nothing here reads the real build output, the
 * generated config or the environment files.
 *
 * Run: node --test scripts/verify-ssr-target.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkTree, identifiersFor, verify, parseArgs } = require('./verify-ssr-target');

const STAGING_GEN =
  'export const e2eStaging = {"stripePublishableKey":"pk_test_staging","firebaseConfig":{"apiKey":"AIzaStagingKey","projectId":"regroup-e2e"}};';
const PROD_ENV = 'export const environment = { stripePublishableKey: "pk_live_prodKey", firebaseConfig: {} };';
const readers = { readGenerated: () => STAGING_GEN, readProd: () => PROD_ENV };

// What each build actually carries. A staging build has production's whole
// environment too, because e2e-staging-guard.ts imports environment.prod.ts.
const STAGING_JS = "projectId:'regroup-e2e',apiKey:'AIzaStagingKey',deny:'phoenix-cleanhouse',k:'pk_live_prodKey'";
const PROD_JS = "projectId:'phoenix-cleanhouse',k:'pk_live_prodKey'";
const DEV_JS = "projectId:'phoenix-cleanhouse',k:'pk_test_devKey'";
const EMULATOR_JS = "projectId:'demo-regroup-e2e'";

function tree(files, label = 'root') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ssr-target-${label}-`));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}
const run = (project, roots, extra = {}) => verify({ project, roots, readers, ...extra });

test('checkTree: every expected identifier must appear under each root', () => {
  const browser = tree({ 'main.js': 'regroup-e2e', 'lazy/3.js': 'AIzaStagingKey' });
  const server = tree({ 'main.js': "projectId:'phoenix-cleanhouse'" }, 'server');
  const r = checkTree([browser, server], { expect: ['regroup-e2e', 'AIzaStagingKey'] });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems.join('\n'), /server.*doesn't contain regroup-e2e/s);
});

test('checkTree: an empty, missing or non-directory root fails without throwing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-target-empty-'));
  const file = path.join(empty, 'a-file.js');
  fs.writeFileSync(file, 'x');
  const r = checkTree([path.join(empty, 'nope'), file], { expect: ['x'] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.length, 2);
});

test('checkTree: a forbidden identifier fails, naming the file, including in lazy chunks', () => {
  const root = tree({ 'main.js': 'phoenix-cleanhouse', 'lazy/7.js': "projectId:'regroup-e2e'" });
  const r = checkTree([root], { expect: ['phoenix-cleanhouse'], forbid: ['regroup-e2e'] });
  assert.match(r.problems.join('\n'), /lazy\/7\.js.*contains regroup-e2e/);
});

test('checkTree: symlinked directories are scanned', () => {
  const target = tree({ 'chunk.js': 'regroup-e2e' });
  const root = tree({ 'main.js': 'phoenix-cleanhouse' });
  fs.symlinkSync(target, path.join(root, 'linked'));
  const r = checkTree([root], { expect: ['phoenix-cleanhouse'], forbid: ['regroup-e2e'] });
  assert.strictEqual(r.ok, false);
});

test('verify: a staging build is accepted for regroup-e2e', () => {
  assert.deepStrictEqual(run('regroup-e2e', [tree({ 'main.js': STAGING_JS })]), { ok: true, problems: [] });
});

test('verify: a staging build is refused for production, though it carries production identifiers', () => {
  const r = run('phoenix-cleanhouse', [tree({ 'main.js': STAGING_JS })]);
  assert.strictEqual(r.ok, false);
  assert.match(r.problems.join('\n'), /contains the staging project id/);
});

test('verify: a production build is accepted for production and refused for staging', () => {
  assert.strictEqual(run('phoenix-cleanhouse', [tree({ 'main.js': PROD_JS })]).ok, true);
  assert.strictEqual(run('regroup-e2e', [tree({ 'main.js': PROD_JS })]).ok, false);
});

test('verify: a dev-mode build (environment.ts) is refused for production', () => {
  const r = run('phoenix-cleanhouse', [tree({ 'main.js': DEV_JS })]);
  assert.match(r.problems.join('\n'), /doesn't contain the production Stripe key/);
});

test('verify: an e2e-emulator build is refused for staging', () => {
  assert.strictEqual(run('regroup-e2e', [tree({ 'main.js': EMULATOR_JS })]).ok, false);
});

test('verify: a staging build with the placeholder Stripe key is refused', () => {
  const r = run('regroup-e2e', [tree({ 'main.js': `${STAGING_JS},s:'pk_test_PLACEHOLDER_NO_CHECKOUT'` })]);
  assert.match(r.problems.join('\n'), /placeholder Stripe key/);
});

test('verify: problems name identifiers without printing key values', () => {
  const r = run('regroup-e2e', [tree({ 'main.js': 'regroup-e2e' })]);
  assert.match(r.problems.join('\n'), /staging web API key/);
  assert.doesNotMatch(r.problems.join('\n'), /AIzaStagingKey/);
});

test('verify: the SSR template must match the hosted index.html', () => {
  const a = tree({ 'index.html': '<script src="main.aaa.js">' });
  const b = tree({ 'index.html': '<script src="main.bbb.js">' });
  const roots = [tree({ 'main.js': STAGING_JS })];
  const pair = (x, y) => [path.join(x, 'index.html'), path.join(y, 'index.html')];
  assert.match(run('regroup-e2e', roots, { identical: pair(a, b) }).problems.join('\n'), /differs/);
  assert.strictEqual(run('regroup-e2e', roots, { identical: pair(a, a) }).ok, true);
});

test('verify: a config it cannot read becomes a problem, not a pass', () => {
  const noKey = 'export const e2eStaging = {"firebaseConfig":{"projectId":"regroup-e2e"}};';
  const r = verify({ project: 'regroup-e2e', roots: [tree({ 'main.js': STAGING_JS })], readers: { ...readers, readGenerated: () => noKey } });
  assert.match(r.problems.join('\n'), /no apiKey/);
  const other = 'export const e2eStaging = {"firebaseConfig":{"apiKey":"AIzaX","projectId":"someone-else"}};';
  assert.throws(() => identifiersFor('regroup-e2e', { ...readers, readGenerated: () => other }), /someone-else/);
});

test('identifiersFor: production never reads the generated config, other projects read nothing', () => {
  const boom = () => {
    throw new Error('must not be read');
  };
  assert.doesNotThrow(() => identifiersFor('phoenix-cleanhouse', { readGenerated: boom, readProd: () => PROD_ENV }));
  assert.doesNotThrow(() => identifiersFor('some-other-project', { readGenerated: boom, readProd: boom }));
});

test('parseArgs: refuses an empty or missing value, an unknown flag, and a half --identical pair', () => {
  assert.throws(() => parseArgs(['--expect', 'regroup-e2e', '--root', '']), /--root/);
  assert.throws(() => parseArgs(['--expect', 'regroup-e2e', '--root']), /--root/);
  assert.throws(() => parseArgs(['--expect']), /--expect/);
  assert.throws(() => parseArgs(['--expect', 'x', '--roots', 'a']), /unknown/);
  assert.throws(() => parseArgs(['--expect', 'x', '--identical', 'a']), /--identical/);
  assert.deepStrictEqual(parseArgs(['--expect', 'x', '--root', 'a', '--identical', 'b', 'c']), {
    expect: 'x',
    roots: [path.resolve('a')],
    identical: [path.resolve('b'), path.resolve('c')],
  });
});
