const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'release-guard.js');
const { checkRelease } = require('./release-guard');

const PROD = 'phoenix-cleanhouse';

describe('checkRelease', () => {
  it('passes the production project with a live key', () => {
    expect(checkRelease({ firebaseProjectId: PROD, stripePublishableKey: 'pk_live_x' })).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it.each(['demo-regroup-e2e', 'regroup-e2e', '', undefined])(
    'fails the Firebase project %p',
    (firebaseProjectId) => {
      const result = checkRelease({ firebaseProjectId, stripePublishableKey: 'pk_live_x' });
      expect(result.ok).toBe(false);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toMatch(/Firebase project/);
    },
  );

  it.each(['pk_test_x', '', undefined, 'sk_live_x', 'pk_test_placeholder', 'pk_live_'])(
    'fails the Stripe key %p',
    (stripePublishableKey) => {
      const result = checkRelease({ firebaseProjectId: PROD, stripePublishableKey });
      expect(result.ok).toBe(false);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toMatch(/STRIPE_PUBLISHABLE_KEY/);
    },
  );

  it('never puts the key itself in a reason', () => {
    const result = checkRelease({
      firebaseProjectId: PROD,
      stripePublishableKey: 'pk_test_SECRETISH',
    });
    expect(result.reasons.join('\n')).not.toContain('SECRETISH');
  });

  it('reports every failure at once', () => {
    const result = checkRelease({
      firebaseProjectId: 'regroup-e2e',
      stripePublishableKey: 'pk_test_x',
      e2eVariant: 'staging',
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });

  it.each(['emulator', 'staging', 'anything', ''])(
    'fails when E2E_VARIANT=%p is set',
    (e2eVariant) => {
      const result = checkRelease({
        firebaseProjectId: PROD,
        stripePublishableKey: 'pk_live_x',
        e2eVariant,
      });
      expect(result.ok).toBe(false);
      expect(result.reasons[0]).toMatch(/E2E_VARIANT/);
    },
  );

  it('is not affected by the pk_test_placeholder literal in src/config/env.ts', () => {
    // The literal is in every bundle as PLACEHOLDER_STRIPE_KEY. The guard judges
    // the resolved values only, never a string scan of the source or bundle.
    const envTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'env.ts'), 'utf8');
    expect(envTs).toContain("'pk_test_placeholder'");
    expect(checkRelease({ firebaseProjectId: PROD, stripePublishableKey: 'pk_live_x' }).ok).toBe(
      true,
    );
  });
});

// Native config fixtures, shaped like the real files the builds resolve.
const FIXTURES = {
  'google-services.json': (id) =>
    JSON.stringify({ project_info: { project_id: id, project_number: '1' }, client: [] }),
  'values.xml': (id) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
    `    <string name="gcm_defaultSenderId" translatable="false">1</string>\n` +
    `    <string name="project_id" translatable="false">${id}</string>\n</resources>\n`,
  'GoogleService-Info.plist': (id) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n` +
    `\t<key>BUNDLE_ID</key>\n\t<string>com.rats.dev</string>\n` +
    `\t<key>PROJECT_ID</key>\n\t<string>${id}</string>\n</dict>\n</plist>\n`,
  // Binary plists made with `plutil -convert binary1`, as Xcode may copy a plist
  // resource. Also hold a UTF-16 string, an integer and a bool.
  'GoogleService-Info.binary.plist': (id) =>
    fs.readFileSync(path.join(__dirname, '__fixtures__', `GoogleService-Info.${id}.binary.plist`)),
};

/**
 * Runs the real CLI from an empty directory (plus an optional .env), so a
 * developer's regroup/mobile/.env cannot change the outcome.
 */
function run({
  file = 'values.xml',
  projectId = PROD,
  env = {},
  dotenv,
  args,
  extraArgs = [],
} = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-guard-'));
  const config = path.join(cwd, file);
  fs.writeFileSync(config, FIXTURES[file] ? FIXTURES[file](projectId) : `PROJECT_ID=${projectId}\n`);
  if (dotenv !== undefined) {
    fs.writeFileSync(path.join(cwd, '.env'), dotenv);
  }
  const base = { ...process.env };
  delete base.E2E_VARIANT;
  delete base.STRIPE_PUBLISHABLE_KEY;
  const result = spawnSync(process.execPath, [SCRIPT, ...(args || ['--config', config, ...extraArgs])], {
    cwd,
    env: { ...base, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}`, cwd };
}

describe('release-guard CLI', () => {
  it.each(Object.keys(FIXTURES))('passes %s for phoenix-cleanhouse with a live key', (file) => {
    const { status, output } = run({ file, env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' } });
    expect(status).toBe(0);
    expect(output).toContain('Release guard OK');
    expect(output).toContain('phoenix-cleanhouse');
    expect(output).not.toContain('pk_live_dummy');
  });

  it.each(Object.keys(FIXTURES))('fails %s for the e2e emulator project', (file) => {
    const { status, output } = run({
      file,
      projectId: 'demo-regroup-e2e',
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' },
    });
    expect(status).toBe(1);
    expect(output).toContain('demo-regroup-e2e');
  });

  it('fails a test-mode key and prints only its mode prefix', () => {
    const { status, output } = run({ env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_abc123' } });
    expect(status).toBe(1);
    expect(output).toContain('pk_test_');
    expect(output).not.toContain('abc123');
  });

  it('fails when no key is set anywhere', () => {
    const { status, output } = run();
    expect(status).toBe(1);
    expect(output).toContain('STRIPE_PUBLISHABLE_KEY');
  });

  it('reads the key from .env in the working directory, as babel.config.js does', () => {
    expect(run({ dotenv: 'STRIPE_PUBLISHABLE_KEY=pk_live_fromfile\n' }).status).toBe(0);
    expect(run({ dotenv: 'STRIPE_PUBLISHABLE_KEY=pk_test_fromfile\n' }).status).toBe(1);
  });

  it('prefers an exported key over .env, as dotenv does for the bundle', () => {
    const { status } = run({
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_shell' },
      dotenv: 'STRIPE_PUBLISHABLE_KEY=pk_live_fromfile\n',
    });
    expect(status).toBe(1);
  });

  it('fails when E2E_VARIANT is exported', () => {
    const { status, output } = run({
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy', E2E_VARIANT: 'emulator' },
    });
    expect(status).toBe(1);
    expect(output).toContain('E2E_VARIANT');
  });

  it('fails when the config file is missing', () => {
    const { status, output } = run({
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' },
      args: ['--config', '/nonexistent/GoogleService-Info.plist'],
    });
    expect(status).toBe(1);
    expect(output).toContain('/nonexistent/GoogleService-Info.plist');
  });

  it('fails without --config', () => {
    const { status } = run({ env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' }, args: [] });
    expect(status).toBe(1);
  });

  it('fails when E2E_VARIANT is set only in .env', () => {
    const { status, output } = run({
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' },
      dotenv: 'E2E_VARIANT=staging\n',
    });
    expect(status).toBe(1);
    expect(output).toContain('E2E_VARIANT');
  });

  it('fails when E2E_VARIANT is exported empty', () => {
    const { status, output } = run({
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy', E2E_VARIANT: '' },
    });
    expect(status).toBe(1);
    expect(output).toContain('E2E_VARIANT');
  });

  it('fails a config file of an unknown type', () => {
    const { status, output } = run({
      file: 'GoogleService-Info.txt',
      env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' },
    });
    expect(status).toBe(1);
    expect(output).toContain('unrecognised config file type');
  });

  describe('--key-stamp', () => {
    const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

    it('writes the SHA-256 of the resolved key, never the key', () => {
      const { status, cwd } = run({
        dotenv: 'STRIPE_PUBLISHABLE_KEY=pk_live_fromfile\n',
        extraArgs: ['--key-stamp', 'out/dir/key.sha256'],
      });
      expect(status).toBe(0);
      const stamp = fs.readFileSync(path.join(cwd, 'out/dir/key.sha256'), 'utf8');
      expect(stamp).toBe(`${sha256('pk_live_fromfile')}\n`);
      expect(stamp).not.toContain('pk_live');
    });

    it('changes when the key changes', () => {
      const stampFor = (key) => {
        const { cwd } = run({
          env: { STRIPE_PUBLISHABLE_KEY: key },
          extraArgs: ['--key-stamp', 'key.sha256'],
        });
        return fs.readFileSync(path.join(cwd, 'key.sha256'), 'utf8');
      };
      expect(stampFor('pk_live_a')).not.toBe(stampFor('pk_live_b'));
    });

    it('is not written when the guard fails', () => {
      const { status, cwd } = run({
        env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_x' },
        extraArgs: ['--key-stamp', 'key.sha256'],
      });
      expect(status).toBe(1);
      expect(fs.existsSync(path.join(cwd, 'key.sha256'))).toBe(false);
    });
  });
});
