import type Stripe from 'stripe';
import { GRACE_PERIOD_DAYS, graceDeadline, invoiceFinalizedAt } from '../../util/grace';

// 2026-01-01T00:00:00Z
const JAN_1 = 1767225600;
const JAN_8 = '2026-01-08T00:00:00.000Z';

describe('graceDeadline', () => {
  it('is 7 days after the invoice was finalized', () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
    expect(graceDeadline(undefined, JAN_1)).toBe(JAN_8);
  });

  it('keeps an earlier deadline from a grace already running', () => {
    expect(graceDeadline('2026-01-05T00:00:00.000Z', JAN_1)).toBe('2026-01-05T00:00:00.000Z');
  });

  it("replaces a later deadline with the invoice's", () => {
    expect(graceDeadline('2026-01-20T00:00:00.000Z', JAN_1)).toBe(JAN_8);
  });

  it('ignores a stale deadline from before this invoice', () => {
    expect(graceDeadline('2025-10-01T00:00:00.000Z', JAN_1)).toBe(JAN_8);
  });

  it("ignores a deadline that doesn't parse", () => {
    expect(graceDeadline('garbage', JAN_1)).toBe(JAN_8);
  });
});

describe('invoiceFinalizedAt', () => {
  it("is the invoice's finalized_at", () => {
    const invoice = { status_transitions: { finalized_at: JAN_1 }, created: 1 };
    expect(invoiceFinalizedAt(invoice as unknown as Stripe.Invoice)).toBe(JAN_1);
  });

  it("falls back to the invoice's creation time", () => {
    const invoice = { status_transitions: { finalized_at: null }, created: 1767000000 };
    expect(invoiceFinalizedAt(invoice as unknown as Stripe.Invoice)).toBe(1767000000);
  });
});
