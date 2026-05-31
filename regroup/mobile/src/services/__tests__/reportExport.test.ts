import { exportPaymentHistoryCSV, exportEESHistoryCSV } from '../reportExport';
import { RentPayment } from '../payments';

const makePayment = (overrides: Partial<RentPayment> = {}): RentPayment => ({
  id: 'pay-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 500,
  status: 'succeeded',
  description: 'Rent Payment',
  createdAt: '2026-05-01T10:00:00.000Z',
  ...overrides,
});

describe('exportPaymentHistoryCSV', () => {
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
