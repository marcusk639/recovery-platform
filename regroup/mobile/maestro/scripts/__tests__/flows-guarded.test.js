/**
 * Every way into the Maestro suite must refuse production builds (launch
 * design §3.4, §4.3): every flow file under maestro/ passes lintFlow, and no
 * current doc or script tells anyone to run with a production app id.
 */
const fs = require('fs');
const path = require('path');
const { lintFlow } = require('../flow-lint');

const MOBILE = path.resolve(__dirname, '../../..');
const MAESTRO = path.join(MOBILE, 'maestro');

function walk(dir, keep, skipDirs) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return skipDirs.includes(e.name) ? [] : walk(p, keep, skipDirs);
    return keep(p) ? [p] : [];
  });
}

// Flow files: every *.yaml / *.yml under maestro/ except the workspace config.
// Subflows and the run-all aggregator are linted as subflows: they need the
// guard only if they launch the app themselves.
const flowFiles = walk(MAESTRO, (p) => /\.ya?ml$/.test(p) && path.basename(p) !== 'config.yaml', [
  'output',
  'node_modules',
  '__tests__',
]).map((p) => {
  const rel = path.relative(MOBILE, p);
  const subflow =
    rel.includes(`${path.sep}subflows${path.sep}`) || path.basename(p) === 'run-all.yaml';
  return [rel, p, subflow];
});

describe('Maestro flows', () => {
  it('finds the flows', () => {
    expect(flowFiles.length).toBeGreaterThan(15);
  });

  it.each(flowFiles)('%s keeps to the e2e build', (_rel, file, subflow) => {
    expect(lintFlow(fs.readFileSync(file, 'utf8'), { subflow })).toEqual([]);
  });

  it('the guard subflow exists', () => {
    expect(fs.existsSync(path.join(MAESTRO, 'subflows/guard-e2e-app.yaml'))).toBe(true);
  });
});

describe('run instructions', () => {
  // A production app id, bare or quoted, not followed by an e2e suffix.
  const PROD_APP_ID = /APP_ID=['"]?com\.(rats\.dev|regroup\.app)(?!\.e2e)/;
  // Dated reports and plans are historical records and stay as written.
  const SKIP = ['reports', 'plans', 'archive', '_archive', 'output', 'node_modules', '__tests__'];

  it('no current doc, flow or script runs Maestro with a production app id', () => {
    const files = [
      ...walk(MAESTRO, (p) => /\.(ya?ml|md|sh|js)$/.test(p), SKIP),
      ...walk(path.join(MOBILE, 'docs'), (p) => /\.md$/.test(p), SKIP),
      ...walk(
        path.join(MOBILE, 'scripts'),
        (p) => /\.(sh|js)$/.test(p) && !/\.test\.js$/.test(p),
        SKIP,
      ),
      path.join(MOBILE, 'package.json'),
    ];
    const offenders = files.filter((f) => PROD_APP_ID.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(MOBILE, f))).toEqual([]);
  });
});
