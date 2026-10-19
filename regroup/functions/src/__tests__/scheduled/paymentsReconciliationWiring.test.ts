/**
 * The payments reconciliation sweep must be reached by the daily job.
 *
 * paymentsReconciliationReport.test.ts proves the sweep correct in isolation.
 * It says nothing about whether runRentCollection calls it, and a reader with
 * no caller is the write-only-flag defect again. These go through
 * runRentCollection(), like rentReconciliationReader.test.ts does for attempts.
 */

import { runRentCollection } from '../../scheduled/scheduledRentCollection';
import { FakeRentAttemptStore } from './helpers/fakeRentAttemptStore';

const attemptStore = new FakeRentAttemptStore();
const mockPaymentsCount = jest.fn();
const mockPaymentsWhere = jest.fn();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
  rentCollectionAttemptCollection: {
    doc: (id?: string) => attemptStore.doc(id),
    where: (f: string, op: string, v: unknown) => attemptStore.where(f, op, v),
  },
  paymentsCollection: { where: (...a: unknown[]) => mockPaymentsWhere(...a) },
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  houseCollection: require('./helpers/fakeApiFirestore').fakeActiveHouseCollection(),
}));

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    paymentIntents: { create: jest.fn() },
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

const seedUnresolvedAttempts = (n: number) => {
  for (let i = 0; i < n; i += 1) {
    attemptStore.seedAttempt({
      guestId: `guest-${i}`,
      houseId: 'house-1',
      amountCents: 50000,
      status: 'pending',
      needsReconciliation: true,
      failureReason: 'socket hang up',
      createdAt: new Date().toISOString(),
    });
  }
};

describe('payments reconciliation sweep is wired into the daily job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    guestCollection.get.mockResolvedValue({ empty: true, size: 0, docs: [] });
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    mockPaymentsWhere.mockReturnValue({
      where: mockPaymentsWhere,
      count: () => ({ get: mockPaymentsCount }),
      select: () => ({
        limit: () => ({ get: async () => ({ size: 0, docs: [] }) }),
      }),
    });
  });

  it('propagates a non-zero payments count into the summary', async () => {
    mockPaymentsCount.mockResolvedValue({ data: () => ({ count: 2 }) });

    const summary = await runRentCollection();

    expect(summary.paymentsNeedingReconciliationCount).toBe(2);
  });

  it('keeps the two counters independent: attempts only', async () => {
    seedUnresolvedAttempts(3);
    mockPaymentsCount.mockResolvedValue({ data: () => ({ count: 0 }) });

    const summary = await runRentCollection();

    expect(summary.needsReconciliationCount).toBe(3);
    expect(summary.paymentsNeedingReconciliationCount).toBe(0);
  });

  it('keeps the two counters independent: payments only', async () => {
    mockPaymentsCount.mockResolvedValue({ data: () => ({ count: 2 }) });

    const summary = await runRentCollection();

    expect(summary.needsReconciliationCount).toBe(0);
    expect(summary.paymentsNeedingReconciliationCount).toBe(2);
  });
});
