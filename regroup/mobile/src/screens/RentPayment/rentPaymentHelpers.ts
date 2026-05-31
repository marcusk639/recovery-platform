/** Format a dollar amount as a USD string, e.g. 150 → "$150.00" */
export function formatCurrency(amountInDollars: number): string {
  return `$${Math.abs(amountInDollars).toFixed(2)}`;
}

/** Convert cents to dollars and format, e.g. 15000 → "$150.00" */
export function formatCentsAsCurrency(amountInCents: number): string {
  return formatCurrency(amountInCents / 100);
}

import { toDateSafe } from '../../util/firestore';

/**
 * Derive a user-friendly date string from any Firestore-like timestamp
 * (ISO string, Firestore Timestamp, {seconds}, Date, epoch ms). Returns
 * an em-dash when the input is not parseable as a date rather than
 * leaking the raw unparseable value to the UI.
 */
export function formatDate(value: unknown): string {
  const d = toDateSafe(value);
  if (!d) {
    return '—';
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
