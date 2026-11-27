// The bootstrap initializes Firebase Admin when a script is imported. In staging
// mode it must point at regroup-e2e and never touch the production service key.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENV_KEYS = [
  'REGROUP_SCRIPT_TARGET',
  'FIRESTORE_EMULATOR_HOST',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

type AdminMock = {
  apps: unknown[];
  initializeApp: jest.Mock;
  credential: { applicationDefault: jest.Mock; cert: jest.Mock };
};

function makeAdmin(): AdminMock {
  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: { applicationDefault: jest.fn(() => 'adc'), cert: jest.fn(() => 'cert') },
  };
}

function loadBootstrap(
  env: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  admin: AdminMock = makeAdmin(),
): AdminMock {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  jest.isolateModules(() => {
    jest.doMock('firebase-admin', () => admin);
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    require('../../scripts/scriptBootstrap');
  });
  return admin;
}

function keyFile(contents: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
  const file = path.join(dir, 'key.json');
  fs.writeFileSync(file, JSON.stringify(contents));
  return file;
}

const saved: Partial<Record<string, string>> = {};
beforeAll(() => ENV_KEYS.forEach((k) => (saved[k] = process.env[k])));
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('scriptBootstrap in staging mode', () => {
  it('initializes regroup-e2e with the regroup-e2e key file, never the production key', () => {
    const file = keyFile({ type: 'service_account', project_id: 'regroup-e2e' });
    const admin = loadBootstrap({
      REGROUP_SCRIPT_TARGET: 'regroup-e2e',
      GOOGLE_APPLICATION_CREDENTIALS: file,
    });

    expect(admin.initializeApp).toHaveBeenCalledTimes(1);
    expect(admin.initializeApp).toHaveBeenCalledWith({
      credential: 'adc',
      projectId: 'regroup-e2e',
      databaseURL: 'https://regroup-e2e.firebaseio.com',
    });
    expect(admin.credential.cert).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('STAGING (regroup-e2e)'));
  });

  it('refuses a key file for another project and initializes nothing', () => {
    const file = keyFile({ type: 'service_account', project_id: 'phoenix-cleanhouse' });
    const admin = makeAdmin();
    expect(() =>
      loadBootstrap(
        { REGROUP_SCRIPT_TARGET: 'regroup-e2e', GOOGLE_APPLICATION_CREDENTIALS: file },
        admin,
      ),
    ).toThrow(/phoenix-cleanhouse/);
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });

  it('refuses an unreadable key file', () => {
    expect(() =>
      loadBootstrap({
        REGROUP_SCRIPT_TARGET: 'regroup-e2e',
        GOOGLE_APPLICATION_CREDENTIALS: path.join(os.tmpdir(), 'no-such-key-file.json'),
      }),
    ).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it('refuses any other REGROUP_SCRIPT_TARGET before initializing', () => {
    const admin = makeAdmin();
    expect(() => loadBootstrap({ REGROUP_SCRIPT_TARGET: 'phoenix-cleanhouse' }, admin)).toThrow(
      /REGROUP_SCRIPT_TARGET/,
    );
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });
});
