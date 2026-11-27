// Mocks (hoisted — must be before imports). The import cases run against the
// operation log (importGuests reads the house's guest records, then writes).
jest.mock('../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import { parseGuestCsv, importGuests, GuestImportRow, GuestCsvError } from '../guestImport';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);
const written = () => getOpLog().filter((e) => e.op === 'batch.set').map((e) => e.data as any);

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

// importGuestsFromRows, which these cases first pinned, had no callers left
// after #306 and was removed (2026-11-27); they now pin importGuests.
describe('importGuests: the records it writes', () => {
  beforeEach(() => {
    resetOpLog();
    setCurrentUser({ uid: 'admin-1' });
  });
  afterEach(() => setCurrentUser(null));

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
    const result = await importGuests('house-1', rows);
    expect(result).toEqual({ imported: 1, alreadyResidents: 0, failed: 0 });
    expect(getOpLog().map((e) => e.op)).toContain('batch.commit');
  });

  it('marks each record as imported, so rent charging starts it at the next full period', async () => {
    // The server reads importedAt (rent/chargeRule.ts): an imported resident already
    // lived there, and their balance was entered by hand, so no prorated first charge.
    const before = Date.now();
    await importGuests('house-1', [
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        sobrietyDate: '2025-01-15',
        drugOfChoice: 'Alcohol',
      },
    ]);
    const [record] = written();
    expect(typeof record.importedAt).toBe('string');
    expect(Date.parse(record.importedAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('records the signed-in staff member as createdBy on every imported record', async () => {
    const row = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      sobrietyDate: '2025-01-15',
      drugOfChoice: 'Alcohol',
    };
    await importGuests('house-1', [row, { ...row, email: 'jo@example.com' }]);
    expect(written().map((g) => g.createdBy)).toEqual(['admin-1', 'admin-1']);
  });

  it('returns 0 when given empty rows', async () => {
    const result = await importGuests('house-1', []);
    expect(result.imported).toBe(0);
  });
});

// P5 Task 17: quoted fields (an RFC 4180 subset) and a missing column the
// screen can name.
describe('parseGuestCsv: quoted fields and missing columns', () => {
  const HEADER = 'firstName,lastName,email,sobrietyDate,drugOfChoice';

  it('keeps a quoted field with a comma as one field', () => {
    const rows = parseGuestCsv(
      [HEADER, 'Sam,"Smith, Jr.",sam@example.com,2025-01-15,Alcohol'].join('\n'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lastName).toBe('Smith, Jr.');
    expect(rows[0].email).toBe('sam@example.com');
  });

  it('reads a doubled quote inside a quoted field as one quote', () => {
    const rows = parseGuestCsv(
      [HEADER, '"Al ""Ace""",Jones,al@example.com,2025-01-15,Alcohol'].join('\n'),
    );
    expect(rows[0].firstName).toBe('Al "Ace"');
  });

  it('reads Windows line endings', () => {
    const rows = parseGuestCsv(
      [HEADER, 'Jane,Smith,jane@example.com,2025-01-15,Alcohol', ''].join('\r\n'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].drugOfChoice).toBe('Alcohol');
  });

  it('names one missing column', () => {
    expect(() =>
      parseGuestCsv(
        'firstName,lastName,email,sobrietyDate\nJane,Smith,jane@example.com,2025-01-15',
      ),
    ).toThrow('Missing column: drugOfChoice');
  });

  it('names every missing column', () => {
    expect(() => parseGuestCsv('firstName,lastName,email\nJane,Smith,jane@example.com')).toThrow(
      'Missing columns: sobrietyDate, drugOfChoice',
    );
  });

  // Review: Excel's "CSV UTF-8" export starts with a byte-order mark.
  it('ignores a UTF-8 byte-order mark before the header', () => {
    const rows = parseGuestCsv(
      '\uFEFF' + [HEADER, 'Jane,Smith,jane@example.com,2025-01-15,Alcohol'].join('\n'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe('Jane');
  });

  // Review: an unclosed quote used to swallow the rest of the file silently.
  it('refuses a field whose quote is never closed', () => {
    expect(() =>
      parseGuestCsv(
        [HEADER, 'Sam,"Smith, Jr.,sam@example.com,2025-01-15,Alcohol', 'Bo,B,b@x.com,2025-01-01,X'].join('\n'),
      ),
    ).toThrow(new GuestCsvError('A quoted field is never closed. Check the quotes in the file.'));
  });

  it('marks the error as a CSV problem, not a read failure', () => {
    let caught: unknown;
    try {
      parseGuestCsv('firstName\nJane');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GuestCsvError);
    expect((caught as Error).name).toBe('GuestCsvError');
  });
});
