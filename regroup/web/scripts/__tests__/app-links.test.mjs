/**
 * Run: node --test scripts/__tests__/app-links.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generate, loadSource, NEVER_CLAIMED, WELL_KNOWN } from '../generate-app-links.mjs';
import { check } from '../check-app-links.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GEN = path.resolve(HERE, '../generate-app-links.mjs');
const firebase = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../firebase.json'), 'utf8'));
const FP = 'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C';

test('regroup-e2e AASA lists exactly the staging app id and the three allowlisted paths', () => {
  const aasa = generate('regroup-e2e')['apple-app-site-association.json'];
  assert.strictEqual(aasa.applinks.details.length, 1);
  const [d] = aasa.applinks.details;
  assert.deepStrictEqual(d.appIDs, ['D8K3FS4HAX.com.rats.dev.e2e.stg']);
  assert.deepStrictEqual(d.components, [{ '/': '/invite' }, { '/': '/app/*' }, { '/': '/checkout-return' }]);
  assert.strictEqual(aasa.webcredentials, undefined);
});

test('production AASA names the production bundle only', () => {
  const src = loadSource();
  const withFp = structuredClone(src);
  withFp.environments['phoenix-cleanhouse'].android[0].sha256 = [FP];
  const aasa = generate('phoenix-cleanhouse', withFp)['apple-app-site-association.json'];
  assert.deepStrictEqual(aasa.applinks.details[0].appIDs, ['D8K3FS4HAX.com.rats.dev']);
});

test('neither file claims /, /pricing, /signup, /my-account, /login or *', () => {
  const src = loadSource();
  src.environments['phoenix-cleanhouse'].android[0].sha256 = [FP];
  for (const project of ['regroup-e2e', 'phoenix-cleanhouse']) {
    const files = generate(project, src);
    const claimed = files['apple-app-site-association.json'].applinks.details.flatMap((d) =>
      d.components.map((c) => c['/']),
    );
    for (const bad of ['/', '/pricing', '/signup', '/my-account', '/login', '*']) {
      assert.ok(!claimed.includes(bad), `${project} claims ${bad}`);
    }
    assert.ok(!JSON.stringify(files['assetlinks.json']).includes('"/'), 'assetlinks has no paths');
  }
  assert.ok(NEVER_CLAIMED.includes('*'));
});

test('a source that claims a forbidden path is refused', () => {
  for (const bad of ['/', '*', '/login', '/pricing', '/signup', '/my-account']) {
    const src = loadSource();
    src.paths = [...src.paths, bad];
    assert.throws(() => generate('regroup-e2e', src), /never be claimed/, bad);
  }
});

test('assetlinks for regroup-e2e names the staging package with its fingerprint', () => {
  assert.deepStrictEqual(generate('regroup-e2e')['assetlinks.json'], [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.regroup.app.e2e.stg',
        sha256_cert_fingerprints: [FP],
      },
    },
  ]);
});

test('an unknown project is refused', () => {
  assert.throws(() => generate('nope'), /unknown project/);
});

test('phoenix-cleanhouse with the placeholder fingerprint fails (library and CLI)', () => {
  assert.throws(() => generate('phoenix-cleanhouse'), /SHA-256/);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'app-links-'));
  const r = spawnSync(process.execPath, [GEN, '--project', 'phoenix-cleanhouse', '--out', out], { encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0);
  assert.deepStrictEqual(fs.readdirSync(out), [], 'nothing written');
});

test('the CLI writes both files for regroup-e2e', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'app-links-'));
  const r = spawnSync(process.execPath, [GEN, '--project', 'regroup-e2e', '--out', out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const expected = generate('regroup-e2e');
  for (const [name, body] of Object.entries(expected)) {
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(out, name), 'utf8')), body);
  }
});

test('a missing --project or --out is a usage error', () => {
  assert.strictEqual(spawnSync(process.execPath, [GEN], { encoding: 'utf8' }).status, 2);
});

// ---- firebase.json ----
const rewrites = firebase.hosting.rewrites;
const idx = (source) => rewrites.findIndex((r) => r.source === source);

test('firebase.json rewrites the well-known paths to the generated files', () => {
  const dest = (s) => rewrites[idx(s)] && rewrites[idx(s)].destination;
  assert.strictEqual(dest('/.well-known/apple-app-site-association'), '/app-links/apple-app-site-association.json');
  assert.strictEqual(dest('/apple-app-site-association'), '/app-links/apple-app-site-association.json');
  assert.strictEqual(dest('/.well-known/assetlinks.json'), '/app-links/assetlinks.json');
});

test('all three rewrites come before the ** -> ssr rewrite', () => {
  const catchAll = idx('**');
  assert.strictEqual(rewrites[catchAll].function.functionId, 'ssr');
  for (const s of ['/.well-known/apple-app-site-association', '/apple-app-site-association', '/.well-known/assetlinks.json']) {
    assert.ok(idx(s) >= 0 && idx(s) < catchAll, s);
  }
});

test('firebase.json serves /app-links/** as application/json', () => {
  const h = firebase.hosting.headers.find((x) => x.source === '/app-links/**');
  assert.ok(h, 'headers entry for /app-links/**');
  const ct = h.headers.find((x) => x.key.toLowerCase() === 'content-type');
  assert.strictEqual(ct.value, 'application/json');
});

test('hosting ignores dotfiles but not .well-known, whose real files beat the platform defaults', async () => {
  const { default: mm } = await import('minimatch');
  const ignored = (p) => firebase.hosting.ignore.some((g) => mm(p, g, { dot: true }));
  assert.ok(!ignored('.well-known/assetlinks.json'));
  assert.ok(!ignored('.well-known'));
  assert.ok(ignored('.env') && ignored('.gitignore') && ignored('a/.DS_Store'));
});

test('every exact well-known path is served as application/json', () => {
  for (const p of ['/.well-known/apple-app-site-association', '/apple-app-site-association', '/.well-known/assetlinks.json']) {
    const h = firebase.hosting.headers.find((x) => x.source === p);
    assert.ok(h, p);
    assert.strictEqual(h.headers.find((x) => x.key.toLowerCase() === 'content-type').value, 'application/json');
  }
});

test('--root writes real files at the three exact well-known paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-links-root-'));
  const r = spawnSync(process.execPath, [GEN, '--project', 'regroup-e2e', '--out', path.join(root, 'app-links'), '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const expected = generate('regroup-e2e');
  for (const [rel, name] of Object.entries(WELL_KNOWN)) {
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')), expected[name], rel);
  }
});

test('package.json build scripts run the generator for the matching project', () => {
  const s = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../package.json'), 'utf8')).scripts;
  assert.match(s['build:ssr'], /generate-app-links\.mjs --project phoenix-cleanhouse --out dist\/sapp\/browser\/app-links/);
  assert.match(s['build:ssr:e2e-staging'], /generate-app-links\.mjs --project regroup-e2e --out dist\/sapp\/browser\/app-links/);
  assert.match(s['test:scripts'], /app-links\.test\.mjs/);
});

// ---- checker ----
function fakeFetch(map) {
  return async (url) => {
    const r = map[new URL(url).pathname];
    if (!r) return new Response('nf', { status: 404 });
    return new Response(r.body, { status: r.status || 200, headers: r.headers || { 'content-type': 'application/json' } });
  };
}
const good = () => {
  const f = generate('regroup-e2e');
  const aasa = JSON.stringify(f['apple-app-site-association.json']);
  return {
    '/.well-known/apple-app-site-association': { body: aasa },
    '/apple-app-site-association': { body: aasa },
    '/.well-known/assetlinks.json': { body: JSON.stringify(f['assetlinks.json']) },
  };
};

test('checker passes when all three URLs serve the generated content as JSON', async () => {
  const res = await check('https://x.test', 'regroup-e2e', fakeFetch(good()));
  assert.strictEqual(res.length, 3);
  assert.ok(res.every((r) => r.ok), JSON.stringify(res));
});

test('checker fails on redirect, wrong content type, 404 and content drift', async () => {
  const m = good();
  m['/apple-app-site-association'] = { status: 301, body: '', headers: { location: '/x' } };
  m['/.well-known/assetlinks.json'] = { body: m['/.well-known/assetlinks.json'].body, headers: { 'content-type': 'text/html' } };
  delete m['/.well-known/apple-app-site-association'];
  let res = await check('https://x.test', 'regroup-e2e', fakeFetch(m));
  assert.deepStrictEqual(res.map((r) => r.ok), [false, false, false]);
  const drift = good();
  drift['/.well-known/assetlinks.json'] = { body: '[]' };
  res = await check('https://x.test', 'regroup-e2e', fakeFetch(drift));
  assert.deepStrictEqual(res.map((r) => r.ok), [true, true, false]);
  assert.match(res[2].problems.join(), /differs/);
});

test('checker reports a network failure instead of throwing', async () => {
  const res = await check('https://x.test', 'regroup-e2e', async () => { throw new Error('boom'); });
  assert.ok(res.every((r) => !r.ok && /boom/.test(r.problems[0])));
});
