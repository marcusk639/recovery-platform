// src/__tests__/scripts/migratePaymentAmountsToCents.test.ts
//
// Covers the unit discriminator only. The migration itself is UNRUN and these
// tests do not touch Firestore — scriptBootstrap and firebase-admin are both
// stubbed so importing the script cannot reach a project.

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

describe('classify — payments.amount unit discriminator (#82)', () => {
  it('reads rentAppliedAmountCents as the authority when it matches amount*100', () => {
    // Webhook-written dollars: the rentOwed transaction recorded the same
    // figure in unambiguous cents on the same document.
    expect(
      classify({
        amount: 500,
        rentAppliedAmountCents: 50000,
        stripePaymentIntentId: 'pi_1',
        status: 'succeeded',
      }),
    ).toEqual({ kind: 'dollars', cents: 50000 });
  });

  it('treats a doc whose rentAppliedAmountCents already equals amount as cents', () => {
    expect(
      classify({
        amount: 50000,
        rentAppliedAmountCents: 50000,
        stripePaymentIntentId: 'pi_1',
        status: 'succeeded',
      }),
    ).toEqual({ kind: 'cents' });
  });

  it('refuses a doc whose rentAppliedAmountCents matches neither reading', () => {
    expect(
      classify({
        amount: 500,
        rentAppliedAmountCents: 12345,
        stripePaymentIntentId: 'pi_1',
        status: 'succeeded',
      }),
    ).toMatchObject({ kind: 'report' });
  });

  it('classifies a succeeded doc with a PaymentIntent id as webhook dollars', () => {
    // No rentAppliedAmountCents (e.g. the missing-metadata partial write).
    expect(
      classify({
        amount: 500,
        stripePaymentIntentId: 'pi_1',
        status: 'succeeded',
      }),
    ).toEqual({ kind: 'dollars', cents: 50000 });
  });

  it('classifies a manual payment (no PaymentIntent id) as cents', () => {
    expect(classify({ amount: 50000, status: 'succeeded', currency: 'usd' })).toEqual({
      kind: 'cents',
    });
  });

  it('leaves a pending doc with a PaymentIntent id alone — mobile wrote it in cents', () => {
    // recordRentPayment writes the optimistic pending record keyed by the
    // PaymentIntent id, in cents, and never writes a terminal status. The id
    // alone therefore does not identify the webhook as the last writer.
    expect(
      classify({
        amount: 50000,
        stripePaymentIntentId: 'pi_1',
        status: 'pending',
      }),
    ).toEqual({ kind: 'cents' });
  });

  it('refuses a non-USD quarantine doc even though it looks webhook-written', () => {
    // The unsupported-currency branch never writes `amount`, so any amount
    // here came from mobile in cents while the doc still carries a
    // PaymentIntent id and a succeeded status.
    expect(
      classify({
        amount: 50000,
        amountMinorUnits: 50000,
        refusedReason: 'unsupported_currency',
        currency: 'jpy',
        stripePaymentIntentId: 'pi_1',
        status: 'succeeded',
      }),
      // The reason matters, not just the refusal: the generic non-USD branch
      // below would also refuse this document, but it would point the operator
      // at a currency rather than at a known quarantine record.
    ).toEqual({
      kind: 'report',
      reason: 'non-USD quarantine — handle by hand',
    });
  });

  it('refuses any other non-USD document', () => {
    expect(classify({ amount: 50000, currency: 'eur', status: 'succeeded' })).toMatchObject({
      kind: 'report',
    });
  });

  it('refuses a fractional amount on a document that should hold cents', () => {
    expect(classify({ amount: 99.99, status: 'succeeded', currency: 'usd' })).toMatchObject({
      kind: 'report',
    });
  });

  it('is idempotent: an already-migrated document is skipped', () => {
    expect(
      classify({
        amount: 50000,
        amountMigratedToCentsAt: '2026-10-15T00:00:00.000Z',
        stripePaymentIntentId: 'pi_1',
        status: 'succeeded',
      }),
    ).toMatchObject({ kind: 'skip' });
  });

  it('skips a document with no numeric amount', () => {
    expect(classify({ status: 'succeeded' })).toMatchObject({ kind: 'skip' });
    expect(classify({ amount: '500', status: 'succeeded' })).toMatchObject({
      kind: 'skip',
    });
    expect(classify({ amount: Number.NaN })).toMatchObject({ kind: 'skip' });
  });
});
