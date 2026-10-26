import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stagingOverlayWarning } from '../launchConfig';
import { assertSandboxHygiene, ensureWebhooks } from '../stripeSandbox';
import { makeStripe } from './helpers/mockStripe';

const PLATFORM_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents';
const CONNECT_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/handleStripeConnectWebhook';
const opts = { platformUrl: PLATFORM_URL, connectUrl: CONNECT_URL };
const RECREATE =
  /Delete this endpoint in the Stripe Dashboard for this sandbox account, then rerun; the script recreates it and stores the new signing secret \(then re-run the printed secrets:set commands and redeploy\)\.$/;

describe('remedy text on endpoint errors', () => {
  it.each([
    ['events', (e: any) => (e.enabled_events = ['charge.refunded'])],
    ['status', (e: any) => (e.status = 'disabled')],
    ['api_version', (e: any) => (e.api_version = '2024-06-20')],
  ])('mismatch (%s) names the endpoint and URL and ends with the remedy', async (_l, patch) => {
    const { stripe, endpoints } = makeStripe();
    await ensureWebhooks(stripe, opts);
    patch(endpoints[0]);
    const err = (await ensureWebhooks(stripe, opts).catch((e: Error) => e)) as Error;
    expect(err.message).toContain('we_0');
    expect(err.message).toContain(PLATFORM_URL);
    expect(err.message).toMatch(RECREATE);
    expect(err.message).not.toContain('whsec_');
  });

  it('hygiene names each offender and ends with the remedy', async () => {
    const bad = 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents';
    const { stripe } = makeStripe({
      endpoints: [{ id: 'we_bad', url: bad, status: 'enabled', enabled_events: [] }],
    });
    const err = (await assertSandboxHygiene(stripe).catch((e: Error) => e)) as Error;
    expect(err.message).toContain(`we_bad -> ${bad}`);
    expect(err.message).toMatch(
      /Delete these endpoint\(s\) in the Stripe Dashboard for this sandbox account, then rerun; the script recreates the e2e endpoints and stores the new signing secrets \(then re-run the printed secrets:set commands and redeploy\)\.$/,
    );
  });
});

describe('stagingOverlayWarning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-env-warn-'));
  const fragment = path.join(dir, 'stripe-e2e-prices.env');

  it('warns, naming the flag and default path, when no staging overlay is given', () => {
    const msg = stagingOverlayWarning({}, fragment);
    expect(msg).toContain('--staging-env');
    expect(msg).toContain(fragment);
    expect(msg).toMatch(/\.env\.regroup-e2e/);
    expect(msg).toMatch(/not found/);
  });

  it('says so when the default fragment exists (without reading it)', () => {
    fs.writeFileSync(fragment, 'STRIPE_PRICE_X=price_1\n');
    const read = jest.spyOn(require('fs'), 'readFileSync');
    const msg = stagingOverlayWarning({}, fragment)!;
    expect(msg).toMatch(/exists/);
    expect(msg).toContain(`npm run e2e:gen-env -- --staging-env '${fragment}'`);
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it('is silent when a staging overlay is given', () => {
    expect(stagingOverlayWarning({ 'e2e-staging': { A: '1' } }, fragment)).toBeUndefined();
  });
});
