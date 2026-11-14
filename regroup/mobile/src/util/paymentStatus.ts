import type { RentPayment } from '../services/payments';
import { color } from '../styles/theme';

export type PaymentTone = 'good' | 'warning' | 'bad';

export const PAYMENT_TONE_COLOR: Record<PaymentTone, string> = {
  good: color.green,
  warning: color.yellow,
  bad: color.red,
};

export interface PaymentDisplayStatus {
  label: string;
  tone: PaymentTone;
}

/**
 * What a payment record means now. A refund or dispute leaves `status` at
 * "succeeded" and sets another field, so `status` alone overstates what was paid.
 * `disputed` only records that a dispute opened: the webhook doesn't record its outcome.
 */
export function paymentDisplayStatus(
  payment: Pick<RentPayment, 'status' | 'amount' | 'refundedAmountCents' | 'disputed'>,
): PaymentDisplayStatus {
  if (payment.disputed) {
    return { label: 'disputed', tone: 'warning' };
  }
  const refunded = payment.refundedAmountCents ?? 0;
  if (refunded > 0) {
    return refunded >= payment.amount
      ? { label: 'refunded', tone: 'bad' }
      : { label: 'partially refunded', tone: 'warning' };
  }
  const paid = payment.status === 'succeeded' || payment.status === 'resolved_offline';
  return { label: payment.status.replace('_', ' '), tone: paid ? 'good' : 'bad' };
}
