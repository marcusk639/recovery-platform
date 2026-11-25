import { exportPaymentHistoryCSV, exportEESHistoryCSV } from '../reportExport';
import { RentPayment } from '../payments';

const makePayment = (overrides: Partial<RentPayment> = {}): RentPayment => ({
  id: 'pay-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 50000,
  status: 'succeeded',
  description: 'Rent Payment',
  createdAt: '2026-05-01T10:00:00.000Z',
  ...overrides,
});

describe('exportPaymentHistoryCSV', () => {
  // Rent charges (rent spec §4.5): the same columns, money owed rather than paid.
  const rentCharge = {
    id: 'guest-1_2026-11-16',
    guestId: 'guest-1',
    houseId: 'house-1',
    amountCents: 12500,
    daysCovered: 5,
    daysInPeriod: 7,
    firstDay: '2026-11-18',
    lastDay: '2026-11-22',
    rateSource: 'house',
  } as any;

  it('exports a rent charge as a negative-direction row, prorated days in the description', () => {
    const csv = exportPaymentHistoryCSV([], { 'guest-1': 'Jane Smith' }, [rentCharge]);
    expect(csv.split('\n')[1]).toBe(
      '2026-11-18,Jane Smith,-125.00,,-125.00,Rent charge,Rent, Nov 18–22 (5 of 7 days)'.replace(
        'Rent, Nov 18–22 (5 of 7 days)',
        '"Rent, Nov 18–22 (5 of 7 days)"',
      ),
    );
  });

  it('puts charges and payments in date order, newest first, with the header unchanged', () => {
    const csv = exportPaymentHistoryCSV(
      [makePayment({ createdAt: '2026-11-25T10:00:00.000Z' }), makePayment({ id: 'p0', createdAt: '2026-11-10T10:00:00.000Z' })],
      {},
      [rentCharge],
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Guest,Amount ($),Refunded ($),Net ($),Status,Description');
    expect(lines.slice(1).map((l) => l.slice(0, 10))).toEqual(['2026-11-25', '2026-11-18', '2026-11-10']);
  });

  it('returns a CSV string with header row', () => {
    const csv = exportPaymentHistoryCSV([makePayment()], {});
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Date');
    expect(lines[0]).toContain('Guest');
    expect(lines[0]).toContain('Amount');
    expect(lines[0]).toContain('Status');
  });

  it('formats each payment as a data row', () => {
    const guestNames: Record<string, string> = { 'guest-1': 'Jane Smith' };
    const csv = exportPaymentHistoryCSV([makePayment()], guestNames);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('Jane Smith');
    expect(lines[1]).toContain('500');
    expect(lines[1]).toContain('succeeded');
  });

  // The Firestore records this exports hold cents and a Timestamp. A Timestamp threw
  // here, so one card payment broke the whole export.
  it('exports a Firestore Timestamp date', () => {
    const createdAt = { toDate: () => new Date(2026, 10, 3, 12) } as unknown as RentPayment['createdAt'];
    const csv = exportPaymentHistoryCSV([makePayment({ createdAt })], {});
    expect(csv.split('\n')[1]).toMatch(/^2026-11-03,/);
  });

  it('exports dollars under the dollar heading', () => {
    const csv = exportPaymentHistoryCSV([makePayment({ amount: 50000 })], {});
    expect(csv.split('\n')[1]).toContain(',500.00,');
  });

  it('exports a refunded payment as refunded', () => {
    const csv = exportPaymentHistoryCSV([makePayment({ refundedAmountCents: 50000 })], {});
    expect(csv.split('\n')[1]).toContain(',refunded,');
    expect(csv).not.toContain('succeeded');
  });

  it('handles unknown guest IDs gracefully', () => {
    const csv = exportPaymentHistoryCSV([makePayment()], {});
    expect(csv).toContain('guest-1');
  });

  it('returns only the header when given an empty array', () => {
    const csv = exportPaymentHistoryCSV([], {});
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('escapes fields containing commas', () => {
    const guestNames = { 'guest-1': 'Smith, Jane' };
    const csv = exportPaymentHistoryCSV([makePayment()], guestNames);
    expect(csv).toContain('"Smith, Jane"');
  });

  it('escapes fields containing double-quotes', () => {
    const guestNames = { 'guest-1': 'Jane "JJ" Smith' };
    const csv = exportPaymentHistoryCSV([makePayment()], guestNames);
    expect(csv).toContain('"Jane ""JJ"" Smith"');
  });

  // Payment History exports Firestore records, whose createdAt is a Timestamp
  // (the webhook's serverTimestamp, the app's newPaymentCreatedAt, #168).
  it('dates a row whose createdAt is a Firestore Timestamp', () => {
    const timestamp = { toDate: () => new Date('2026-05-01T10:00:00.000Z') };
    const csv = exportPaymentHistoryCSV([makePayment({ createdAt: timestamp as any })], {});
    expect(csv.split('\n')[1]).toMatch(/^2026-05-01,/);
  });

  // Staff sum these columns in a spreadsheet. A refund or a failed or pending
  // attempt leaves Amount at the gross figure, so the file also says what was
  // refunded and what the record brought in (netPaidCents, as the dashboard).
  describe('refunded and net columns', () => {
    const row = (overrides: Partial<RentPayment>) =>
      exportPaymentHistoryCSV([makePayment(overrides)], {}).split('\n')[1];

    it('heads the columns after Amount', () => {
      const header = exportPaymentHistoryCSV([], {}).split('\n')[0];
      expect(header).toBe('Date,Guest,Amount ($),Refunded ($),Net ($),Status,Description');
    });

    it('shows a partial refund and what is left', () => {
      expect(row({ amount: 50000, refundedAmountCents: 20000 })).toContain(
        ',500.00,200.00,300.00,partially refunded,',
      );
    });

    it('counts a full refund as nothing brought in', () => {
      expect(row({ amount: 50000, refundedAmountCents: 50000 })).toContain(',500.00,500.00,0.00,refunded,');
    });

    it('counts a failed or pending attempt as nothing brought in', () => {
      expect(row({ amount: 50000, status: 'failed' })).toContain(',500.00,0.00,0.00,failed,');
      expect(row({ amount: 50000, status: 'pending' })).toContain(',500.00,0.00,0.00,pending,');
    });

    it('leaves all three empty for a record with no dollar amount', () => {
      expect(row({ amount: undefined as any, currency: 'eur' })).toContain(',,,,');
    });
  });

  it('leaves the date empty when createdAt cannot be read', () => {
    const csv = exportPaymentHistoryCSV([makePayment({ createdAt: { bogus: true } as any })], {});
    expect(csv.split('\n')[1]).toMatch(/^,/);
  });
});

describe('exportEESHistoryCSV', () => {
  const makeRecord = () => ({
    id: 'ees-1',
    guestId: 'guest-1',
    type: 'Medical',
    amount: 250,
    date: '2026-05-01',
    notes: 'Emergency dental',
  });

  it('returns a CSV string with header row', () => {
    const csv = exportEESHistoryCSV([makeRecord()], {});
    expect(csv.split('\n')[0]).toContain('Date');
    expect(csv.split('\n')[0]).toContain('Guest');
    expect(csv.split('\n')[0]).toContain('Type');
    expect(csv.split('\n')[0]).toContain('Amount');
  });

  it('returns only header for empty array', () => {
    const csv = exportEESHistoryCSV([], {});
    expect(csv.trim().split('\n')).toHaveLength(1);
  });
});

describe('exportPaymentHistoryCSV safety (review)', () => {
  it('stops a description from running as a formula', () => {
    const csv = exportPaymentHistoryCSV([makePayment({ description: '=cmd' } as any)], {});
    expect(csv.split('\n')[1]).toContain("'=cmd");
  });

  it('leaves the amount empty for a record with no dollar amount', () => {
    const csv = exportPaymentHistoryCSV([makePayment({ amount: 900, currency: 'eur' } as any)], {});
    expect(csv.split('\n')[1].split(',')[2]).toBe('');
  });
});
