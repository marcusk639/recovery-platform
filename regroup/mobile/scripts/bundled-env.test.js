const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MODULE = path.join(__dirname, 'bundled-env.js');
const { BUNDLED_ENV, STAMPED_ENV, resolveBundledEnv, bundledEnvDigest } = require('./bundled-env');

const tmpdir = (dotenv) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-env-'));
  if (dotenv !== undefined) {
    fs.writeFileSync(path.join(cwd, '.env'), dotenv);
  }
  return cwd;
};

const UNSET = { STRIPE_PUBLISHABLE_KEY: null, RATS_WEB_URL: null, GOOGLE_MAPS_API_KEY: null };

describe('BUNDLED_ENV', () => {
  it('names every value babel.config.js inlines', () => {
    expect(BUNDLED_ENV).toEqual([
      'STRIPE_PUBLISHABLE_KEY',
      'RATS_WEB_URL',
      'GOOGLE_MAPS_API_KEY',
      'E2E_VARIANT',
      'E2E_BUNDLE_MARKER',
    ]);
  });

  it('is the list babel.config.js passes to the inline plugin', () => {
    const cwd = tmpdir();
    const base = { ...process.env, NODE_ENV: 'production' };
    delete base.E2E_VARIANT;
    const config = path.join(__dirname, '..', 'babel.config.js');
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const c = require(${JSON.stringify(config)});` +
          `const p = c.plugins.find((x) => x[0] === 'transform-inline-environment-variables');` +
          'console.log(JSON.stringify(p[1].include))',
      ],
      { cwd, env: base, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(BUNDLED_ENV);
  });

  it('stamps every bundled value except the per-variant ones', () => {
    expect(STAMPED_ENV).toEqual(['GOOGLE_MAPS_API_KEY', 'RATS_WEB_URL', 'STRIPE_PUBLISHABLE_KEY']);
  });

  it('has no side effects when required: .env is not loaded into process.env', () => {
    const cwd = tmpdir('RATS_WEB_URL=https://from-dotenv.invalid\n');
    const base = { ...process.env };
    delete base.RATS_WEB_URL;
    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(MODULE)}); console.log(String(process.env.RATS_WEB_URL))`],
      { cwd, env: base, encoding: 'utf8' },
    );
    expect(result.stdout.trim()).toBe('undefined');
  });
});

describe('resolveBundledEnv', () => {
  it('reports unset values as null', () => {
    expect(resolveBundledEnv({ env: {}, cwd: tmpdir() })).toEqual(UNSET);
  });

  it('reads .env when nothing is exported', () => {
    const cwd = tmpdir('RATS_WEB_URL=https://dotenv.invalid\n');
    expect(resolveBundledEnv({ env: {}, cwd }).RATS_WEB_URL).toBe('https://dotenv.invalid');
  });

  it('prefers an exported value, even an empty one, as dotenv does', () => {
    const cwd = tmpdir('RATS_WEB_URL=https://dotenv.invalid\nGOOGLE_MAPS_API_KEY=file\n');
    const values = resolveBundledEnv({
      env: { RATS_WEB_URL: 'https://shell.invalid', GOOGLE_MAPS_API_KEY: '' },
      cwd,
    });
    expect(values.RATS_WEB_URL).toBe('https://shell.invalid');
    expect(values.GOOGLE_MAPS_API_KEY).toBe('');
  });

  it('ignores names outside STAMPED_ENV', () => {
    const values = resolveBundledEnv({
      env: { E2E_VARIANT: 'emulator', HOME: '/x' },
      cwd: tmpdir(),
    });
    expect(Object.keys(values).sort()).toEqual(STAMPED_ENV);
  });
});

describe('bundledEnvDigest', () => {
  const digest = (values) => bundledEnvDigest({ ...UNSET, ...values });

  it('is a SHA-256 hex digest that does not contain the values', () => {
    const value = digest({ STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' });
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).not.toContain('pk_live');
  });

  it('tells unset from empty', () => {
    expect(digest({ RATS_WEB_URL: '' })).not.toBe(digest({ RATS_WEB_URL: null }));
  });

  it('changes when any stamped value changes', () => {
    const before = digest({ RATS_WEB_URL: 'https://a.invalid' });
    expect(digest({ RATS_WEB_URL: 'https://b.invalid' })).not.toBe(before);
    expect(digest({ RATS_WEB_URL: 'https://a.invalid', GOOGLE_MAPS_API_KEY: 'k' })).not.toBe(
      before,
    );
  });

  it('does not depend on key order', () => {
    expect(bundledEnvDigest({ a: '1', b: '2' })).toBe(bundledEnvDigest({ b: '2', a: '1' }));
  });
});

describe('bundled-env CLI --stamp', () => {
  const stamp = ({ env = {}, dotenv } = {}) => {
    const cwd = tmpdir(dotenv);
    const base = { ...process.env };
    for (const name of BUNDLED_ENV) {
      delete base[name];
    }
    const result = spawnSync(process.execPath, [MODULE, '--stamp', 'out/bundled-env.sha256'], {
      cwd,
      env: { ...base, ...env },
      encoding: 'utf8',
    });
    const file = path.join(cwd, 'out/bundled-env.sha256');
    return {
      status: result.status,
      stamp: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined,
    };
  };

  it('writes the digest of the values resolved from the shell and .env', () => {
    const { status, stamp: written } = stamp({
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_x' },
      dotenv: 'RATS_WEB_URL=https://dotenv.invalid\n',
    });
    expect(status).toBe(0);
    expect(written).toBe(
      `${bundledEnvDigest({
        ...UNSET,
        STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
        RATS_WEB_URL: 'https://dotenv.invalid',
      })}\n`,
    );
  });

  it('changes when RATS_WEB_URL changes in .env', () => {
    expect(stamp({ dotenv: 'RATS_WEB_URL=https://a.invalid\n' }).stamp).not.toBe(
      stamp({ dotenv: 'RATS_WEB_URL=https://b.invalid\n' }).stamp,
    );
  });

  it('does not change with E2E_VARIANT', () => {
    expect(stamp({ env: { E2E_VARIANT: 'emulator' } }).stamp).toBe(stamp().stamp);
  });

  it('fails without a path', () => {
    const result = spawnSync(process.execPath, [MODULE], { cwd: tmpdir(), encoding: 'utf8' });
    expect(result.status).toBe(1);
  });
});
