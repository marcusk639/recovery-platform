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

import { csvCell, isCurrentResident, owedNowCents } from '../paymentDisplay';

// Residents set their own names, and staff open these files in Excel (review).
describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Test GuestA')).toBe('Test GuestA');
  });

  it('quotes commas, quotes and line breaks, doubling the quotes', () => {
    expect(csvCell('Doe, Jane')).toBe('"Doe, Jane"');
    expect(csvCell('Jane "JJ" Doe')).toBe('"Jane ""JJ"" Doe"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it("stops a cell from running as a formula", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('isCurrentResident and owedNowCents', () => {
  it('leaves out residents who left, and adds chore fees to rent', () => {
    expect(isCurrentResident({ status: 'active' })).toBe(true);
    expect(isCurrentResident({})).toBe(true);
    expect(isCurrentResident({ status: 'discharged' })).toBe(false);
    expect(isCurrentResident({ status: 'archived' })).toBe(false);
    expect(owedNowCents({ rentOwed: 15000, choreFees: 500 })).toBe(15500);
    expect(owedNowCents({ rentOwed: -5000 })).toBe(0);
  });
});
