// src/__tests__/scripts/migratePaymentAmountsToCents.test.ts
//
// Covers the unit discriminator's era-independent rules: rule 1
// (rentAppliedAmountCents), rule 3 (no PaymentIntent id) and the quarantine,
// currency and idempotency guards. Rule 2, which is bounded by the #82 deploy
// cutoff, is in migratePaymentAmountsToCentsCutoff.test.ts; the flag and
// timestamp parsing in paymentMigrationCutoff.test.ts; the driver (run/main,
// batching, exit code) in migratePaymentAmountsToCentsRun.test.ts.
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

describe('classify — payments.amount unit discriminator (#82)', () => {
  it('reads rentAppliedAmountCents as the authority when it matches amount*100', () => {
    // Webhook-written dollars: the rentOwed transaction recorded the same
    // figure in unambiguous cents on the same document. No timestamp is
    // supplied — this witness is arithmetic and must not be cutoff-gated.
    expect(
      classify(
        {
          amount: 500,
          rentAppliedAmountCents: 50000,
          stripePaymentIntentId: 'pi_1',
          status: 'succeeded',
        },
        CUTOFF,
      ),
    ).toEqual({ kind: 'dollars', cents: 50000 });
  });

  it('still trusts rentAppliedAmountCents on a doc written after the cutoff', () => {
    expect(
      classify(
        {
          amount: 500,
          rentAppliedAmountCents: 50000,
          stripePaymentIntentId: 'pi_1',
          status: 'succeeded',
          updatedAt: AFTER,
        },
        CUTOFF,
      ),
    ).toEqual({ kind: 'dollars', cents: 50000 });
  });

  it('treats a doc whose rentAppliedAmountCents already equals amount as cents', () => {
    expect(
      classify(
        {
          amount: 50000,
          rentAppliedAmountCents: 50000,
          stripePaymentIntentId: 'pi_1',
          status: 'succeeded',
        },
        CUTOFF,
      ),
    ).toEqual({ kind: 'cents' });
  });

  it('refuses a doc whose rentAppliedAmountCents matches neither reading', () => {
    expect(
      classify(
        {
          amount: 500,
          rentAppliedAmountCents: 12345,
          stripePaymentIntentId: 'pi_1',
          status: 'succeeded',
        },
        CUTOFF,
      ),
    ).toMatchObject({ kind: 'report' });
  });

  it('rounds the float when rule 1 compares amount*100 to the witness', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE754. Without the rounding the
    // witness matches nothing and a decidable document is sent to a human.
    expect(classify({ amount: 19.99, rentAppliedAmountCents: 1999 }, CUTOFF)).toEqual({
      kind: 'dollars',
      cents: 1999,
    });
  });

  describe('quarantine and currency guards', () => {
    it('refuses on refusedReason alone, without amountMinorUnits', () => {
      expect(
        classify(
          {
            amount: 50000,
            refusedReason: 'unsupported_currency',
            stripePaymentIntentId: 'pi_1',
            status: 'succeeded',
            updatedAt: BEFORE,
          },
          CUTOFF,
        ),
      ).toEqual({ kind: 'report', reason: 'non-USD quarantine — handle by hand' });
    });

    it('refuses on amountMinorUnits alone, without refusedReason', () => {
      expect(
        classify(
          {
            amount: 50000,
            amountMinorUnits: 50000,
            currency: 'usd',
            stripePaymentIntentId: 'pi_1',
            status: 'succeeded',
            updatedAt: BEFORE,
          },
          CUTOFF,
        ),
        // The reason matters, not just the refusal: the generic non-USD branch
        // would also refuse a jpy document, but it would point the operator at
        // a currency rather than at a known quarantine record.
      ).toEqual({ kind: 'report', reason: 'non-USD quarantine — handle by hand' });
    });

    it('refuses any other non-USD document', () => {
      expect(
        classify({ amount: 50000, currency: 'eur', status: 'succeeded' }, CUTOFF),
      ).toMatchObject({ kind: 'report', reason: 'currency eur' });
    });

    it('refuses an uppercase USD — the comparison is exact, not case-folded', () => {
      expect(
        classify({ amount: 50000, currency: 'USD', status: 'succeeded' }, CUTOFF),
      ).toMatchObject({ kind: 'report', reason: 'currency USD' });
    });
  });

  it('refuses a fractional amount on a document that should hold cents', () => {
    expect(classify({ amount: 99.99, status: 'succeeded', currency: 'usd' }, CUTOFF)).toMatchObject(
      { kind: 'report' },
    );
  });

  it('is idempotent: an already-migrated document is skipped', () => {
    expect(
      classify(
        {
          amount: 50000,
          amountMigratedToCentsAt: '2026-10-15T00:00:00.000Z',
          stripePaymentIntentId: 'pi_1',
          status: 'succeeded',
          updatedAt: BEFORE,
        },
        CUTOFF,
      ),
    ).toMatchObject({ kind: 'skip' });
  });

  it('skips a document with no usable numeric amount', () => {
    expect(classify({ status: 'succeeded' }, CUTOFF)).toMatchObject({ kind: 'skip' });
    expect(classify({ amount: '500', status: 'succeeded' }, CUTOFF)).toMatchObject({
      kind: 'skip',
    });
    expect(classify({ amount: Number.NaN }, CUTOFF)).toMatchObject({ kind: 'skip' });
    expect(classify({ amount: Number.POSITIVE_INFINITY }, CUTOFF)).toMatchObject({
      kind: 'skip',
    });
    expect(classify({ amount: Number.NEGATIVE_INFINITY }, CUTOFF)).toMatchObject({
      kind: 'skip',
    });
  });
});
