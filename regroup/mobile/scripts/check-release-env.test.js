const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-release-env.js');

// A valid release environment, so only the variable under test can fail it.
const VALID = {
  STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  GOOGLE_MAPS_API_KEY: 'maps-key',
};

/**
 * Runs the real script from an empty directory, so a developer's .env (loaded
 * by dotenv from the cwd) cannot change the outcome.
 */
function run(env, args = ['--release']) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'check-release-env-'));
  const base = { ...process.env };
  delete base.E2E_VARIANT;
  delete base.STRIPE_PUBLISHABLE_KEY;
  delete base.GOOGLE_MAPS_API_KEY;
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: { ...base, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('check-release-env', () => {
  it('passes a valid release environment', () => {
    const { status, output } = run(VALID);
    expect(status).toBe(0);
    expect(output).toContain('Build configuration OK (release mode)');
  });

  it.each(['emulator', 'staging', 'anything'])(
    'fails a release build when E2E_VARIANT=%s is set',
    (variant) => {
      const { status, output } = run({ ...VALID, E2E_VARIANT: variant });
      expect(status).toBe(1);
      expect(output).toContain('E2E_VARIANT is set');
    },
  );

  it('fails a development check when E2E_VARIANT is set', () => {
    const { status, output } = run(
      { STRIPE_PUBLISHABLE_KEY: 'pk_test_example', E2E_VARIANT: 'emulator' },
      [],
    );
    expect(status).toBe(1);
    expect(output).toContain('E2E_VARIANT is set');
  });

  // The release rules are shared with scripts/release-guard.js, so the two
  // cannot drift.
  it.each(['pk_live_', 'pk_test_example'])(
    'fails a release build with STRIPE_PUBLISHABLE_KEY=%s',
    (key) => {
      const { status, output } = run({ ...VALID, STRIPE_PUBLISHABLE_KEY: key });
      expect(status).toBe(1);
      expect(output).toContain('STRIPE_PUBLISHABLE_KEY');
    },
  );

  it('fails a release build without GOOGLE_MAPS_API_KEY', () => {
    const { status, output } = run({ STRIPE_PUBLISHABLE_KEY: 'pk_live_example' });
    expect(status).toBe(1);
    expect(output).toContain('GOOGLE_MAPS_API_KEY is not set');
  });

  it('fails a release build with an empty E2E_VARIANT', () => {
    const { status, output } = run({ ...VALID, E2E_VARIANT: '' });
    expect(status).toBe(1);
    expect(output).toContain('E2E_VARIANT is set');
  });

  it('checks only names babel.config.js bundles', () => {
    const { BUNDLED_ENV } = require('./bundled-env');
    const source = require('fs').readFileSync(SCRIPT, 'utf8');
    const names = [...source.matchAll(/name: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    names.forEach((name) => expect(BUNDLED_ENV).toContain(name));
  });
});
