/**
 * Recording guarantees for scheduled auto-pay rent collection.
 *
 * The attempt record is written BEFORE the charge, so a charge that succeeds
 * while a follow-up write fails still holds its amount in flight and cannot be
 * charged a second time. The record is an audit trail, not the ledger — the
 * `rentOwed` decrement and the `payments` doc are written by the webhook.
 */

import {
  runRentCollection,
  scheduledRentCollection,
} from '../../scheduled/scheduledRentCollection';
import { FakeRentAttemptStore, fakeGuestDoc, callOrder } from './helpers/fakeRentAttemptStore';

const mockCreatePaymentIntent = jest.fn();
const attemptStore = new FakeRentAttemptStore();

jest.mock('../../api/firestore', () => ({
  guestCollection: { where: jest.fn().mockReturnThis(), get: jest.fn() },
  rentCollectionAttemptCollection: {
    doc: (id?: string) => attemptStore.doc(id),
    where: (f: string, op: string, v: unknown) => attemptStore.where(f, op, v),
  },
}));

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: (...args: unknown[]) => {
        callOrder.push('stripe:create');
        return mockCreatePaymentIntent(...args);
      },
    },
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

const seedGuest = () => {
  guestCollection.get.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [fakeGuestDoc('guest-1', 50000)],
  });
};

const onlyRecord = () => [...attemptStore.docs.values()][0];

type Runnable = { run: (event: unknown) => Promise<void> };

describe('rent collection: recording guarantees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_test',
      status: 'succeeded',
    });
    seedGuest();
  });

  it('records the attempt BEFORE calling Stripe', async () => {
    await runRentCollection();

    const createIdx = callOrder.indexOf('firestore:create');
    const stripeIdx = callOrder.indexOf('stripe:create');

    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(stripeIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeLessThan(stripeIdx);
  });

  it('never charges when the pre-charge record cannot be written', async () => {
    attemptStore.failCreate = true;

    const summary = await runRentCollection();

    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(summary.failureCount).toBe(1);
  });

  it('keeps a failed post-charge write in flight so it cannot be charged twice', async () => {
    attemptStore.failUpdate = true;

    await expect(runRentCollection()).resolves.toMatchObject({
      failureCount: 0,
    });
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);

    // The outcome write was lost, so the record is still `pending` — which is
    // precisely what keeps its amount counted as in-flight on the next run.
    expect(onlyRecord()).toMatchObject({ status: 'pending', amountCents: 50000 });

    const second = await runRentCollection();
    expect(second.attemptedCount).toBe(0);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('marks a settled card charge as charged', async () => {
    await runRentCollection();

    expect(onlyRecord()).toMatchObject({
      status: 'charged',
      paymentIntentId: 'pi_test',
    });
  });

  it('marks an unsettled ACH charge as awaiting_confirmation, not charged', async () => {
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_ach',
      status: 'processing',
    });

    await runRentCollection();

    expect(onlyRecord()).toMatchObject({
      status: 'awaiting_confirmation',
      stripeStatus: 'processing',
    });
  });

  it('passes rentAttemptId in metadata so the webhook can reconcile', async () => {
    await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          guestId: 'guest-1',
          rentAttemptId: attemptStore.mintedIds[0],
        }),
      }),
      expect.anything(),
    );
  });

  // Without this the job reported SUCCESS while every charge failed, which is
  // the state that let the original defect run unnoticed for days.
  it('rejects so Cloud Scheduler records a FAILURE when a charge fails', async () => {
    mockCreatePaymentIntent.mockRejectedValue(new Error('card_declined'));

    await expect((scheduledRentCollection as unknown as Runnable).run({})).rejects.toThrow(
      /1 of 1 auto-pay charges failed/,
    );
  });

  it('resolves when every charge succeeds', async () => {
    await expect((scheduledRentCollection as unknown as Runnable).run({})).resolves.toBeUndefined();
  });
});
