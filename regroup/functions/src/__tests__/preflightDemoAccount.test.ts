// The demo-account deploy gate (S5): functions and rules identify the demo
// account by its claim only, so a deploy before the claim is set would leave
// the public demo login unrestricted. regroup/scripts/preflight-demo-account.js
// refuses it, fail-closed.
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REGROUP_DIR = path.join(__dirname, '../../..');
const SCRIPT = path.join(REGROUP_DIR, 'scripts/preflight-demo-account.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkDemoAccount, PRODUCTION_PROJECT } = require(SCRIPT) as {
  checkDemoAccount: (o: object) => Promise<{ ok: boolean; reason: string }>;
  PRODUCTION_PROJECT: string;
};

const marked = {
  readConfig: async () => ({ uid: 'demo1' }),
  getUser: async () => ({ customClaims: { demo: true, admin: { h1: true } } }),
};
const check = (o: object) => checkDemoAccount({ projectId: PRODUCTION_PROJECT, ...marked, ...o });

describe('checkDemoAccount', () => {
  it('passes once the marked account carries the demo claim', async () => {
    await expect(check({})).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ['no target project', { projectId: '' }, /no target project/],
    ['no config/demoAccount', { readConfig: async () => undefined }, /never marked/],
    ['a config without a uid', { readConfig: async () => ({}) }, /never marked/],
    [
      'a failed config read',
      {
        readConfig: async () =>
          Promise.reject(Object.assign(new Error('x'), { code: 'permission-denied' })),
      },
      /could not read config.*permission-denied/,
    ],
    [
      'a missing account',
      {
        getUser: async () =>
          Promise.reject(Object.assign(new Error('x'), { code: 'auth/user-not-found' })),
      },
      /could not be read/,
    ],
    [
      'an account without the claim',
      { getUser: async () => ({ customClaims: { admin: {} } }) },
      /no demo claim/,
    ],
    [
      'a non-boolean claim',
      { getUser: async () => ({ customClaims: { demo: 'true' } }) },
      /no demo claim/,
    ],
  ])('blocks %s', async (_label, override, reason) => {
    const result = await check(override);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(reason);
  });

  it('never lets production skip the gate', async () => {
    const result = await check({
      skipProject: PRODUCTION_PROJECT,
      readConfig: async () => undefined,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it('lets another project skip only by naming itself exactly', async () => {
    const none = { readConfig: async () => undefined };
    await expect(
      check({ projectId: 'regroup-e2e', skipProject: 'regroup-e2e', ...none }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      check({ projectId: 'regroup-e2e', skipProject: 'regroup-e2', ...none }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('passes emulator-only demo- projects without reading anything', async () => {
    const readConfig = jest.fn();
    await expect(check({ projectId: 'demo-regroup-e2e', readConfig })).resolves.toMatchObject({
      ok: true,
    });
    expect(readConfig).not.toHaveBeenCalled();
  });
});

describe('preflight-demo-account.js', () => {
  it('exits 1 with the command to run when no project is given', () => {
    const env = { ...process.env };
    delete env.GCLOUD_PROJECT;
    const run = spawnSync('node', [SCRIPT], { env, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Deploy blocked/);
    expect(run.stderr).toMatch(/demo:mark-account/);
  });

  it('ignores emulator hosts left in the shell for a real project', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    expect(source).toMatch(/delete process\.env\.FIRESTORE_EMULATOR_HOST/);
    expect(source).toMatch(/delete process\.env\.FIREBASE_AUTH_EMULATOR_HOST/);
  });

  it('is a predeploy hook of the functions deploy and of both rules deploys', () => {
    const functionsConfig = JSON.parse(
      fs.readFileSync(path.join(REGROUP_DIR, 'firebase.json'), 'utf8'),
    );
    const rulesConfig = JSON.parse(
      fs.readFileSync(path.join(REGROUP_DIR, 'mobile/firebase/firebase.json'), 'utf8'),
    );
    // Resolve each hook as the CLI does ($PROJECT_DIR = the firebase.json's
    // folder): it must name this very script.
    const hooked = (hooks: string[] | undefined, projectDir: string) =>
      (hooks ?? []).some((h) => {
        const m = h.match(/^node "(.+)"$/);
        return !!m && path.resolve(m[1].replace('$PROJECT_DIR', projectDir)) === SCRIPT;
      });
    expect(hooked(functionsConfig.functions.predeploy, REGROUP_DIR)).toBe(true);
    const rulesDir = path.join(REGROUP_DIR, 'mobile/firebase');
    expect(hooked(rulesConfig.firestore.predeploy, rulesDir)).toBe(true);
    expect(hooked(rulesConfig.storage.predeploy, rulesDir)).toBe(true);
  });
});
