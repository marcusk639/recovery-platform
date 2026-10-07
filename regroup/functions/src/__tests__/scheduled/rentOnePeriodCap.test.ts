/**
 * Auto-pay charges ONE PERIOD's rent, never the accumulated balance.
 *
 * `rentOwed` is a running ledger with no per-cycle concept — there is no rent
 * accrual job, it is raised by hand — so a balance of 150000 may be three
 * months of arrears. Sweeping that off-session is not a charge the resident
 * agreed to. `monthlyRentCents` is the cap, and it is REQUIRED: a guest with
 * auto-pay on and no cap is skipped, not charged in full.
 */

import { runRentCollection } from '../../scheduled/scheduledRentCollection';
import { FakeRentAttemptStore } from './helpers/fakeRentAttemptStore';

const attemptStore = new FakeRentAttemptStore();
const mockCreatePaymentIntent = jest.fn();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
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

/** A guest doc with explicit control over both the balance and the cap. */
const guest = (fields: Record<string, unknown>) => ({
  id: 'guest-1',
  data: () => ({
    houseId: 'house-1',
    stripeCustomerId: 'cus_1',
    defaultPaymentMethodId: 'pm_1',
    autoPayEnabled: true,
    ...fields,
  }),
});

const seed = (fields: Record<string, unknown>) =>
  guestCollection.get.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [guest(fields)],
  });

const charged = () => mockCreatePaymentIntent.mock.calls.map((c) => c[0].amount);

describe('one-period rent cap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi', status: 'succeeded' });
  });

  it('charges one period, not three months of arrears', async () => {
    seed({ rentOwed: 150000, monthlyRentCents: 50000 });

    const summary = await runRentCollection();

    expect(charged()).toEqual([50000]);
    expect(summary.attemptedCount).toBe(1);
  });

  it('charges the balance when it is below one period', async () => {
    seed({ rentOwed: 20000, monthlyRentCents: 50000 });

    await runRentCollection();

    expect(charged()).toEqual([20000]);
  });

  it('charges exactly one period when the balance equals it', async () => {
    seed({ rentOwed: 50000, monthlyRentCents: 50000 });

    await runRentCollection();

    expect(charged()).toEqual([50000]);
  });

  // Fail closed: a missing cap is a configuration error, not a licence to
  // charge everything.
  it('SKIPS a guest with auto-pay on but no monthlyRentCents', async () => {
    seed({ rentOwed: 150000 });

    const summary = await runRentCollection();

    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(summary.attemptedCount).toBe(0);
    expect(summary.missingRentAmountCount).toBe(1);
  });

  it.each([[0], [-1], [NaN]])(
    'skips a guest whose monthlyRentCents is %p',
    async (cap) => {
      seed({ rentOwed: 150000, monthlyRentCents: cap });

      const summary = await runRentCollection();

      expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
      expect(summary.missingRentAmountCount).toBe(1);
    },
  );

  it('does not count a zero-balance guest as missing a cap', async () => {
    // Nothing outstanding, so the absent cap is not a live misconfiguration.
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      amountCents: 50000,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    seed({ rentOwed: 50000 });

    const summary = await runRentCollection();

    expect(summary.missingRentAmountCount).toBe(0);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it('applies the cap to the in-flight remainder, not the gross balance', async () => {
    // 150000 owed, 40000 already in flight, cap 50000 -> charge 50000.
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      amountCents: 40000,
      status: 'awaiting_confirmation',
      createdAt: new Date().toISOString(),
    });
    seed({ rentOwed: 150000, monthlyRentCents: 50000 });

    await runRentCollection();

    expect(charged()).toEqual([50000]);
  });

  it('charges the in-flight remainder when it falls below one period', async () => {
    // 60000 owed, 40000 in flight, cap 50000 -> outstanding 20000 wins.
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      amountCents: 40000,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    seed({ rentOwed: 60000, monthlyRentCents: 50000 });

    await runRentCollection();

    expect(charged()).toEqual([20000]);
  });

  it('prices the Connect application fee on the capped amount', async () => {
    seed({
      rentOwed: 150000,
      monthlyRentCents: 10000,
      stripeConnectId: 'acct_dest',
    });

    await runRentCollection();

    // 0.75% of 10000 (the cap), not of 150000.
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10000, application_fee_amount: 75 }),
      expect.anything(),
    );
  });
});
