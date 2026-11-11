import { recordAmountCsv, recordAmountLabel } from '../paymentDisplay';

// A record with no whole-cents dollar amount (the webhook's unsupported-currency
// path writes amountMinorUnits instead) showed as "$NaN" in the lists and CSV.
describe('recordAmountLabel', () => {
  it('formats whole cents as dollars', () => {
    expect(recordAmountLabel({ amount: 15000 })).toBe('$150.00');
    expect(recordAmountLabel({ amount: 1999, currency: 'usd' })).toBe('$19.99');
  });

  it('shows a dash for a record with no dollar amount', () => {
    expect(recordAmountLabel({ amountMinorUnits: 900, currency: 'eur' } as any)).toBe('—');
    expect(recordAmountLabel({ amount: 900, currency: 'eur' })).toBe('—');
    expect(recordAmountLabel({ amount: 12.5 })).toBe('—');
  });
});

describe('recordAmountCsv', () => {
  it('is the dollar figure, or empty when there is none', () => {
    expect(recordAmountCsv({ amount: 5000 })).toBe('50.00');
    expect(recordAmountCsv({ currency: 'eur' } as any)).toBe('');
  });
});
