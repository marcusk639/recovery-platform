import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSetupDeps } from '../stripeSandboxCli';

describe('buildSetupDeps', () => {
  const create = jest.fn();

  it('maps all three flags, including --confirm-account, into runSetup deps', () => {
    const deps = buildSetupDeps(
      ['--platform-url', 'https://a', '--connect-url', 'https://b', '--confirm-account', 'acct_1'],
      '/cfg',
      create,
    );
    expect(deps).toMatchObject({
      platformUrl: 'https://a',
      connectUrl: 'https://b',
      confirmAccount: 'acct_1',
      outDir: '/cfg',
      createStripe: create,
    });
  });

  it('leaves confirmAccount undefined when omitted and requires both URLs', () => {
    const deps = buildSetupDeps(['--platform-url', 'https://a', '--connect-url', 'https://b'], '/cfg', create);
    expect(deps.confirmAccount).toBeUndefined();
    expect(() => buildSetupDeps(['--platform-url', 'https://a'], '/cfg', create)).toThrow(
      /--connect-url/,
    );
  });

  it('reads the key from the fixed key file path only', () => {
    const deps = buildSetupDeps(['--platform-url', 'a', '--connect-url', 'b'], '/nonexistent-cfg', create);
    expect(() => deps.readKey()).toThrow(path.join('/nonexistent-cfg', 'stripe-e2e-sandbox-key.txt'));
  });

  it('rejects a flag with a missing value or a value that is another flag', () => {
    const url = 'https://a';
    expect(() => buildSetupDeps(['--connect-url', url, '--platform-url'], '/cfg', create)).toThrow(
      /--platform-url needs a value/,
    );
    expect(() =>
      buildSetupDeps(['--platform-url', '--connect-url', url], '/cfg', create),
    ).toThrow(/--platform-url needs a value/);
    expect(() =>
      buildSetupDeps(
        ['--platform-url', url, '--connect-url', url, '--confirm-account', '--x'],
        '/cfg',
        create,
      ),
    ).toThrow(/--confirm-account needs a value/);
    expect(() =>
      buildSetupDeps(['--platform-url', url, '--connect-url', url, '--confirm-account'], '/cfg', create),
    ).toThrow(/--confirm-account needs a value/);
  });

  describe('key file permissions', () => {
    const argv = ['--platform-url', 'a', '--connect-url', 'b'];
    const keyDir = (mode: number) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-key-'));
      const file = path.join(dir, 'stripe-e2e-sandbox-key.txt');
      fs.writeFileSync(file, 'sk_test_secretvalue\n');
      fs.chmodSync(file, mode);
      return { dir, file };
    };

    it.each([0o644, 0o640, 0o604])('warns (without the key) when the key file is mode %o', (mode) => {
      const { dir, file } = keyDir(mode);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(buildSetupDeps(argv, dir, create).readKey()).toContain('sk_test_secretvalue');
      const logged = warn.mock.calls.flat().join('\n');
      expect(logged).toContain(file);
      expect(logged).toMatch(/chmod 600/);
      expect(logged).not.toContain('sk_test_');
      warn.mockRestore();
    });

    it('stays quiet for a 600 key file', () => {
      const { dir } = keyDir(0o600);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      buildSetupDeps(argv, dir, create).readKey();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
