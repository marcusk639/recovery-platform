import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateEnvFiles } from '../genEnv';
import { loadLaunchConfig, writeFunctionsEnvFiles } from '../launchConfig';
import { PRICE_ENV_VARS } from '../stripeSandbox';

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const writePrices = (dir: string) => {
  const file = path.join(dir, 'stripe-e2e-prices.json');
  fs.writeFileSync(
    file,
    JSON.stringify(Object.fromEntries(PRICE_ENV_VARS.map((n, i) => [n, `price_test${i}`]))),
  );
  return file;
};

describe('generateEnvFiles', () => {
  it('writes both files, with the sandbox prices in staging only', () => {
    const functionsDir = tmp('gen-env-');
    const result = generateEnvFiles(functionsDir, writePrices(tmp('prices-')));
    expect(result.stagingError).toBeUndefined();
    expect(result.written.map((f) => path.basename(f)).sort()).toEqual([
      '.env.demo-regroup-e2e',
      '.env.regroup-e2e',
    ]);
    const staging = fs.readFileSync(path.join(functionsDir, '.env.regroup-e2e'), 'utf8');
    expect(staging).toMatch(/^STRIPE_PRICE_TRAD_STARTER=price_test0$/m);
    const emulator = fs.readFileSync(path.join(functionsDir, '.env.demo-regroup-e2e'), 'utf8');
    expect(emulator).not.toMatch(/STRIPE_PRICE_/);
  });

  it('still writes the emulator file when the prices file is missing, and reports staging as not written', () => {
    const functionsDir = tmp('gen-env-');
    const missing = path.join(tmp('prices-'), 'stripe-e2e-prices.json');
    const result = generateEnvFiles(functionsDir, missing);
    expect(result.written.map((f) => path.basename(f))).toEqual(['.env.demo-regroup-e2e']);
    expect(fs.existsSync(path.join(functionsDir, '.env.regroup-e2e'))).toBe(false);
    expect(result.stagingError).toMatch(/stripe-sandbox-setup/);
  });

  it('leaves an existing staging file untouched when the prices file is bad', () => {
    const functionsDir = tmp('gen-env-');
    const stagingFile = path.join(functionsDir, '.env.regroup-e2e');
    fs.writeFileSync(stagingFile, 'KEEP=1\n');
    const bad = path.join(tmp('prices-'), 'stripe-e2e-prices.json');
    fs.writeFileSync(bad, '{"STRIPE_PRICE_TRAD_STARTER": "price_x"}');
    const result = generateEnvFiles(functionsDir, bad);
    expect(result.stagingError).toMatch(/missing/);
    expect(fs.readFileSync(stagingFile, 'utf8')).toBe('KEEP=1\n');
  });
});

describe('writeFunctionsEnvFiles only', () => {
  it('writes just the requested envs', () => {
    const dir = tmp('gen-env-');
    const written = writeFunctionsEnvFiles(dir, {}, ['e2e-emulator']);
    expect(written.map((f) => path.basename(f))).toEqual(['.env.demo-regroup-e2e']);
    expect(fs.readdirSync(dir)).toEqual(['.env.demo-regroup-e2e']);
  });
});

describe('loadLaunchConfig errors', () => {
  it('names the file but never quotes its content when the JSON is broken', () => {
    const file = path.join(tmp('launch-config-'), 'launch-config.json');
    fs.writeFileSync(file, '{"shared": whsec_leakme}');
    let message = '';
    try {
      loadLaunchConfig(file);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(file);
    expect(message).toMatch(/not valid JSON/);
    expect(message).not.toMatch(/whsec_|leakme/);
  });

  it('reports an unreadable file by error code', () => {
    const dir = tmp('launch-config-');
    expect(() => loadLaunchConfig(dir)).toThrow(/cannot read launch config .*\(EISDIR\)/);
  });
});
