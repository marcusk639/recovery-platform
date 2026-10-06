/**
 * Recording guarantees for scheduled auto-pay rent collection.
 *
 * The attempt record must be written BEFORE the charge, so a charge that
 * succeeds while a follow-up write fails is still visible. Previously the only
 * writer of rent payments was the `payment_intent.succeeded` webhook, which the
 * live platform endpoint never subscribed to — money moved and nothing recorded
 * it.
 */

import {
  runRentCollection,
  scheduledRentCollection,
  billingPeriodFor,
  rentAttemptId,
} from '../../scheduled/scheduledRentCollection';
import {
  FakeRentAttemptStore,
  fakeGuestDoc,
  callOrder,
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

type Runnable = { run: (event: unknown) => Promise<void> };

describe('scheduled rent collection: recording guarantees', () => {
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

    const claimId = rentAttemptId('guest-1', billingPeriodFor(new Date()));
    const createIdx = callOrder.indexOf(`create:${claimId}`);
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

  it('leaves a durable pending record when the post-charge write fails', async () => {
    attemptStore.failUpdate = true;

    await expect(runRentCollection()).resolves.toMatchObject({
      failureCount: 0,
    });

    // The charge is real, so the record must survive for reconciliation.
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(
      attemptStore.docs.get(rentAttemptId('guest-1', billingPeriodFor(new Date()))),
    ).toMatchObject({ status: 'pending', amountCents: 50000 });
  });

  it('flags an unconfirmed PaymentIntent for reconciliation', async () => {
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_action',
      status: 'requires_action',
    });

    await runRentCollection();

    expect(
      attemptStore.docs.get(rentAttemptId('guest-1', billingPeriodFor(new Date()))),
    ).toMatchObject({
      status: 'awaiting_confirmation',
      needsReconciliation: true,
    });
  });

  it('passes rentAttemptId in metadata so the webhook can reconcile', async () => {
    await runRentCollection();

    const period = billingPeriodFor(new Date());
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          guestId: 'guest-1',
          rentAttemptId: rentAttemptId('guest-1', period),
          autoPayPeriod: period,
        }),
      }),
      expect.anything(),
    );
  });

  // Without this the job reported SUCCESS while every charge failed, which is
  // the state that let this defect run unnoticed for days.
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
