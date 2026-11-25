// What a `firebase deploy --only functions` from regroup/ uploads and refuses.
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REGROUP_DIR = path.resolve(__dirname, '../../..');

describe('regroup/firebase.json functions upload', () => {
  const functionsConfig = JSON.parse(
    fs.readFileSync(path.join(REGROUP_DIR, 'firebase.json'), 'utf8'),
  ).functions;
  const ignore: string[] =
    (Array.isArray(functionsConfig) ? functionsConfig[0] : functionsConfig).ignore ?? [];

  // Without an ignore list the CLI skips only node_modules and .git, so a deploy from a
  // worktree with functions/.secret.local (regroup/CLAUDE.md says to copy it in) uploads it.
  it.each(['*.local', 'service-key.json', 'node_modules', '.git'])(
    'never uploads %s',
    (pattern) => {
      expect(ignore).toContain(pattern);
    },
  );

  it('still uploads the per-project .env files the deploy reads', () => {
    expect(ignore.some((p) => /\.env/.test(p))).toBe(false);
  });
});

describe('preflight-billing with no deploy config', () => {
  // No functions/.env.<project> exists for this project id, so the deploy would ship no config.
  const run = (extraArgs: string[] = []) =>
    spawnSync('node', [path.join(REGROUP_DIR, 'scripts/preflight-billing.js'), ...extraArgs], {
      env: { ...process.env, GCLOUD_PROJECT: 'regroup-no-config-test', FIREBASE_PROJECT: '' },
      encoding: 'utf8',
      timeout: 30000,
    });

  it('refuses the deploy instead of warning, and says how to write the config', () => {
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/no deploy config/i);
    expect(r.stderr + r.stdout).toMatch(/run env:write -- --project phoenix-cleanhouse/);
  });
});

describe('scripts/deploy-batched.sh', () => {
  const scriptPath = path.join(REGROUP_DIR, 'scripts/deploy-batched.sh');
  // Comments dropped, as in deployList.test.ts: the header mentions the plain deploy.
  const script = fs.readFileSync(scriptPath, 'utf8').replace(/(^|\s)#.*$/gm, '$1');

  // Launch plan S4: it ran `firebase deploy` with no --project (so the
  // .firebaserc default, production) and no build (so whatever lib/ held).
  it('refuses to run without --project, before building or deploying anything', () => {
    // Stub firebase and npm first on PATH: each fails loudly if called, so
    // this test can never deploy or build, whatever the script does.
    const stubs = path.join(__dirname, 'fixtures/deploy-stubs');
    const r = spawnSync('bash', [scriptPath], {
      env: { ...process.env, PATH: `${stubs}:${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--project/);
    expect(r.stderr).not.toMatch(/must not be called/);
  });

  it('names the project on every deploy and builds before the first batch', () => {
    const deploys = script.match(/firebase deploy[^\n]*/g) ?? [];
    expect(deploys.length).toBeGreaterThan(0);
    for (const line of deploys) expect(line).toMatch(/--project "\$PROJECT"/);
    expect(script.indexOf('run build')).toBeGreaterThan(-1);
    expect(script.indexOf('run build')).toBeLessThan(script.indexOf('firebase deploy'));
  });
});
