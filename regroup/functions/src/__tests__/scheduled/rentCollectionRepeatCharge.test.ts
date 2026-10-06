/**
 * Repeat-charge guard for scheduled auto-pay rent collection.
 *
 * Covers the defect class the per-day Stripe idempotency key cannot: selection
 * is balance-keyed, the balance only moves when the `payment_intent.succeeded`
 * webhook lands, and Stripe forgets an idempotency key after ~24h — so without
 * a Firestore-side period record the same resident is charged the full balance
 * again every single day, and a declined card does not stop it.
 */

import {
  runRentCollection,
  billingPeriodFor,
  rentAttemptId,
} from '../../scheduled/scheduledRentCollection';
import {
  FakeRentAttemptStore,
  fakeGuestDoc,
} from './helpers/fakeRentAttemptStore';

const mockCreatePaymentIntent = jest.fn();
const attemptStore = new FakeRentAttemptStore();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
  rentCollectionAttemptCollection: {
    doc: (id: string) => attemptStore.doc(id),
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

/**
 * The resident never pays the balance down between runs — that is the real
 * state, because `rentOwed` is only decremented by the webhook.
 */
const seedSameGuestEveryRun = () => {
  guestCollection.get.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [fakeGuestDoc('guest-1', 50000)],
  });
};

describe('scheduled rent collection: repeat-charge guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_test',
      status: 'succeeded',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not create a second charge on a later day in the same billing period', async () => {
    seedSameGuestEveryRun();
    jest.useFakeTimers();

    jest.setSystemTime(new Date('2026-11-03T10:00:00.000Z'));
    await runRentCollection();

    // A later day — past the ~24h Stripe idempotency window, so the key string
    // itself provides no protection whatsoever here.
    jest.setSystemTime(new Date('2026-11-04T10:00:00.000Z'));
    const second = await runRentCollection();

    // And a third, to show the guard is not merely off-by-one.
    jest.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
    await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(second.attemptedCount).toBe(0);
    expect(second.matchedCount).toBe(1);
    expect([...attemptStore.docs.keys()]).toEqual([rentAttemptId('guest-1', '2026-11')]);
  });

  it('charges again once the billing period rolls over', async () => {
    seedSameGuestEveryRun();
    jest.useFakeTimers();

    jest.setSystemTime(new Date('2026-11-03T10:00:00.000Z'));
    await runRentCollection();

    jest.setSystemTime(new Date('2026-12-01T10:00:00.000Z'));
    await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
    expect([...attemptStore.docs.keys()].sort()).toEqual([
      rentAttemptId('guest-1', '2026-11'),
      rentAttemptId('guest-1', '2026-12'),
    ]);
  });

  it('marks a thrown charge for reconciliation and keeps the period claimed', async () => {
    seedSameGuestEveryRun();
    mockCreatePaymentIntent.mockRejectedValue(new Error('card_declined'));

    const summary = await runRentCollection();
    expect(summary.failureCount).toBe(1);

    // A declined card must NOT re-arm tomorrow's charge.
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_2',
      status: 'succeeded',
    });
    const second = await runRentCollection();

    expect(second.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(
      attemptStore.docs.get(rentAttemptId('guest-1', billingPeriodFor(new Date()))),
    ).toMatchObject({ status: 'failed', needsReconciliation: true });
  });

  it('skips a guest whose period was claimed by a concurrent run', async () => {
    seedSameGuestEveryRun();
    const period = billingPeriodFor(new Date());
    // Present in the store but carrying no `guestId`, so the exclusion query
    // cannot see it — only the atomic create() can. This is the race arm.
    attemptStore.docs.set(rentAttemptId('guest-1', period), { period });

    const summary = await runRentCollection();

    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(summary.failureCount).toBe(0);
  });
});

describe('billingPeriodFor', () => {
  it('keys on UTC year-month', () => {
    expect(billingPeriodFor(new Date('2026-11-30T23:59:59.000Z'))).toBe('2026-11');
    expect(billingPeriodFor(new Date('2026-12-01T00:00:00.000Z'))).toBe('2026-12');
  });
});
