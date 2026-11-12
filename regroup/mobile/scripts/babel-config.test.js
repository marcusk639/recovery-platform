const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CONFIG = path.join(__dirname, '..', 'babel.config.js');

/**
 * Loads babel.config.js as a bundle build does (NODE_ENV not 'test'), from a
 * directory holding the given .env, and prints the marker it computed.
 */
function load({ dotenv, env = {} }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-config-'));
  if (dotenv !== undefined) {
    fs.writeFileSync(path.join(cwd, '.env'), dotenv);
  }
  const base = { ...process.env, NODE_ENV: 'production' };
  delete base.E2E_VARIANT;
  delete base.E2E_BUNDLE_MARKER;
  delete base.STRIPE_PUBLISHABLE_KEY;
  const result = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(CONFIG)}); console.log(process.env.E2E_BUNDLE_MARKER)`],
    { cwd, env: { ...base, ...env }, encoding: 'utf8' },
  );
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

describe('babel.config.js E2E_VARIANT handling', () => {
  it('marks a bundle built without E2E_VARIANT as none', () => {
    const { status, stdout } = load({});
    expect(status).toBe(0);
    expect(stdout).toBe('regroup-e2e-variant=none');
  });

  it('marks a bundle built with E2E_VARIANT exported', () => {
    const { status, stdout } = load({ env: { E2E_VARIANT: 'staging' } });
    expect(status).toBe(0);
    expect(stdout).toBe('regroup-e2e-variant=staging');
  });

  it('refuses E2E_VARIANT supplied by .env', () => {
    const { status, stderr } = load({ dotenv: 'E2E_VARIANT=emulator\n' });
    expect(status).not.toBe(0);
    expect(stderr).toContain('E2E_VARIANT must not be set in .env');
  });

  it('refuses an unknown E2E_VARIANT', () => {
    const { status, stderr } = load({ env: { E2E_VARIANT: 'prod' } });
    expect(status).not.toBe(0);
    expect(stderr).toContain('E2E_VARIANT must be unset or one of');
  });
});

/** Loads babel.config.js with the given NODE_ENV and returns its plugin list. */
function plugins(nodeEnv) {
  const base = { ...process.env, NODE_ENV: nodeEnv };
  delete base.E2E_VARIANT;
  delete base.STRIPE_PUBLISHABLE_KEY;
  const result = spawnSync(
    process.execPath,
    ['-e', `console.log(JSON.stringify(require(${JSON.stringify(CONFIG)}).plugins))`],
    { cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'babel-config-')), env: base, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout.trim());
}

describe('babel.config.js worklets plugin (react-native-reanimated 4)', () => {
  it('puts react-native-worklets/plugin last in a bundle build', () => {
    const list = plugins('production');
    expect(list[list.length - 1]).toBe('react-native-worklets/plugin');
    expect(list.filter((p) => p === 'react-native-worklets/plugin')).toHaveLength(1);
  });

  it('leaves react-native-worklets/plugin out under Jest', () => {
    expect(JSON.stringify(plugins('test'))).not.toContain('react-native-worklets');
  });
});

describe('babel.config.js live Stripe key in an e2e bundle', () => {
  it.each(['emulator', 'staging'])(
    'refuses an exported pk_live_ key for E2E_VARIANT=%s',
    (variant) => {
      const { status, stderr } = load({
        env: { E2E_VARIANT: variant, STRIPE_PUBLISHABLE_KEY: 'pk_live_abc123' },
      });
      expect(status).not.toBe(0);
      expect(stderr).toContain('live Stripe key');
      expect(stderr).not.toContain('abc123');
    },
  );

  it('refuses a pk_live_ key from .env in an e2e bundle', () => {
    const { status, stderr } = load({
      env: { E2E_VARIANT: 'staging' },
      dotenv: 'STRIPE_PUBLISHABLE_KEY=pk_live_fromfile\n',
    });
    expect(status).not.toBe(0);
    expect(stderr).toContain('live Stripe key');
  });

  it('allows a test key in an e2e bundle', () => {
    const { status } = load({
      env: { E2E_VARIANT: 'staging', STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' },
    });
    expect(status).toBe(0);
  });

  it('allows a live key in a bundle without E2E_VARIANT', () => {
    const { status } = load({ env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' } });
    expect(status).toBe(0);
  });
});
