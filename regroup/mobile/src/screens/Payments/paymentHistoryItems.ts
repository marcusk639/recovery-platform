/**
 * Payment History shows rent charges alongside payments (rent spec §4.5), so a
 * resident can see why their balance went up. `payments` stays the history of
 * payments only; charges come from rentCharges.
 */
import type { RentPayment } from '../../services/payments';
import type { RentCharge } from '../../services/rentCharges';
import { toDateSafe } from '../../util/firestore';
import { dayParts } from '../../util/paymentDisplay';

export type HistoryItem =
  | { kind: 'payment'; key: string; payment: RentPayment }
  | { kind: 'charge'; key: string; charge: RentCharge };

/** A charge sorts at noon on its first day, so a zone offset can't move it a day. */
const chargeMs = (c: RentCharge) => {
  const { y, m, d } = dayParts(c.firstDay);
  return new Date(y, m - 1, d, 12).getTime();
};

/** Payments and charges, newest first. Payments keep their order among themselves. */
export function buildHistoryItems(payments: RentPayment[], charges: RentCharge[]): HistoryItem[] {
  const items: Array<HistoryItem & { ms: number; order: number }> = [
    ...payments.map((payment, order) => ({
      kind: 'payment' as const,
      key: `payment-${payment.id}`,
      payment,
      ms: toDateSafe(payment.createdAt)?.getTime() ?? 0,
      order,
    })),
    ...charges.map((charge, order) => ({
      kind: 'charge' as const,
      key: `charge-${charge.id}`,
      charge,
      ms: chargeMs(charge),
      order: payments.length + order,
    })),
  ];
  if (charges.length > 0) items.sort((x, y) => y.ms - x.ms || x.order - y.order);
  return items.map(({ ms: _ms, order: _order, ...item }) => item as HistoryItem);
}
