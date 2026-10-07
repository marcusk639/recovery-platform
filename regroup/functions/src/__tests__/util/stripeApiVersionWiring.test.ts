/**
 * Proves every Stripe client is constructed from the CENTRALIZED version, not
 * from a literal that happens to equal it.
 *
 * Why these tests are shaped the way they are. PINNED_API_VERSION is the same
 * string a hardcoded call site would carry, so an assertion like
 * `expect(opts.apiVersion).toBe('2026-01-28.clover')` passes just as happily
 * against the hardcoding it is supposed to forbid — a tautology that leaves a
 * revert to the literal undetected.
 *
 * The discriminator is the deployed override. STRIPE_API_VERSION is read at
 * module load and wins over the pin, so setting it to a sentinel that is NOT the
 * pin splits the two cases: a client wired to STRIPE_API_VERSION reports the
 * sentinel, a client with the literal still reports the pin. Every assertion
 * below therefore also asserts NOT the pin.
 *
 * main() in scripts/migrateHouseSubscriptionStatus.ts is not exported and its
 * client is built behind a --verify-stripe argv branch, so it cannot be driven
 * this way. The source-level check at the end covers all four uniformly.
 */

import * as fs from 'fs';
import * as path from 'path';

const SENTINEL = '2099-12-31.sentinel';
const PINNED = '2026-01-28.clover';

const FUNCTIONS_SRC = path.join(__dirname, '..', '..');

/** apiVersion from the single Stripe constructor call recorded by the mock. */
const constructedApiVersion = (ctor: jest.Mock): unknown => {
  expect(ctor).toHaveBeenCalledTimes(1);
  return (ctor.mock.calls[0][1] ?? {}).apiVersion;
};

describe('Stripe clients are constructed from STRIPE_API_VERSION', () => {
  const original = process.env.STRIPE_API_VERSION;

  beforeEach(() => {
    jest.resetModules();
    process.env.STRIPE_API_VERSION = SENTINEL;
    process.env.STRIPE_SECRET_KEY = 'sk_test_wiring';
  });

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) {
      delete process.env.STRIPE_API_VERSION;
    } else {
      process.env.STRIPE_API_VERSION = original;
    }
  });

  it('util/stripe.ts createStripeClient()', () => {
    const ctor = jest.fn();
    jest.doMock('stripe', () => ctor);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createStripeClient } = require('../../util/stripe');
    createStripeClient();

    expect(constructedApiVersion(ctor)).toBe(SENTINEL);
    expect(constructedApiVersion(ctor)).not.toBe(PINNED);
  });

  it('api/stripe.ts lazy stripe Proxy', () => {
    const ctor = jest.fn().mockImplementation(() => ({ customers: {} }));
    jest.doMock('stripe', () => ctor);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { stripe } = require('../../api/stripe');
    // Any property access forces the lazy construction.
    void (stripe as { customers: unknown }).customers;

    expect(constructedApiVersion(ctor)).toBe(SENTINEL);
    expect(constructedApiVersion(ctor)).not.toBe(PINNED);
  });

  it('scheduled/scheduledRentCollection.ts runRentCollection()', async () => {
    const ctor = jest.fn().mockImplementation(() => ({
      paymentIntents: { create: jest.fn() },
      paymentMethods: { retrieve: jest.fn() },
    }));
    jest.doMock('stripe', () => ctor);
    jest.doMock('../../api/firestore', () => ({
      guestCollection: {
        where: jest.fn().mockReturnThis(),
        // Empty result set: the client is built before the query, so the pass
        // completes without needing any guest fixtures.
        get: jest.fn().mockResolvedValue({ empty: true, size: 0, docs: [] }),
      },
      // runRentCollection sweeps needsReconciliation before the guest query, so
      // this collection is touched even on an empty pass.
      // A billable house: auto-pay needs a declared period and amount.
      houseCollection: {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ rentFrequency: 'monthly', monthlyRent: 500 }),
          }),
        }),
      },
      rentCollectionAttemptCollection: {
        where: () => {
          const empty = { empty: true, size: 0, docs: [] };
          // Mirrors the Query surface runRentCollection uses: get(),
          // count().get(), and select(...).limit(n).get().
          const q: any = {
            get: jest.fn().mockResolvedValue(empty),
            select: () => q,
            limit: () => q,
            count: () => ({
              get: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
            }),
          };
          return q;
        },
        doc: jest.fn(),
      },
    }));
    jest.doMock('../../config', () => ({
      STRIPE_SECRET_KEY: { name: 'STRIPE_SECRET_KEY' },
      LEGACY_RENT_FEE_HOUSE_IDS: [],
      RENT_FEE: {
        achFlatCents: 200,
        achRate: 0,
        achCapCents: 300,
        cardPlatformRate: 0.0075,
        legacyRate: 0.02,
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runRentCollection } = require('../../scheduled/scheduledRentCollection');
    await runRentCollection();

    expect(constructedApiVersion(ctor)).toBe(SENTINEL);
    expect(constructedApiVersion(ctor)).not.toBe(PINNED);
  });
});

/**
 * Source-level guard, covering all four call sites including the migration
 * script's unexported main().
 *
 * This is the assertion that fails on a copy-paste revert: it forbids any
 * date-shaped Stripe API version literal outside stripeApiVersion.ts, which is
 * the only file allowed to name one.
 */
describe('no call site hardcodes a Stripe API version', () => {
  const CALL_SITES = [
    'util/stripe.ts',
    'api/stripe.ts',
    'scheduled/scheduledRentCollection.ts',
    'scripts/migrateHouseSubscriptionStatus.ts',
  ];

  // e.g. "2026-01-28.clover" — the shape every Stripe API version takes.
  const VERSION_LITERAL = /["']\d{4}-\d{2}-\d{2}\.[a-z]+["']/;

  it.each(CALL_SITES)('%s imports the constant and names no version', (rel) => {
    const src = fs.readFileSync(path.join(FUNCTIONS_SRC, rel), 'utf8');

    expect(src).toMatch(/STRIPE_API_VERSION.*from\s+["'].*stripeApiVersion["']/s);
    expect(src).toContain('apiVersion: STRIPE_API_VERSION');
    // The negative half. Without it, re-inlining the literal alongside the
    // import would go unnoticed.
    expect(src).not.toMatch(VERSION_LITERAL);
  });

  it('stripeApiVersion.ts is the one file that names the version', () => {
    const src = fs.readFileSync(path.join(FUNCTIONS_SRC, 'util', 'stripeApiVersion.ts'), 'utf8');
    expect(src).toMatch(VERSION_LITERAL);
    expect(src).toContain(`PINNED_API_VERSION = '${PINNED}'`);
  });
});
