import * as fs from 'fs';
import * as path from 'path';

export type EnvName = 'production' | 'e2e-emulator' | 'e2e-staging';

export type LaunchConfig = {
  shared: Record<string, string>;
  perEnv: Record<EnvName, Record<string, string>>;
  paywallEnabled: boolean;
};

const ENV_NAMES: EnvName[] = ['production', 'e2e-emulator', 'e2e-staging'];
const SECRET_PATTERN = /(^|[^A-Za-z0-9])(sk|rk)_(live|test)_|whsec_/;
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'launch-config.json');

// Generated file names -> the environment each one is rendered from.
const GENERATED_FILES: Record<string, EnvName> = {
  '.env.demo-regroup-e2e': 'e2e-emulator',
  '.env.regroup-e2e': 'e2e-staging',
};
const FORBIDDEN_FILES = ['.env', '.env.phoenix-cleanhouse'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSection(value: unknown, name: string): asserts value is Record<string, string> {
  if (!isPlainObject(value)) throw new Error(`launch config "${name}" must be an object`);
  for (const key of Object.keys(value)) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`launch config "${name}" has invalid key "${key}" (use UPPER_SNAKE_CASE)`);
    }
  }
}

export function loadLaunchConfig(configPath = DEFAULT_CONFIG_PATH): LaunchConfig {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read launch config ${configPath}: ${(err as Error).message}`);
  }
  const shared: unknown = raw.shared === undefined ? {} : raw.shared;
  assertSection(shared, 'shared');
  const perEnv: unknown = raw.perEnv;
  if (!isPlainObject(perEnv)) throw new Error('launch config "perEnv" must be an object');

  for (const name of Object.keys(perEnv)) {
    if (!(ENV_NAMES as string[]).includes(name)) {
      throw new Error(`launch config has unknown env "${name}" (expected ${ENV_NAMES.join(', ')})`);
    }
  }
  for (const env of ENV_NAMES) {
    if (!perEnv[env]) throw new Error(`launch config missing env "${env}"`);
    assertSection(perEnv[env], `perEnv.${env}`);
    // A per-env key would override shared without anyone noticing.
    for (const key of Object.keys(perEnv[env] as object)) {
      if (key in shared) {
        throw new Error(`launch config key "${key}" is in both shared and perEnv.${env}`);
      }
    }
  }
  const envs = perEnv as Record<EnvName, Record<string, string>>;

  const allKeys = new Set(ENV_NAMES.flatMap((e) => Object.keys(envs[e])));
  for (const env of ENV_NAMES) {
    for (const key of allKeys) {
      if (!(key in envs[env])) {
        throw new Error(`launch config env "${env}" is missing key "${key}"`);
      }
    }
  }

  if (typeof raw.paywall?.enabled !== 'boolean') {
    throw new Error('launch config paywall.enabled must be a boolean');
  }

  const values = [...Object.values(shared), ...ENV_NAMES.flatMap((e) => Object.values(envs[e]))];
  if (values.some((v) => typeof v !== 'string' || /[\r\n]/.test(v))) {
    throw new Error('launch config values must be single-line strings');
  }
  if (values.some((v) => SECRET_PATTERN.test(v))) {
    throw new Error('launch config must not contain secret values');
  }

  return { shared, perEnv: envs, paywallEnabled: raw.paywall.enabled };
}

export function functionsEnvFor(env: EnvName): Record<string, string> {
  const config = loadLaunchConfig();
  return { ...config.shared, ...config.perEnv[env] };
}

export function assertSafeEnvFileName(name: string): void {
  if (FORBIDDEN_FILES.includes(name)) {
    throw new Error(`refusing to write protected env file "${name}"`);
  }
}

export type EnvOverlays = Partial<Record<EnvName, Record<string, string>>>;

/** Same rules as launch-config values, plus: an overlay may only ADD keys. */
function assertOverlay(env: EnvName, base: Record<string, string>, overlay: Record<string, string>) {
  for (const [key, value] of Object.entries(overlay)) {
    if (!ENV_KEY_PATTERN.test(key)) throw new Error(`overlay for ${env} has invalid key "${key}"`);
    if (key in base) {
      throw new Error(`overlay key "${key}" would override launch-config.json for ${env}`);
    }
    if (typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error(`overlay value for "${key}" must be a single-line string`);
    }
    if (SECRET_PATTERN.test(value)) throw new Error(`overlay for ${env} must not contain secret values`);
  }
}

/**
 * Writes the generated env files. `overlays` adds machine-local, non-secret
 * values (e.g. the e2e Stripe sandbox price ids) to one environment's file.
 * Everything is validated before any file is written.
 */
export function writeFunctionsEnvFiles(functionsDir: string, overlays: EnvOverlays = {}): string[] {
  const rendered = Object.entries(GENERATED_FILES).map(([name, env]) => {
    assertSafeEnvFileName(name);
    const base = functionsEnvFor(env);
    const overlay = overlays[env] ?? {};
    assertOverlay(env, base, overlay);
    const body = Object.entries({ ...base, ...overlay })
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    return { file: path.join(functionsDir, name), body };
  });
  return rendered.map(({ file, body }) => {
    fs.writeFileSync(
      file,
      `# GENERATED by regroup/e2e (npm run e2e:gen-env) from launch-config.json. Do not edit.\n${body}\n`,
    );
    return file;
  });
}

/** KEY=VALUE lines; `#` comments and blank lines skipped; no quoting or expansion. */
export function parseEnvFragment(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '' || line.trimStart().startsWith('#')) return;
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq) : '';
    if (!ENV_KEY_PATTERN.test(key)) throw new Error(`env fragment line ${i + 1} is not KEY=VALUE`);
    if (key in out) throw new Error(`env fragment has duplicate key "${key}"`);
    out[key] = line.slice(eq + 1);
  });
  return out;
}

/** gen-env flags: `--staging-env <file>` merges a dotenv fragment into .env.regroup-e2e. */
export function overlaysFromArgv(argv: string[]): EnvOverlays {
  const i = argv.indexOf('--staging-env');
  if (i < 0) return {};
  const file = argv[i + 1];
  if (!file || file.startsWith('--')) throw new Error('--staging-env needs a value');
  return { 'e2e-staging': parseEnvFragment(fs.readFileSync(file, 'utf8')) };
}
