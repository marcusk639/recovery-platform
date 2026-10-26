import * as path from 'path';
import { pinnedStripeApiVersion } from '../launchConfig';
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
    const deps = buildSetupDeps(
      ['--platform-url', 'https://a', '--connect-url', 'https://b'],
      '/cfg',
      create,
    );
    expect(deps.confirmAccount).toBeUndefined();
    expect(() => buildSetupDeps(['--platform-url', 'https://a'], '/cfg', create)).toThrow(
      /--connect-url/,
    );
  });

  it('pins the Stripe API version from launch-config.json', () => {
    const deps = buildSetupDeps(['--platform-url', 'a', '--connect-url', 'b'], '/cfg', create);
    expect(deps.apiVersion).toBe(pinnedStripeApiVersion());
    expect(deps.apiVersion).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });

  it('reads the key from the fixed key file path only', () => {
    const deps = buildSetupDeps(
      ['--platform-url', 'a', '--connect-url', 'b'],
      '/nonexistent-cfg',
      create,
    );
    expect(() => deps.readKey()).toThrow(
      path.join('/nonexistent-cfg', 'stripe-e2e-sandbox-key.txt'),
    );
  });
});
