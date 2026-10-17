// src/__tests__/scripts/migratePaymentAmountsToCentsCutoff.test.ts
//
// Covers classify rule 2 only — the webhook-shaped document whose unit cannot
// be read off its fields and is decided by the #82 deploy cutoff instead.
// This is the case that silently 100x'd real money before the cutoff existed.
// The other rules live in migratePaymentAmountsToCents.test.ts, the flag and
// timestamp parsing in paymentMigrationCutoff.test.ts, and the driver in
// migratePaymentAmountsToCentsRun.test.ts.
//
// The migration is UNRUN and these tests do not touch Firestore —
// scriptBootstrap and firebase-admin are both stubbed so importing the script
// cannot reach a project.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

jest.mock('firebase-admin', () => {
  const firestore: any = () => ({
    collection: jest.fn(),
    batch: jest.fn(),
  });
  firestore.FieldValue = { serverTimestamp: () => '__serverTimestamp' };
  return { firestore };
});

import { classify } from '../../scripts/migratePaymentAmountsToCents';

/** Stand-in for the #82 deploy. */
const CUTOFF = Date.parse('2026-10-16T00:00:00.000Z');
const BEFORE = '2026-10-15T00:00:00.000Z';
const AFTER = '2026-10-17T00:00:00.000Z';

describe('classify rule 2 — webhook-shaped doc, bounded by the #82 deploy cutoff', () => {
  const webhookShape = (extra: Record<string, unknown>) => ({
    amount: 500,
    stripePaymentIntentId: 'pi_1',
    status: 'succeeded',
    ...extra,
  });

  it('converts a doc whose amount was written before the deploy', () => {
    // No rentAppliedAmountCents (e.g. the missing-metadata partial write).
    expect(classify(webhookShape({ updatedAt: BEFORE }), CUTOFF)).toEqual({
      kind: 'dollars',
      cents: 50000,
    });
  });

  it('refuses a doc written after the deploy — the webhook now writes cents', () => {
    expect(classify(webhookShape({ updatedAt: AFTER }), CUTOFF)).toEqual({
      kind: 'report',
      reason: 'webhook-shaped doc written at or after the #82 deploy — unit undecidable',
    });
  });

  it('refuses a doc written exactly at the deploy instant', () => {
    expect(
      classify(webhookShape({ updatedAt: new Date(CUTOFF).toISOString() }), CUTOFF),
    ).toMatchObject({ kind: 'report' });
  });

  it('refuses a doc carrying no timestamp at all', () => {
    expect(classify(webhookShape({}), CUTOFF)).toMatchObject({ kind: 'report' });
  });

  it('refuses a doc whose timestamp does not parse', () => {
    expect(classify(webhookShape({ updatedAt: 'monday' }), CUTOFF)).toMatchObject({
      kind: 'report',
    });
  });

  it('falls back to createdAt when updatedAt is absent', () => {
    expect(classify(webhookShape({ createdAt: BEFORE }), CUTOFF)).toEqual({
      kind: 'dollars',
      cents: 50000,
    });
    expect(classify(webhookShape({ createdAt: AFTER }), CUTOFF)).toMatchObject({
      kind: 'report',
    });
  });

  it('prefers updatedAt over createdAt — it is the later write of amount', () => {
    // The payment_failed shape re-writes amount with a fresh updatedAt onto
    // a doc mobile created earlier. createdAt would date the wrong write.
    expect(classify(webhookShape({ createdAt: BEFORE, updatedAt: AFTER }), CUTOFF)).toMatchObject({
      kind: 'report',
    });
  });

  it('reads a Firestore Timestamp, not just an ISO string', () => {
    expect(
      classify(webhookShape({ updatedAt: { toMillis: () => Date.parse(BEFORE) } }), CUTOFF),
    ).toEqual({ kind: 'dollars', cents: 50000 });
  });

  it('rounds the float when converting dollars to cents', () => {
    expect(classify(webhookShape({ amount: 19.99, updatedAt: BEFORE }), CUTOFF)).toEqual({
      kind: 'dollars',
      cents: 1999,
    });
    expect(classify(webhookShape({ amount: 4.35, updatedAt: BEFORE }), CUTOFF)).toEqual({
      kind: 'dollars',
      cents: 435,
    });
    expect(classify(webhookShape({ amount: 1234.56, updatedAt: BEFORE }), CUTOFF)).toEqual({
      kind: 'dollars',
      cents: 123456,
    });
  });

  it('converts a negative pre-deploy amount rather than reporting it', () => {
    expect(classify(webhookShape({ amount: -5.5, updatedAt: BEFORE }), CUTOFF)).toEqual({
      kind: 'dollars',
      cents: -550,
    });
  });

  it.each(['succeeded', 'failed', 'resolved_offline'])(
    'treats %s as a terminal webhook status',
    (status) => {
      expect(classify(webhookShape({ status, updatedAt: BEFORE }), CUTOFF)).toEqual({
        kind: 'dollars',
        cents: 50000,
      });
    },
  );

  it('does not treat an unknown status as terminal', () => {
    // Fractional, so the two outcomes are distinguishable: a terminal status
    // would convert this to 550 cents, a non-terminal one calls it a
    // fractional value on a document that should already hold cents.
    expect(
      classify(
        { amount: 5.5, stripePaymentIntentId: 'pi_1', status: 'canceled', updatedAt: BEFORE },
        CUTOFF,
      ),
    ).toEqual({
      kind: 'report',
      reason: 'fractional amount on a doc that should hold cents',
    });
  });

  it('does not treat a PaymentIntent id with no status as terminal', () => {
    expect(
      classify({ amount: 50000, stripePaymentIntentId: 'pi_1', updatedAt: BEFORE }, CUTOFF),
    ).toEqual({ kind: 'cents' });
  });
});

it('classifies a manual payment (no PaymentIntent id) as cents', () => {
  expect(classify({ amount: 50000, status: 'succeeded', currency: 'usd' }, CUTOFF)).toEqual({
    kind: 'cents',
  });
});

it('classifies a manual payment as cents whatever its age', () => {
  // Rule 3 is era-independent: recordManualPayment always wrote cents.
  expect(
    classify({ amount: 50000, status: 'succeeded', currency: 'usd', updatedAt: AFTER }, CUTOFF),
  ).toEqual({ kind: 'cents' });
});

it('leaves a pending doc with a PaymentIntent id alone — mobile wrote it in cents', () => {
  // recordRentPayment writes the optimistic pending record keyed by the
  // PaymentIntent id, in cents, and never writes a terminal status. The id
  // alone therefore does not identify the webhook as the last writer.
  expect(
    classify(
      { amount: 50000, stripePaymentIntentId: 'pi_1', status: 'pending', createdAt: BEFORE },
      CUTOFF,
    ),
  ).toEqual({ kind: 'cents' });
});

it('treats a zero amount as cents rather than skipping it', () => {
  expect(classify({ amount: 0, status: 'succeeded', currency: 'usd' }, CUTOFF)).toEqual({
    kind: 'cents',
  });
});

it('treats a negative manual amount as cents', () => {
  expect(classify({ amount: -2500, status: 'succeeded', currency: 'usd' }, CUTOFF)).toEqual({
    kind: 'cents',
  });
});
