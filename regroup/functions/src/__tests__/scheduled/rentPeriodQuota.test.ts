/**
 * The period quota — the FREQUENCY bound, which an amount cap alone does not
 * give you.
 *
 * A previous attempt capped each charge at one period's rent and left the daily
 * cadence intact. Review proved it collected the identical total, just in more
 * debits: a 150000 arrears balance with a 50000 cap produced [50000, 50000,
 * 50000] across three consecutive runs. The first test here is that regression.
 */

import {
  runRentCollection,
  periodRentCents,
} from '../../scheduled/scheduledRentCollection';
import { FakeRentAttemptStore } from './helpers/fakeRentAttemptStore';

const attemptStore = new FakeRentAttemptStore();
const mockCreatePaymentIntent = jest.fn();
const houses = new Map<string, Record<string, unknown>>();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
  houseCollection: {
    doc: (id: string) => ({
      get: async () => ({
        exists: houses.has(id),
        data: () => houses.get(id),
      }),
    }),
  },
  rentCollectionAttemptCollection: {
    doc: (id?: string) => attemptStore.doc(id),
    where: (f: string, op: string, v: unknown) => attemptStore.where(f, op, v),
  },
}));

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreatePaymentIntent },
    paymentMethods: { retrieve: jest.fn() },
  })),
);

jest.mock('../../config', () => ({
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
const { guestCollection } = require('../../api/firestore');

const guest = (rentOwed: number) =>
  guestCollection.get.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [
      {
        id: 'g1',
        data: () => ({
          houseId: 'h1',
          stripeCustomerId: 'cus',
          defaultPaymentMethodId: 'pm',
          autoPayEnabled: true,
          rentOwed,
        }),
      },
    ],
  });

const charged = () => mockCreatePaymentIntent.mock.calls.map((c) => c[0].amount);

describe('periodRentCents', () => {
  it('converts house DOLLARS to cents for the declared frequency', () => {
    expect(periodRentCents({ rentFrequency: 'monthly', monthlyRent: 500 })).toEqual({
      cents: 50000,
      windowMs: 30 * 24 * 60 * 60 * 1000,
    });
    expect(periodRentCents({ rentFrequency: 'weekly', weeklyRent: 125 })).toEqual({
      cents: 12500,
      windowMs: 7 * 24 * 60 * 60 * 1000,
    });
  });

  // 'both' is the entity default and means "resident chooses" — no answer a
  // charge can act on.
  it.each([['both'], [undefined], ['' as string]])(
    'refuses to bill frequency %p',
    (freq) => {
      expect(
        periodRentCents({ rentFrequency: freq as string, monthlyRent: 500, weeklyRent: 125 }),
      ).toBeNull();
    },
  );

  it('refuses a declared frequency with no amount set', () => {
    expect(periodRentCents({ rentFrequency: 'monthly', monthlyRent: 0 })).toBeNull();
    expect(periodRentCents({ rentFrequency: 'weekly' })).toBeNull();
  });
});

describe('period quota bounds frequency, not just amount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    houses.clear();
    houses.set('h1', { rentFrequency: 'monthly', monthlyRent: 500 });
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi', status: 'succeeded' });
  });

  // THE regression. Previously [50000, 50000, 50000].
  it('charges one period across consecutive runs, even with the balance unmoved', async () => {
    guest(150000);

    await runRentCollection();
    await runRentCollection();
    await runRentCollection();

    expect(charged()).toEqual([50000]);
  });

  it('leaves arrears uncollected and says so truthfully', async () => {
    guest(150000);

    const summary = await runRentCollection();

    expect(charged()).toEqual([50000]);
    expect(summary.attemptedCount).toBe(1);
  });

  it('counts a SETTLED charge against the quota, unlike the in-flight scan', async () => {
    attemptStore.seedAttempt({
      guestId: 'g1',
      amountCents: 50000,
      status: 'charged',
      createdAt: new Date().toISOString(),
    });
    guest(150000);

    const summary = await runRentCollection();

    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(summary.attemptedCount).toBe(0);
  });

  it('charges again once the trailing window has passed', async () => {
    attemptStore.seedAttempt({
      guestId: 'g1',
      amountCents: 50000,
      status: 'charged',
      createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    guest(150000);

    await runRentCollection();

    expect(charged()).toEqual([50000]);
  });

  it('charges only the unused remainder of the quota', async () => {
    attemptStore.seedAttempt({
      guestId: 'g1',
      amountCents: 20000,
      status: 'charged',
      createdAt: new Date().toISOString(),
    });
    guest(150000);

    await runRentCollection();

    expect(charged()).toEqual([30000]);
  });

  it('uses the weekly amount and a 7-day window for a weekly house', async () => {
    houses.set('h1', { rentFrequency: 'weekly', weeklyRent: 125 });
    guest(150000);

    await runRentCollection();

    expect(charged()).toEqual([12500]);
  });

  it('skips a house on the default "both" frequency', async () => {
    houses.set('h1', { rentFrequency: 'both', monthlyRent: 500, weeklyRent: 125 });
    guest(150000);

    const summary = await runRentCollection();

    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(summary.noRentPeriodCount).toBe(1);
  });

  it('skips when the house document is missing entirely', async () => {
    houses.clear();
    guest(150000);

    const summary = await runRentCollection();

    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(summary.noRentPeriodCount).toBe(1);
  });

  it('charges the balance when it is below one period', async () => {
    guest(20000);

    await runRentCollection();

    expect(charged()).toEqual([20000]);
  });
});
