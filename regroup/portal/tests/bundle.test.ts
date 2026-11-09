import { execFileSync } from 'node:child_process';
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
  expect(printed).toMatch(/not available on the web yet: react-native-html-to-pdf/i);
}, 60_000);
