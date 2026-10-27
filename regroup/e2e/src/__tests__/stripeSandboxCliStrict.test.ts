import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSetupDeps, formatNextSteps } from '../stripeSandboxCli';

// The setup script's CLI wiring and the operator commands it prints. The printed node
// one-liners are executed here, so a command that would leak or store a bad value fails.
let dir: string;
beforeEach(() => {
  // A space and a single quote in the path exercise the shell quoting.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e cli'strict-"));
});

const secretsFile = () => path.join(dir, 'stripe-e2e-webhook-secrets.json');
const keyFile = () => path.join(dir, 'stripe-e2e-sandbox-key.txt');
const steps = (createdKinds: ('platform' | 'connect')[]) =>
  formatNextSteps({ secretsFile: secretsFile(), keyFile: keyFile(), createdKinds });
const commandLines = (text: string) => text.split('\n').filter((l) => l.includes('node -e'));
/**
 * Runs a whole printed command with `firebase` replaced by a shell function that
 * records whether it ran and what it received on stdin.
 */
const run = (line: string) => {
  const received = path.join(dir, 'received');
  fs.rmSync(received, { force: true });
  const stub = `firebase() { cat > ${JSON.stringify(received)}; }`;
  const r = spawnSync('bash', ['-c', `${stub}; ${line.trim()}`], { encoding: 'utf8' });
  const ran = fs.existsSync(received);
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    stored: ran ? fs.readFileSync(received, 'utf8') : null,
  };
};
const lineFor = (text: string, secretName: string) =>
  commandLines(text).find((l) => l.includes(`secrets:set ${secretName} `))!;

describe('buildSetupDeps uses the strict parser', () => {
  it.each([
    [['--platform-url', 'a', '--connect-url', 'b', '--platform-url', 'c'], /more than once/],
    [['--platform-url', 'a', '--connect-url', 'b', '--bogus', 'x'], /Unknown argument "--bogus"/],
  ])('refuses %j', (argv, error) => {
    expect(() => buildSetupDeps(argv, dir, jest.fn())).toThrow(error);
  });
});

describe('formatNextSteps', () => {
  it('lists webhook secrets only for the endpoints this run created', () => {
    const connectOnly = steps(['connect']);
    expect(connectOnly).toMatch(/secrets:set STRIPE_CONNECT_TEST_WEBHOOK_SECRET /);
    expect(connectOnly).not.toMatch(/secrets:set STRIPE_TEST_WEBHOOK_SECRET /);

    const none = steps([]);
    expect(none).toMatch(/No webhook endpoint was created; webhook secrets are unchanged/);
    expect(none).not.toMatch(/WEBHOOK_SECRET/);
    expect(none).toMatch(/secrets:set STRIPE_SECRET_KEY /);
  });

  it('quotes the file paths and validates before piping into secrets:set', () => {
    const text = steps(['platform', 'connect']);
    const quoted = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
    expect(text).toContain(quoted(secretsFile()));
    expect(text).toContain(quoted(keyFile()));
    const lines = commandLines(text);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toMatch(/ >\/dev\/null && node -e .* \| firebase /);
  });

  it('stores exactly the webhook secret, with no newline, and prints nothing', () => {
    fs.writeFileSync(secretsFile(), JSON.stringify({ platform: 'whsec_p1', connect: 'whsec_c1' }));
    const text = steps(['platform', 'connect']);
    expect(run(lineFor(text, 'STRIPE_TEST_WEBHOOK_SECRET'))).toEqual({
      status: 0,
      stdout: '',
      stderr: '',
      stored: 'whsec_p1',
    });
    expect(run(lineFor(text, 'STRIPE_CONNECT_TEST_WEBHOOK_SECRET')).stored).toBe('whsec_c1');
  });

  it.each([
    ['a missing field', JSON.stringify({ connect: 'whsec_c1' })],
    ['a junk value', JSON.stringify({ platform: 'x' })],
    ['an empty value', JSON.stringify({ platform: '' })],
    ['corrupt JSON', '{"platform": whsec_leakme}'],
  ])('never runs secrets:set for %s, and prints nothing', (_label, content) => {
    fs.writeFileSync(secretsFile(), content);
    const result = run(lineFor(steps(['platform']), 'STRIPE_TEST_WEBHOOK_SECRET'));
    expect(result.status).toBe(1);
    expect(result.stored).toBeNull();
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/whsec_|leakme/);
  });

  it('stores the sandbox key trimmed, and never runs secrets:set for anything else', () => {
    fs.writeFileSync(keyFile(), 'sk_test_abc123\n');
    const line = lineFor(steps([]), 'STRIPE_SECRET_KEY');
    expect(run(line)).toEqual({ status: 0, stdout: '', stderr: '', stored: 'sk_test_abc123' });
    for (const bad of ['pk_test_abc', 'sk_live_abc', '']) {
      fs.writeFileSync(keyFile(), bad);
      expect(run(line)).toMatchObject({ status: 1, stdout: '', stored: null });
    }
    fs.rmSync(keyFile());
    expect(run(line)).toMatchObject({ status: 1, stdout: '', stored: null });
  });
});
