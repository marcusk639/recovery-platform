// Mocks (hoisted — must be before imports)
jest.mock('../../firebase-setup', () => {
  const mockBatchSet = jest.fn();
  const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
  const mockDoc = jest.fn(() => ({ id: 'new-guest-id' }));
  return {
    firestore: {
      batch: jest.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit })),
      collection: jest.fn(() => ({ doc: mockDoc })),
      _mockBatchSet: mockBatchSet,
      _mockBatchCommit: mockBatchCommit,
    },
  };
});

jest.mock('../guest', () => ({
  guestCollection: {
    doc: jest.fn(() => ({ id: 'new-guest-id' })),
  },
  createGuestId: jest.fn(() => 'new-guest-id'),
}));

import { firestore } from '../../firebase-setup';
import {
  parseGuestCsv,
  importGuestsFromRows,
  GuestImportRow,
} from '../guestImport';

describe('parseGuestCsv', () => {
  it('parses a valid CSV string into import rows', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      'Jane,Smith,jane@example.com,2025-01-15,Alcohol',
      'Bob,Jones,bob@example.com,2024-06-01,Opioids',
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      sobrietyDate: '2025-01-15',
      drugOfChoice: 'Alcohol',
    });
  });

  it('skips rows missing required fields', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      ',Smith,jane@example.com,2025-01-15,Alcohol',
      'Bob,Jones,bad-email,2024-06-01,Opioids',
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it('trims whitespace from values', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      ' Jane , Smith , jane@example.com , 2025-01-15 , Alcohol ',
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows[0].firstName).toBe('Jane');
    expect(rows[0].email).toBe('jane@example.com');
  });

  it('sanitizes formula-injection prefixes in string fields', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      '=EVIL,Smith,jane@example.com,2025-01-15,+Alcohol',
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows[0].firstName).toBe("'=EVIL");
    expect(rows[0].drugOfChoice).toBe("'+Alcohol");
  });
});

describe('importGuestsFromRows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ((firestore as any)._mockBatchCommit as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  it('returns count of guests imported', async () => {
    const rows: GuestImportRow[] = [
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        sobrietyDate: '2025-01-15',
        drugOfChoice: 'Alcohol',
      },
    ];
    const count = await importGuestsFromRows('house-1', rows);
    expect(count).toBe(1);
    expect((firestore as any)._mockBatchCommit).toHaveBeenCalled();
  });

  it('returns 0 when given empty rows', async () => {
    const count = await importGuestsFromRows('house-1', []);
    expect(count).toBe(0);
  });
});
