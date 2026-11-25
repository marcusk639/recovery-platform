// How a payment record's amount is shown. Records hold whole cents in dollars;
// one without (the webhook's unsupported-currency path writes amountMinorUnits
// instead) showed as "$NaN". It now shows a dash, and an empty CSV cell.

import { netPaidCents } from './money';

type AmountFields = { amount?: number; currency?: string };

/** The record's amount in US cents, or null when it holds none (see above). */
export const dollarCents = ({ amount, currency }: AmountFields): number | null =>
  Number.isInteger(amount) && (!currency || currency.toLowerCase() === 'usd')
    ? (amount as number)
    : null;

export function recordAmountLabel(payment: AmountFields): string {
  const cents = dollarCents(payment);
  return cents === null ? '—' : `$${(cents / 100).toFixed(2)}`;
}

export function recordAmountCsv(payment: AmountFields): string {
  const cents = dollarCents(payment);
  return cents === null ? '' : (cents / 100).toFixed(2);
}

type RecordFields = AmountFields & { status: string; refundedAmountCents?: number };

/** The CSV's refunded dollars: the cumulative refund, empty when the amount is. */
export function recordRefundedCsv(payment: RecordFields): string {
  if (dollarCents(payment) === null) return '';
  const refunded = Number(payment.refundedAmountCents ?? 0);
  return ((Number.isFinite(refunded) ? refunded : 0) / 100).toFixed(2);
}

/** The CSV's net dollars: what the record brought in (netPaidCents, as the dashboard). */
export function recordNetCsv(payment: RecordFields): string {
  return dollarCents(payment) === null ? '' : (netPaidCents(payment) / 100).toFixed(2);
}

/**
 * One CSV cell. Residents set their own names, and staff open these files in
 * Excel, so a cell that starts like a formula (=, +, -, @, tab, return) gets a
 * leading apostrophe, and quotes, commas and line breaks are quoted.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

type ResidentFields = { status?: string; rentOwed?: number; choreFees?: number };

/** Still in the house: what Outstanding, the Overdue card and Balances count. */
export const isCurrentResident = (guest: ResidentFields): boolean =>
  guest.status !== 'discharged' && guest.status !== 'archived';

/** What a resident owes now, in cents; a credit counts as nothing owed. */
export const owedNowCents = (guest: ResidentFields): number =>
  Math.max(0, (guest.rentOwed ?? 0) + (guest.choreFees ?? 0));
