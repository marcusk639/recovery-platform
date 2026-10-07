/**
 * `needsReconciliation` must have a reader.
 *
 * The flag is set when a charge threw for a reason that is not a deterministic
 * decline, so the Stripe outcome is unknown. Before this it was written and
 * never read by anything — no alert, no UI, no retry job.
 */

import { runRentCollection } from '../../scheduled/scheduledRentCollection';
import { FakeRentAttemptStore, fakeGuestDoc } from './helpers/fakeRentAttemptStore';

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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logger } = require('firebase-functions');

const noGuests = () =>
  guestCollection.get.mockResolvedValue({ empty: true, size: 0, docs: [] });

const oneGuest = () =>
  guestCollection.get.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [fakeGuestDoc('guest-1', 50000)],
  });

const seedUnresolved = (guestId: string) =>
  attemptStore.seedAttempt({
    guestId,
    houseId: 'house-1',
    amountCents: 50000,
    status: 'pending',
    needsReconciliation: true,
    failureReason: 'socket hang up',
    createdAt: new Date().toISOString(),
  });

describe('needsReconciliation reader', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi', status: 'succeeded' });
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => errorSpy.mockRestore());

  // The point of the whole change: a quiet day must still surface it. Both of
  // runRentCollection's early returns sit after the guest query.
  it('surfaces unresolved attempts on a day with no guests to charge', async () => {
    seedUnresolved('guest-9');
    noGuests();

    const summary = await runRentCollection();

    expect(summary.needsReconciliationCount).toBe(1);
    const call = errorSpy.mock.calls.find((c) =>
      String(c[0]).includes('need reconciliation'),
    );
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ count: 1 });
  });

  it('surfaces them on a normal run too', async () => {
    seedUnresolved('guest-9');
    oneGuest();

    const summary = await runRentCollection();

    expect(summary.needsReconciliationCount).toBe(1);
  });

  it('counts every unresolved attempt', async () => {
    seedUnresolved('guest-1');
    seedUnresolved('guest-2');
    seedUnresolved('guest-3');
    noGuests();

    expect((await runRentCollection()).needsReconciliationCount).toBe(3);
  });

  it('stays silent when nothing needs reconciliation', async () => {
    attemptStore.seedAttempt({
      guestId: 'guest-ok',
      amountCents: 100,
      status: 'charged',
      needsReconciliation: false,
      createdAt: new Date().toISOString(),
    });
    noGuests();

    const summary = await runRentCollection();

    expect(summary.needsReconciliationCount).toBe(0);
    expect(
      errorSpy.mock.calls.filter((c) => String(c[0]).includes('need reconciliation')),
    ).toHaveLength(0);
  });

  it('logs ids only — never resident names or per-resident amounts', async () => {
    seedUnresolved('guest-9');
    noGuests();

    await runRentCollection();

    const call = errorSpy.mock.calls.find((c) =>
      String(c[0]).includes('need reconciliation'),
    );
    const payload = JSON.stringify(call?.[1] ?? {});
    expect(payload).toContain('guest-9');
    expect(payload).not.toContain('amountCents');
    expect(payload).not.toMatch(/firstName|lastName|email|name"/i);
  });
});
