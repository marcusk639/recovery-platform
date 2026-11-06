/**
 * Every way into the Maestro suite must refuse production builds (launch
 * design §3.4, §4.3): each flow starts with the guard subflow, and no current
 * doc or script tells anyone to run with a production app id.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.resolve(__dirname, '../../..');
const FLOWS = path.join(MOBILE, 'maestro/flows');
const GUARD = 'guard-e2e-app.yaml';

// Lines after the `---` document separator that start a command item.
function firstCommand(file) {
  const text = fs.readFileSync(file, 'utf8');
  const body = text.slice(text.indexOf('\n---') + 4);
  return body.split('\n').find((l) => /^- /.test(l));
}

function guardedFiles() {
  const flows = fs
    .readdirSync(FLOWS)
    .filter((f) => f.endsWith('.yaml') && f !== 'run-all.yaml')
    .map((f) => path.join(FLOWS, f));
  return [...flows, path.join(MOBILE, 'maestro/subflows/login.yaml')];
}

describe('Maestro flows', () => {
  it.each(guardedFiles().map((f) => [path.relative(MOBILE, f), f]))(
    '%s starts with the e2e guard subflow',
    (_name, file) => {
      const first = firstCommand(file) || '';
      expect(first).toMatch(
        new RegExp(`^- runFlow: (\\.\\./subflows/)?${GUARD.replace('.', '\\.')}$`),
      );
    },
  );

  it('the guard subflow exists', () => {
    expect(fs.existsSync(path.join(MOBILE, 'maestro/subflows', GUARD))).toBe(true);
  });
});

describe('run instructions', () => {
  const PROD_APP_ID = /APP_ID=com\.(rats\.dev|regroup\.app)(\s|$|")/m;

  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Dated reports are historical records and stay as written.
        return e.name === 'reports' || e.name === 'output' ? [] : walk(p);
      }
      return /\.(ya?ml|md|sh|js)$/.test(e.name) && !p.includes('__tests__') ? [p] : [];
    });
  }

  it('no current doc, flow or script runs Maestro with a production app id', () => {
    const files = [
      ...walk(path.join(MOBILE, 'maestro')),
      ...walk(path.join(MOBILE, 'docs/e2e')),
      path.join(MOBILE, 'package.json'),
    ];
    const offenders = files.filter((f) => PROD_APP_ID.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(MOBILE, f))).toEqual([]);
  });
});
