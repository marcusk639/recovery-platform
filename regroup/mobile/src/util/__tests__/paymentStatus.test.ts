import { paymentDisplayStatus } from '../paymentStatus';

const paid = { status: 'succeeded' as const, amount: 50000 };

describe('paymentDisplayStatus', () => {
  it('shows a paid payment as paid', () => {
    expect(paymentDisplayStatus(paid)).toEqual({ label: 'succeeded', tone: 'good' });
  });

  it('counts a payment resolved offline as paid', () => {
    expect(paymentDisplayStatus({ status: 'resolved_offline', amount: 50000 })).toEqual({
      label: 'resolved offline',
      tone: 'good',
    });
  });

  it('marks pending and failed as not paid', () => {
    expect(paymentDisplayStatus({ status: 'pending', amount: 50000 }).tone).toBe('bad');
    expect(paymentDisplayStatus({ status: 'failed', amount: 50000 }).tone).toBe('bad');
  });

  it('a full refund is refunded', () => {
    expect(paymentDisplayStatus({ ...paid, refundedAmountCents: 50000 })).toEqual({
      label: 'refunded',
      tone: 'bad',
    });
  });

  it('a part refund says so', () => {
    expect(paymentDisplayStatus({ ...paid, refundedAmountCents: 49999 })).toEqual({
      label: 'partially refunded',
      tone: 'warning',
    });
  });

  it('a refund of zero changes nothing', () => {
    expect(paymentDisplayStatus({ ...paid, refundedAmountCents: 0 }).label).toBe('succeeded');
  });

  it('a dispute takes priority over a refund', () => {
    expect(
      paymentDisplayStatus({ ...paid, disputed: true, refundedAmountCents: 100 }),
    ).toEqual({ label: 'disputed', tone: 'warning' });
  });
});
