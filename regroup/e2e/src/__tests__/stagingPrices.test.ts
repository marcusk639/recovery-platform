import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readStagingPrices } from '../stagingPrices';
import { PRICE_ENV_VARS } from '../stripeSandbox';

function writePrices(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-prices-'));
  const file = path.join(dir, 'stripe-e2e-prices.json');
  fs.writeFileSync(file, content);
  return file;
}

const allPrices = (): Record<string, string> =>
  Object.fromEntries(PRICE_ENV_VARS.map((name, i) => [name, `price_test${i}`]));

describe('PRICE_ENV_VARS', () => {
  it('lists the 12 tier prices and the 2 legacy prices once each', () => {
    expect(PRICE_ENV_VARS).toHaveLength(14);
    expect(new Set(PRICE_ENV_VARS).size).toBe(14);
    expect(PRICE_ENV_VARS).toEqual(
      expect.arrayContaining([
        'STRIPE_PRICE_TRAD_STARTER',
        'STRIPE_PRICE_OXFORD_NETWORK_ANNUAL',
        'STRIPE_HOUSE_PRICE_ID',
        'STRIPE_OXFORD_PRICE_ID',
      ]),
    );
  });
});

describe('readStagingPrices', () => {
  it('returns every price when the file is complete', () => {
    expect(readStagingPrices(writePrices(JSON.stringify(allPrices())))).toEqual(allPrices());
  });

  it('tells the operator to run the sandbox setup when the file is missing', () => {
    const missing = path.join(os.tmpdir(), 'no-such-dir-staging-prices', 'stripe-e2e-prices.json');
    expect(() => readStagingPrices(missing)).toThrow(/stripe-sandbox-setup/);
  });

  it('reports a file that exists but cannot be read by error code, not as bad JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-prices-'));
    expect(() => readStagingPrices(dir)).toThrow(/cannot read .*\(EISDIR\)/);
  });

  it('names the file when the JSON is malformed or not an object', () => {
    for (const bad of ['{ nope', '["price_x"]', 'null']) {
      const file = writePrices(bad);
      expect(() => readStagingPrices(file)).toThrow(file);
    }
  });

  it('names a missing price', () => {
    const { STRIPE_PRICE_TRAD_STARTER: _gone, ...rest } = allPrices();
    expect(() => readStagingPrices(writePrices(JSON.stringify(rest)))).toThrow(
      /missing.*STRIPE_PRICE_TRAD_STARTER/,
    );
  });

  it('names an unexpected key', () => {
    const extra = { ...allPrices(), STRIPE_SECRET_KEY: 'price_x' };
    expect(() => readStagingPrices(writePrices(JSON.stringify(extra)))).toThrow(
      /unexpected.*STRIPE_SECRET_KEY/,
    );
  });

  it.each(['sk_test_abc', 'prod_abc', 'price_', 'price_a\nB=1', ''])(
    'rejects a value that is not a price id (%p) without echoing it',
    (value) => {
      const bad = { ...allPrices(), STRIPE_PRICE_TRAD_STARTER: value };
      let message = '';
      try {
        readStagingPrices(writePrices(JSON.stringify(bad)));
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/STRIPE_PRICE_TRAD_STARTER.*not a Stripe price id/);
      if (value) expect(message).not.toContain(value);
    },
  );
});
