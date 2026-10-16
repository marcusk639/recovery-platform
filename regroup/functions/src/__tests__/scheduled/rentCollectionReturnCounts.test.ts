/**
 * runRentCollection has three return sites (no guests matched, nothing due
 * beyond in-flight, and the full pass). paymentsReconciliationWiring.test.ts
 * covers only the first, so hardcoding either count at the other two survived
 * the suite. These pin both counts at the second and third.
 */

import { runRentCollection } from '../../scheduled/scheduledRentCollection';
import { FakeRentAttemptStore, fakeGuestDoc } from './helpers/fakeRentAttemptStore';

const attemptStore = new FakeRentAttemptStore();
const mockPaymentsCount = jest.fn();
const mockPaymentsWhere = jest.fn();
const mockCreatePaymentIntent = jest.fn();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
  rentCollectionAttemptCollection: {
    doc: (id?: string) => attemptStore.doc(id),
    where: (f: string, op: string, v: unknown) => attemptStore.where(f, op, v),
  },
  paymentsCollection: { where: (...a: unknown[]) => mockPaymentsWhere(...a) },
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logger } = require('firebase-functions');

const seedFlaggedAttempt = (guestId: string) =>
  attemptStore.seedAttempt({
    guestId,
    houseId: 'house-1',
    amountCents: 50000,
    status: 'pending',
    needsReconciliation: true,
    createdAt: new Date().toISOString(),
  });

describe('runRentCollection reports both reconciliation counts at every return site', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    mockPaymentsCount.mockResolvedValue({ data: () => ({ count: 2 }) });
    mockPaymentsWhere.mockReturnValue({
      where: mockPaymentsWhere,
      count: () => ({ get: mockPaymentsCount }),
      select: () => ({
        limit: () => ({ get: async () => ({ size: 0, docs: [] }) }),
      }),
    });
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_card', status: 'succeeded' });
  });

  it('nothing due beyond in-flight: returns the real counts', async () => {
    // guest-1's rent is fully covered by a fresh in-flight attempt, so the run
    // exits at the "nothing due" return.
    seedFlaggedAttempt('guest-1');
    seedFlaggedAttempt('guest-9');
    seedFlaggedAttempt('guest-8');
    guestCollection.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [fakeGuestDoc('guest-1', 50000)],
    });

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(0);
    expect(summary.matchedCount).toBe(1);
    expect(summary.needsReconciliationCount).toBe(3);
    expect(summary.paymentsNeedingReconciliationCount).toBe(2);
  });

  it('full pass: returns the real counts', async () => {
    seedFlaggedAttempt('guest-9');
    seedFlaggedAttempt('guest-8');
    seedFlaggedAttempt('guest-7');
    guestCollection.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [fakeGuestDoc('guest-1', 50000)],
    });

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(summary.needsReconciliationCount).toBe(3);
    expect(summary.paymentsNeedingReconciliationCount).toBe(2);
  });
});
