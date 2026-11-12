import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A required deferred module must behave like an imported one, or mobile code
// reading a property gets undefined and skips the visible failure.
test('a required deferred module fails visibly when used', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portal-bundle-')), 'out.mjs');
  execFileSync('node', ['tools/bundle.mjs', '--entry', 'tests/fixtures/require-deferred.js', '--outfile', out], { stdio: 'pipe' });
  const script = `import(${JSON.stringify(pathToFileURL(out).href)}).then(({ feature }) => {
    try { feature(); console.log('no error'); } catch (error) { console.log(error.message); }
  });`;
  const printed = execFileSync('node', ['-e', script], { encoding: 'utf8' });
  expect(printed).toMatch(/not available on the web yet: @stripe\/stripe-react-native/i);
}, 60_000);

const build = (...flags: string[]) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portal-bundle-')), 'out.mjs');
  execFileSync('node', ['tools/bundle.mjs', '--production', '--entry', 'src/app/main.tsx', '--outfile', out, ...flags], { stdio: 'pipe' });
  return fs.readFileSync(out, 'utf8');
};

test('a normal build has no test hooks, and no test crash screen', () => {
  const bundle = build();
  expect(bundle).not.toContain('__portalTest');
  expect(bundle).not.toContain('portal test crash');
}, 120_000);

test('an e2e build has them', () => {
  expect(build('--e2e')).toContain('__portalTest');
}, 120_000);

test('check-bundle fails if a non-e2e report comes with test hooks in the bundle', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-dist-'));
  fs.writeFileSync(path.join(dist, 'main.js'), 'window.__portalTest = {};');
  fs.writeFileSync(path.join(dist, 'metafile.json'), JSON.stringify({ inputs: {} }));
  fs.writeFileSync(path.join(dist, 'build-report.json'), JSON.stringify({ e2e: false }));
  const run = spawnSync('node', ['tools/check-bundle.mjs', '--warn-versions', '--dist', dist], { encoding: 'utf8' });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain('test hooks');
});
