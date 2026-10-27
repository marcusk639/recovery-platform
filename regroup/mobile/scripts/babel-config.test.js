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
