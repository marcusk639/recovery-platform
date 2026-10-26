import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { E2E_SANDBOX_ACCOUNT_ID } from '../stripeSandbox';
import { runSetup } from '../stripeSandboxRun';
import { CONNECT_EVENTS, PLATFORM_EVENTS } from '../stripeWebhooks';
import { makeStripe } from './helpers/mockStripe';

// Recovery paths for an existing endpoint whose secret is not on file: the operator is
// pointed at a non-destructive fix first, because a live endpoint's secret may be deployed.
const API = '2026-01-28.clover';
const HOST = 'https://us-central1-regroup-e2e.cloudfunctions.net';
const urls = {
  platformUrl: `${HOST}/stripeEvents`,
  connectUrl: `${HOST}/handleStripeConnectWebhook`,
};

let outDir: string;
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-recovery-'));
});
afterEach(() => jest.restoreAllMocks());

const base = (stripe: unknown, extra = {}) => ({
  readKey: () => 'sk_test_zzz',
  createStripe: () => stripe as never,
  outDir,
  confirmAccount: E2E_SANDBOX_ACCOUNT_ID,
  apiVersion: API,
  ...urls,
  ...extra,
});
const secretsFile = () => path.join(outDir, 'stripe-e2e-webhook-secrets.json');
const endpoint = (id: string, kind: 'platform' | 'connect', status = 'enabled') => ({
  id,
  url: kind === 'platform' ? urls.platformUrl : urls.connectUrl,
  status,
  enabled_events: [...(kind === 'platform' ? PLATFORM_EVENTS : CONNECT_EVENTS)],
  api_version: API,
  application: kind === 'connect' ? 'ca_mock' : null,
});
const savedFor = (platformId: string, connectId: string) =>
  fs.writeFileSync(
    secretsFile(),
    JSON.stringify({
      platform: 'whsec_p1',
      platformEndpointId: platformId,
      connect: 'whsec_c1',
      connectEndpointId: connectId,
    }),
  );
const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected a rejection');
};
const DESTRUCTIVE_FIRST = /^[^.]*[Dd]elete|Delete that endpoint|delete it and rerun/;

describe('createdKinds', () => {
  it('lists both kinds on a fresh run and none on a rerun', async () => {
    const { stripe } = makeStripe();
    expect((await runSetup(base(stripe))).createdKinds).toEqual(['platform', 'connect']);
    expect((await runSetup(base(stripe))).createdKinds).toEqual([]);
  });
});

describe('an endpoint whose secret is not in the secrets file', () => {
  it('points at a rescue file holding its secret, with no delete instruction', async () => {
    const rescue = path.join(outDir, 'stripe-e2e-webhook-secret-platform-1700000000000.json');
    fs.writeFileSync(rescue, JSON.stringify({ platform: 'whsec_r1', platformEndpointId: 'we_p' }));
    const { mock, stripe } = makeStripe({ endpoints: [endpoint('we_p', 'platform')] });
    const message = await messageOf(runSetup(base(stripe)));
    expect(message).toContain(rescue);
    expect(message).toMatch(/Merge its "platform" and "platformEndpointId"/);
    expect(message).not.toContain('whsec_');
    expect(message).not.toMatch(/[Dd]elete/);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });

  it('accepts a rescue file from before endpoint ids, but not one for another endpoint', async () => {
    const legacy = path.join(outDir, 'stripe-e2e-webhook-secret-platform-1.json');
    fs.writeFileSync(legacy, JSON.stringify({ platform: 'whsec_r1' }));
    const { stripe } = makeStripe({ endpoints: [endpoint('we_p', 'platform')] });
    expect(await messageOf(runSetup(base(stripe)))).toContain(legacy);

    fs.writeFileSync(legacy, JSON.stringify({ platform: 'whsec_r1', platformEndpointId: 'we_x' }));
    expect(await messageOf(runSetup(base(stripe)))).toMatch(/Reveal/);
  });

  it('otherwise says to reveal the secret in the Dashboard, with deletion only as a last resort', async () => {
    const { mock, stripe } = makeStripe({ endpoints: [endpoint('we_p', 'platform')] });
    const message = await messageOf(runSetup(base(stripe)));
    expect(message).toMatch(/Reveal the endpoint's signing secret in the Stripe Dashboard/);
    expect(message).toContain('we_p');
    expect(message).toContain(`"platformEndpointId": "we_p"`);
    expect(message).toContain(secretsFile());
    expect(message).not.toMatch(DESTRUCTIVE_FIRST);
    expect(message.indexOf('Reveal')).toBeLessThan(message.indexOf('Delete'));
    expect(message).not.toContain('whsec_');
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });
});

describe('secrets file values', () => {
  it.each([null, 42, { id: 'we_p' }])(
    'rejects a non-string endpoint id (%p) before creating a Stripe client',
    async (bad) => {
      fs.writeFileSync(
        secretsFile(),
        JSON.stringify({ platform: 'whsec_leakme', platformEndpointId: bad }),
      );
      const createStripe = jest.fn();
      const message = await messageOf(runSetup({ ...base(null), createStripe }));
      expect(message).toContain(secretsFile());
      expect(message).toMatch(/must map each key to a string/);
      expect(message).not.toMatch(/whsec_|leakme/);
      expect(createStripe).not.toHaveBeenCalled();
    },
  );
});

describe('endpoints sharing a URL', () => {
  it('ignores a disabled duplicate and reuses the enabled endpoint', async () => {
    savedFor('we_p', 'we_c');
    const { mock, stripe } = makeStripe({
      endpoints: [
        endpoint('we_old', 'platform', 'disabled'),
        endpoint('we_p', 'platform'),
        endpoint('we_c', 'connect'),
      ],
    });
    expect((await runSetup(base(stripe))).createdKinds).toEqual([]);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });

  it('refuses two enabled endpoints at the same URL, naming both', async () => {
    savedFor('we_p', 'we_c');
    const { mock, stripe } = makeStripe({
      endpoints: [endpoint('we_p', 'platform'), endpoint('we_p2', 'platform')],
    });
    const message = await messageOf(runSetup(base(stripe)));
    expect(message).toMatch(/2 enabled webhook endpoints share .*stripeEvents \(we_p, we_p2\)/);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });

  it('creates a new endpoint when the only one at the URL is disabled', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [endpoint('we_old', 'platform', 'disabled')],
    });
    const { createdKinds } = await runSetup(base(stripe));
    expect(createdKinds).toEqual(['platform', 'connect']);
    const createdUrls = mock.webhookEndpoints.create.mock.calls.map((c: any[]) => c[0].url);
    expect(createdUrls).toEqual([urls.platformUrl, urls.connectUrl]);
  });
});
