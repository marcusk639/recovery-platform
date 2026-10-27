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
  let text: string;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown error';
    throw new Error(`cannot read launch config ${configPath} (${code})`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    // JSON.parse quotes the input, which could hold a pasted secret; name the file only.
    throw new Error(`launch config ${configPath} is not valid JSON`);
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

/** The Stripe API version every environment pins (shared.STRIPE_API_VERSION). */
export function pinnedStripeApiVersion(): string {
  const version = loadLaunchConfig().shared.STRIPE_API_VERSION;
  if (!version) throw new Error('launch config shared.STRIPE_API_VERSION is not set');
  return version;
}

export function assertSafeEnvFileName(name: string): void {
  if (FORBIDDEN_FILES.includes(name)) {
    throw new Error(`refusing to write protected env file "${name}"`);
  }
}

/** Values that do not live in launch-config.json, such as the e2e sandbox price ids. */
export type EnvExtras = Partial<Record<EnvName, Record<string, string>>>;

function withExtras(env: EnvName, extras: Record<string, string>): Record<string, string> {
  const base = functionsEnvFor(env);
  for (const [key, value] of Object.entries(extras)) {
    if (!ENV_KEY_PATTERN.test(key)) throw new Error(`env extra has invalid key "${key}"`);
    if (key in base) throw new Error(`env extra "${key}" would override launch-config.json`);
    if (typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error(`env extra "${key}" must be a single-line string`);
    }
    if (SECRET_PATTERN.test(value)) throw new Error(`env extra "${key}" looks like a secret`);
  }
  return { ...base, ...extras };
}

export type RenderedEnvFile = { file: string; content: string };

/**
 * The generated env files (all, or only those for `only`) exactly as
 * writeFunctionsEnvFiles writes them, without writing; preflight compares against it.
 */
export function renderFunctionsEnvFiles(
  functionsDir: string,
  extras: EnvExtras = {},
  only?: readonly EnvName[],
): RenderedEnvFile[] {
  const targets = Object.entries(GENERATED_FILES).filter(([, env]) => !only || only.includes(env));
  return targets.map(([name, env]) => {
    assertSafeEnvFileName(name);
    const body = Object.entries(withExtras(env, extras[env] ?? {}))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    return {
      file: path.join(functionsDir, name),
      content: `# GENERATED by regroup/e2e (npm run e2e:gen-env) from launch-config.json (+ e2e sandbox prices for staging). Do not edit.\n${body}\n`,
    };
  });
}

/** Writes the generated env files (all, or only those for `only`); returns their paths. */
export function writeFunctionsEnvFiles(
  functionsDir: string,
  extras: EnvExtras = {},
  only?: readonly EnvName[],
): string[] {
  // Build and check every file before writing any, so a bad extra leaves nothing half-written.
  const files = renderFunctionsEnvFiles(functionsDir, extras, only);
  for (const { file, content } of files) fs.writeFileSync(file, content);
  return files.map(({ file }) => file);
}
