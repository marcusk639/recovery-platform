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

// ─── Rent charges (rent spec §4.5): shown beside payments in Payment History ───

type ChargeFields = {
  firstDay: string;
  lastDay: string;
  daysCovered: number;
  daysInPeriod: number;
  rateSource: 'house' | 'custom';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A house-local YYYY-MM-DD as numbers, never parsed through a zone. */
export const dayParts = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
};

/** "Rent, Nov 16–22", "Rent, Nov 30–Dec 6": calendar dates, never shifted by a zone. */
export function chargeLabel(c: ChargeFields): string {
  const a = dayParts(c.firstDay);
  const b = dayParts(c.lastDay);
  const start = `${MONTHS[a.m - 1]} ${a.d}`;
  if (c.firstDay === c.lastDay) return `Rent, ${start}`;
  const end = a.m === b.m && a.y === b.y ? `${b.d}` : `${MONTHS[b.m - 1]} ${b.d}`;
  return `Rent, ${start}–${end}`;
}

/** "5 of 7 days" for a prorated charge, "own rate" for a custom one; '' otherwise. */
export function chargeDetail(c: ChargeFields): string {
  const bits: string[] = [];
  if (c.daysCovered < c.daysInPeriod) bits.push(`${c.daysCovered} of ${c.daysInPeriod} days`);
  if (c.rateSource === 'custom') bits.push('own rate');
  return bits.join(' · ');
}
