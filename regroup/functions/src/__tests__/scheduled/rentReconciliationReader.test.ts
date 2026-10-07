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

/**
 * The path the feature actually exists for: an attempt whose webhook never
 * arrives. Every test above seeds `needsReconciliation: true` directly, which
 * exercises the reader but NOT the production code meant to set the flag. The
 * staleness branch used to only log, so the reader was blind to its one real
 * input — three independent reviewers flagged that, and these pin it.
 */
describe('stale in-flight attempts become reconcilable', () => {
  const STALE_MS = 10 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    jest.clearAllMocks();
    attemptStore.reset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi', status: 'succeeded' });
  });

  const seedStuckAch = () =>
    attemptStore.seedAttempt({
      guestId: 'guest-stuck',
      houseId: 'house-1',
      amountCents: 50000,
      // ACH confirmed but never settled: the webhook never landed.
      status: 'awaiting_confirmation',
      needsReconciliation: false,
      createdAt: new Date(Date.now() - STALE_MS - 60_000).toISOString(),
    });

  it('flags a stale attempt so the reader can see it, in the SAME run', async () => {
    const id = seedStuckAch();
    noGuests();

    const summary = await runRentCollection();

    // The flag must be written...
    expect(attemptStore.docs.get(id)).toMatchObject({ needsReconciliation: true });
    // ...and reported by this run, not merely the next one.
    expect(summary.needsReconciliationCount).toBe(1);
  });

  it('records when the release happened, so staleness is auditable', async () => {
    const id = seedStuckAch();
    noGuests();

    await runRentCollection();

    expect(attemptStore.docs.get(id)?.staleReleasedAt).toEqual(expect.any(String));
  });

  it('does not flag an attempt that is still fresh', async () => {
    const id = attemptStore.seedAttempt({
      guestId: 'guest-fresh',
      amountCents: 50000,
      status: 'awaiting_confirmation',
      needsReconciliation: false,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    noGuests();

    const summary = await runRentCollection();

    expect(attemptStore.docs.get(id)).toMatchObject({ needsReconciliation: false });
    expect(summary.needsReconciliationCount).toBe(0);
  });

  it('does not re-flag an attempt already marked', async () => {
    const id = attemptStore.seedAttempt({
      guestId: 'guest-stuck',
      amountCents: 50000,
      status: 'pending',
      needsReconciliation: true,
      staleReleasedAt: '2026-01-01T00:00:00.000Z',
      createdAt: new Date(Date.now() - STALE_MS - 60_000).toISOString(),
    });
    noGuests();

    await runRentCollection();

    // Untouched: the original release timestamp survives.
    expect(attemptStore.docs.get(id)?.staleReleasedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  // The staleness release frees the in-flight hold; the quota window still
  // bounds the period. So the lockout is bounded (one window), not permanent,
  // and the attempt is flagged meanwhile rather than silently dropped.
  it('releases the in-flight hold but stays within the period quota', async () => {
    seedStuckAch();
    // Same guest, balance intact: the stale hold must not suppress the charge.
    guestCollection.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [fakeGuestDoc('guest-stuck', 50000)],
    });

    const summary = await runRentCollection();

    expect(summary.attemptedCount).toBe(0);
    expect(summary.needsReconciliationCount).toBe(1);
  });
});
