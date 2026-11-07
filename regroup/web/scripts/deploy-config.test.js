/**
 * Deploy-config invariants for the web package: build parity between staging
 * and production, a predeploy bundle check on every deploy target, and a value
 * for every functions param on every project (a non-interactive deploy refuses
 * a param with no dotenv value, whatever its default).
 *
 * Run: node --test scripts/deploy-config.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(WEB, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const withoutReplacements = ({ fileReplacements, ...rest }) => rest;

test('the e2e-staging builds match production apart from the environment file', () => {
  const arch = json('angular.json').projects.sapp.architect;
  for (const target of ['build', 'server']) {
    const c = arch[target].configurations;
    assert.deepStrictEqual(
      withoutReplacements(c['e2e-staging']),
      withoutReplacements(c.production),
      `${target}:e2e-staging differs from ${target}:production`,
    );
  }
});

test('the staging environment runs in production mode', () => {
  assert.match(read('src/environments/environment.e2e-staging.ts'), /production:\s*true/);
});

test('hosting and functions deploys both run the bundle check against the target project', () => {
  const fb = json('firebase.json');
  for (const [name, hooks] of [
    ['hosting', fb.hosting.predeploy],
    ['functions', fb.functions[0].predeploy],
  ]) {
    const cmd = (hooks || []).join('\n');
    assert.match(cmd, /verify-ssr-target\.js/, `${name} predeploy has no bundle check`);
    assert.match(cmd, /--expect "\$GCLOUD_PROJECT"/, `${name} check isn't tied to the target`);
    assert.match(cmd, /dist\/sapp\/browser/, `${name} check skips the hosting bundle`);
    assert.match(cmd, /functions\/dist\/sapp\/server/, `${name} check skips the deployed server bundle`);
  }
});

test('every functions param has a value for every deploy project', () => {
  const src = read('functions/src/index.ts');
  const params = [...src.matchAll(/define(?:Int|String|Boolean|Float)\("([A-Z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(params.length > 0);
  for (const project of ['phoenix-cleanhouse', 'regroup-e2e']) {
    const file = path.join(WEB, 'functions', `.env.${project}`);
    assert.ok(fs.existsSync(file), `missing functions/.env.${project}`);
    const keys = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.split('=')[0].trim());
    for (const p of params) assert.ok(keys.includes(p), `functions/.env.${project} has no ${p}`);
  }
});
