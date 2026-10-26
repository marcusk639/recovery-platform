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
/** The value-producing half of a printed command: everything before `| firebase`. */
const producer = (line: string) => line.trim().split(' | firebase')[0];
const run = (line: string) => {
  const r = spawnSync('bash', ['-c', producer(line)], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
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

  it('quotes the file paths and starts every command with pipefail', () => {
    const text = steps(['platform', 'connect']);
    const quoted = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
    expect(text).toContain(quoted(secretsFile()));
    expect(text).toContain(quoted(keyFile()));
    const lines = commandLines(text);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.trim().startsWith('set -o pipefail; ')).toBe(true);
  });

  it('prints exactly the stored webhook secret, with no newline', () => {
    fs.writeFileSync(secretsFile(), JSON.stringify({ platform: 'whsec_p1', connect: 'whsec_c1' }));
    const text = steps(['platform', 'connect']);
    expect(run(lineFor(text, 'STRIPE_TEST_WEBHOOK_SECRET'))).toEqual({
      status: 0,
      stdout: 'whsec_p1',
      stderr: '',
    });
    expect(run(lineFor(text, 'STRIPE_CONNECT_TEST_WEBHOOK_SECRET')).stdout).toBe('whsec_c1');
  });

  it.each([
    ['a missing field', JSON.stringify({ connect: 'whsec_c1' })],
    ['a junk value', JSON.stringify({ platform: 'x' })],
    ['an empty value', JSON.stringify({ platform: '' })],
    ['corrupt JSON', '{"platform": whsec_leakme}'],
  ])('exits 1 and prints nothing for %s', (_label, content) => {
    fs.writeFileSync(secretsFile(), content);
    const result = run(lineFor(steps(['platform']), 'STRIPE_TEST_WEBHOOK_SECRET'));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/whsec_|leakme/);
  });

  it('prints the sandbox key trimmed, and refuses anything that is not an sk_test_ key', () => {
    fs.writeFileSync(keyFile(), 'sk_test_abc123\n');
    const line = lineFor(steps([]), 'STRIPE_SECRET_KEY');
    expect(run(line)).toEqual({ status: 0, stdout: 'sk_test_abc123', stderr: '' });
    for (const bad of ['pk_test_abc', 'sk_live_abc', '']) {
      fs.writeFileSync(keyFile(), bad);
      expect(run(line)).toMatchObject({ status: 1, stdout: '' });
    }
    fs.rmSync(keyFile());
    expect(run(line)).toMatchObject({ status: 1, stdout: '' });
  });
});
