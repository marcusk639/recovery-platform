/**
 * The reconciliation sweeps are diagnostic reporting. If one throws, the day's
 * rent collection must still run, the failure must be logged at error level,
 * and the count must be null (unknown), never 0 (none found).
 */

import { runRentCollection } from '../../scheduled/scheduledRentCollection';
import * as rentAttempts from '../../scheduled/rentAttempts';
import { FakeRentAttemptStore, fakeGuestDoc } from './helpers/fakeRentAttemptStore';

const attemptStore = new FakeRentAttemptStore();
const mockCreatePaymentIntent = jest.fn();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
  rentCollectionAttemptCollection: {
    doc: (id?: string) => attemptStore.doc(id),
    where: (f: string, op: string, v: unknown) => attemptStore.where(f, op, v),
  },
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  paymentsCollection: require('./helpers/fakeApiFirestore').fakeEmptyCollection(),
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

describe('a failing reconciliation sweep does not abort rent collection', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_card', status: 'succeeded' });
    guestCollection.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [fakeGuestDoc('guest-1', 50000)],
    });
  });

  it('attempts sweep throws: still charges, attempts count null, payments count real', async () => {
    jest
      .spyOn(rentAttempts, 'reportAttemptsNeedingReconciliation')
      .mockRejectedValue(new Error('firestore unavailable'));

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(summary.needsReconciliationCount).toBeNull();
    expect(summary.paymentsNeedingReconciliationCount).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation sweep failed'),
      expect.objectContaining({ sweep: 'attempts' }),
    );
  });

  it('payments sweep throws: still charges, payments count null, attempts count real', async () => {
    jest
      .spyOn(rentAttempts, 'reportPaymentsNeedingReconciliation')
      .mockRejectedValue(new Error('firestore unavailable'));

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(summary.paymentsNeedingReconciliationCount).toBeNull();
    expect(summary.needsReconciliationCount).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation sweep failed'),
      expect.objectContaining({ sweep: 'payments' }),
    );
  });

  it('both sweeps throw: collection still runs and both counts are null', async () => {
    jest
      .spyOn(rentAttempts, 'reportAttemptsNeedingReconciliation')
      .mockRejectedValue(new Error('boom'));
    jest
      .spyOn(rentAttempts, 'reportPaymentsNeedingReconciliation')
      .mockRejectedValue(new Error('boom'));

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(1);
    expect(summary.needsReconciliationCount).toBeNull();
    expect(summary.paymentsNeedingReconciliationCount).toBeNull();
  });

  it('a failing sweep is distinguishable from none found on the no-guests path too', async () => {
    guestCollection.get.mockResolvedValue({ empty: true, size: 0, docs: [] });
    jest
      .spyOn(rentAttempts, 'reportPaymentsNeedingReconciliation')
      .mockRejectedValue(new Error('boom'));

    const summary = await runRentCollection();

    expect(summary.paymentsNeedingReconciliationCount).toBeNull();
  });
});
