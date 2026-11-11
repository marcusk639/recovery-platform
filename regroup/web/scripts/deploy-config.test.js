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

// Splits a predeploy command into tokens; double quotes group, nothing else.
function tokens(cmd) {
  return [...cmd.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]));
}

test('hosting and functions deploys both run the bundle check on everything they ship', () => {
  const fb = json('firebase.json');
  const shipped = new Set([
    `$PROJECT_DIR/${fb.hosting.public}`,
    `$PROJECT_DIR/${fb.functions[0].source}/dist/sapp/browser`,
    `$PROJECT_DIR/${fb.functions[0].source}/dist/sapp/server`,
  ]);
  for (const [name, hooks] of [
    ['hosting', fb.hosting.predeploy],
    ['functions', fb.functions[0].predeploy],
  ]) {
    assert.strictEqual((hooks || []).length, 1, `${name} needs exactly one predeploy command`);
    const cmd = hooks[0];
    assert.doesNotMatch(cmd, /[;&|<>`]|\$\(/, `${name} predeploy must be a single plain command`);
    const t = tokens(cmd);
    assert.deepStrictEqual(t.slice(0, 2), ['node', '$PROJECT_DIR/scripts/verify-ssr-target.js']);
    const values = (flag) => t.flatMap((x, i) => (x === flag ? [t[i + 1]] : []));
    assert.deepStrictEqual(values('--expect'), ['$GCLOUD_PROJECT'], `${name} check isn't tied to the target`);
    assert.deepStrictEqual(new Set(values('--root')), shipped, `${name} check doesn't cover what ships`);
    const at = t.indexOf('--identical');
    assert.deepStrictEqual(t.slice(at + 1, at + 3), [
      `$PROJECT_DIR/${fb.hosting.public}/index.html`,
      `$PROJECT_DIR/${fb.functions[0].source}/dist/sapp/browser/index.html`,
    ]);
  }
});

test('every functions param has an integer value for every deploy project', () => {
  const src = read('functions/src/index.ts');
  const params = [...src.matchAll(/define(?:Int|String|Boolean|Float|List)\(\s*["'`]([A-Z0-9_]+)["'`]/g)].map(
    (m) => m[1],
  );
  assert.deepStrictEqual(params, ['SSR_MIN_INSTANCES']);
  const expected = { 'phoenix-cleanhouse': (n) => n >= 1, 'regroup-e2e': (n) => n === 0 };
  for (const [project, ok] of Object.entries(expected)) {
    const file = path.join(WEB, 'functions', `.env.${project}`);
    assert.ok(fs.existsSync(file), `missing functions/.env.${project}`);
    const vars = Object.fromEntries(
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#'))
        .map((l) => l.split('=').map((x) => x.trim())),
    );
    assert.match(vars.SSR_MIN_INSTANCES || '', /^\d+$/, `functions/.env.${project}: SSR_MIN_INSTANCES`);
    assert.ok(ok(Number(vars.SSR_MIN_INSTANCES)), `functions/.env.${project}: SSR_MIN_INSTANCES out of range`);
  }
});

test('every local script index.html loads is in the repo, not ignored', () => {
  const html = read('src/index.html');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
  assert.ok(srcs.length > 0);
  for (const s of srcs) {
    const rel = path.join('src', s);
    assert.ok(fs.existsSync(path.join(WEB, rel)), `${rel} is missing (index.html loads it)`);
    const ignored = require('child_process').spawnSync('git', ['check-ignore', '-q', rel], { cwd: WEB }).status === 0;
    assert.ok(!ignored, `${rel} is gitignored, so it never reaches a build`);
  }
});

test('the theme init skips the screenshot slider ScreenshotOneComponent already set up', () => {
  // Slick throws when initialised twice, and the throw aborts the rest of the
  // theme's document-ready handler (sliders, counterup, fancybox).
  const theme = read('src/assets/js/scripts.js');
  assert.match(theme, /\$\('\.app-screenshots'\)\.not\('\.slick-initialized'\)\.slick\(/);
  assert.match(read('src/app/components/screenshots/screenshot-one/screenshot-one.component.ts'), /\.slick\(/);
});
