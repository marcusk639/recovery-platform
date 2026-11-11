// How a payment record's amount is shown. Records hold whole cents in dollars;
// one without (the webhook's unsupported-currency path writes amountMinorUnits
// instead) showed as "$NaN". It now shows a dash, and an empty CSV cell.

type AmountFields = { amount?: number; currency?: string };

const dollarCents = ({ amount, currency }: AmountFields): number | null =>
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
