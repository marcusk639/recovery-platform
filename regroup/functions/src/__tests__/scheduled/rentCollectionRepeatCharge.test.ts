/**
 * Repeat-charge guard for scheduled auto-pay rent collection.
 *
 * The guard is in-flight AMOUNT, not a calendar period. These tests pin the
 * three ways a period key failed: ACH settles days later so the balance is
 * still unreduced when the next period opens; a declined card consumed the
 * whole period instead of retrying; and the period correlated with nothing
 * because `rentOwed` is raised by hand, not by an accrual job.
 */

import { runRentCollection } from '../../scheduled/scheduledRentCollection';
import { STALE_IN_FLIGHT_MS } from '../../scheduled/rentAttempts';
import { FakeRentAttemptStore, fakeGuestDoc, cardDecline } from './helpers/fakeRentAttemptStore';

const mockCreatePaymentIntent = jest.fn();
const attemptStore = new FakeRentAttemptStore();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
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

/**
 * The balance never moves between runs — the real state, because `rentOwed` is
 * only decremented by the webhook, and for ACH not for days.
 */
const seedGuest = (rentOwed = 50000) => {
  guestCollection.get.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [fakeGuestDoc('guest-1', rentOwed)],
  });
};

const amountsCharged = () => mockCreatePaymentIntent.mock.calls.map((c) => c[0].amount);

describe('rent collection: in-flight repeat-charge guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_card',
      status: 'succeeded',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not re-charge while an ACH payment is still settling across a month boundary', async () => {
    seedGuest();
    jest.useFakeTimers();

    // ACH: confirmed but unsettled. This is the case a YYYY-MM key could not
    // cover, because the key expires inside the settlement window.
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_ach',
      status: 'processing',
    });

    jest.setSystemTime(new Date('2026-11-28T10:00:00.000Z'));
    await runRentCollection();
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);

    // New calendar month, three days later — balance still unreduced.
    jest.setSystemTime(new Date('2026-12-01T10:00:00.000Z'));
    const second = await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(second.attemptedCount).toBe(0);
    expect(second.matchedCount).toBe(1);
  });

  it('retries the next day after a declined card instead of consuming the period', async () => {
    seedGuest();
    jest.useFakeTimers();

    mockCreatePaymentIntent.mockRejectedValue(cardDecline());
    jest.setSystemTime(new Date('2026-11-10T10:00:00.000Z'));
    const first = await runRentCollection();
    expect(first.failureCount).toBe(1);

    // A decline is terminal and releases the amount — the resident is eligible
    // again tomorrow, not locked out for the rest of the month.
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_retry',
      status: 'succeeded',
    });
    jest.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));
    const second = await runRentCollection();

    expect(second.attemptedCount).toBe(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry after an unknown error, which may have charged', async () => {
    seedGuest();
    jest.useFakeTimers();

    // A timeout can leave a real PaymentIntent behind, so the amount must stay
    // in flight rather than being released like a decline.
    mockCreatePaymentIntent.mockRejectedValue(new Error('socket hang up'));
    jest.setSystemTime(new Date('2026-11-10T10:00:00.000Z'));
    await runRentCollection();

    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_x', status: 'succeeded' });
    jest.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));
    const second = await runRentCollection();

    expect(second.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    const record = [...attemptStore.docs.values()][0];
    expect(record).toMatchObject({ needsReconciliation: true });
  });

  // Changed by the period quota: a mid-period top-up is NOT collected now, it
  // waits for the next window. Auto-pay collects one period's rent; ad-hoc
  // additions are not something to debit off-session the same day.
  it('defers a mid-cycle balance increase to the next period', async () => {
    // 50000 already in flight; the operator adds a 20000 correction. A period
    // key skipped this silently; the in-flight guard charges the delta.
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      houseId: 'house-1',
      amountCents: 50000,
      status: 'awaiting_confirmation',
      createdAt: new Date().toISOString(),
    });
    seedGuest(70000);

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  // Staleness (10d) releases the IN-FLIGHT hold, but the quota window (30d)
  // still bounds the period — a stale attempt may have taken money, so it keeps
  // consuming quota. The lockout is bounded, not permanent, and the attempt is
  // flagged for reconciliation meanwhile.
  it('does not recharge a stale attempt inside the quota window', async () => {
    const longAgo = new Date(Date.now() - STALE_IN_FLIGHT_MS - 60_000);
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      houseId: 'house-1',
      amountCents: 50000,
      status: 'pending',
      createdAt: longAgo.toISOString(),
    });
    seedGuest();

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps suppressing while the in-flight attempt is still fresh', async () => {
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      houseId: 'house-1',
      amountCents: 50000,
      status: 'pending',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    seedGuest();

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  // This asserted a SECOND full-period charge on top of a settled one and called
  // it correct — a reviewer flagged it as ratifying a double charge. The quota
  // is what makes a settled charge count.
  it('does not charge again after a settled charge in the same period', async () => {
    attemptStore.seedAttempt({
      guestId: 'guest-1',
      houseId: 'house-1',
      amountCents: 50000,
      status: 'charged',
      createdAt: new Date().toISOString(),
    });
    seedGuest();

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it('does not key attempt documents on a sequential value', async () => {
    seedGuest();
    await runRentCollection();

    // Firestore shards by key range, so a timestamp-keyed id would concentrate
    // writes on one range. doc() is called with no argument.
    expect(attemptStore.mintedIds).toHaveLength(1);
    expect(attemptStore.mintedIds[0]).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(attemptStore.mintedIds[0]).not.toContain('guest-1');
  });
});
