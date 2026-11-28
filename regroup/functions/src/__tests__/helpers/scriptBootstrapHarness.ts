// Loads scriptBootstrap.ts in isolation with firebase-admin mocked. Each load
// controls everything the bootstrap reads (HOME, the credential variables,
// service-key.json), so results don't depend on the machine's gcloud login or
// production key.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENV_KEYS = [
  'REGROUP_SCRIPT_TARGET',
  'REGROUP_SCRIPTS_TARGET',
  'FIRESTORE_EMULATOR_HOST',
  'GCLOUD_PROJECT',
  'FIREBASE_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'google_application_credentials',
  'CLOUDSDK_CONFIG',
  'HOME',
  'USERPROFILE',
] as const;
export type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;

// The bootstrap requires '../../service-key.json' from src/scripts; this file
// is at the same depth, so the path names the same functions/service-key.json.
const SERVICE_KEY = '../../../service-key.json';
export type ServiceKey = 'absent' | 'present' | 'malformed';

export type AdminMock = {
  apps: unknown[];
  app: jest.Mock;
  initializeApp: jest.Mock;
  credential: { applicationDefault: jest.Mock; cert: jest.Mock };
};

export const STAGING_SA = {
  type: 'service_account',
  project_id: 'regroup-e2e',
  client_email: 'sa@regroup-e2e.iam.gserviceaccount.com',
};
export const PROD_SA = { type: 'service_account', project_id: 'phoenix-cleanhouse' };

/** An admin mock; with a project id, one app already initialized for it. */
export function makeAdmin(existingProjectId?: string): AdminMock {
  return {
    apps: existingProjectId ? [{}] : [],
    app: jest.fn(() => ({ options: { projectId: existingProjectId } })),
    initializeApp: jest.fn(),
    credential: { applicationDefault: jest.fn(() => 'adc'), cert: jest.fn(() => 'cert') },
  };
}

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
  tempDirs.push(dir);
  return dir;
}

export function keyFile(contents: object | string): string {
  const file = path.join(tempDir(), 'key.json');
  fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return file;
}

/** A HOME whose gcloud directory holds `adc` as application_default_credentials.json. */
export function homeWithGcloud(adc: object): string {
  const home = tempDir();
  fs.mkdirSync(path.join(home, '.config', 'gcloud'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.config', 'gcloud', 'application_default_credentials.json'),
    JSON.stringify(adc),
  );
  return home;
}

let serviceKeyRead = false;
export const serviceKeyWasRead = (): boolean => serviceKeyRead;

/** Imports the bootstrap with exactly `env` (HOME defaults to an empty dir). */
export function loadBootstrap(
  env: Env,
  opts: { admin?: AdminMock; serviceKey?: ServiceKey } = {},
): AdminMock {
  const admin = opts.admin ?? makeAdmin();
  const serviceKey = opts.serviceKey ?? 'absent';
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, { HOME: tempDir() }, env);
  serviceKeyRead = false;
  jest.isolateModules(() => {
    jest.doMock('firebase-admin', () => admin);
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    jest.doMock(
      SERVICE_KEY,
      () => {
        serviceKeyRead = true;
        if (serviceKey === 'absent') {
          throw Object.assign(new Error('Cannot find module'), { code: 'MODULE_NOT_FOUND' });
        }
        if (serviceKey === 'malformed') throw new SyntaxError('Unexpected token "private_ke"');
        return { 'phoenix-cleanhouse': { projectId: 'phoenix-cleanhouse' } };
      },
      { virtual: true },
    );
    require('../../scripts/scriptBootstrap');
  });
  return admin;
}

/** The load throws `pattern` and Firebase Admin is never initialized. */
export function expectRefused(env: Env, pattern: RegExp, serviceKey: ServiceKey = 'absent'): void {
  const admin = makeAdmin();
  expect(() => loadBootstrap(env, { admin, serviceKey })).toThrow(pattern);
  expect(admin.initializeApp).not.toHaveBeenCalled();
}

/** Restores the environment and console after each test, and removes temp dirs. */
export function useBootstrapHarness(): void {
  const saved: Partial<Record<string, string>> = {};
  beforeAll(() => ENV_KEYS.forEach((k) => (saved[k] = process.env[k])));
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  afterAll(() => tempDirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
}
