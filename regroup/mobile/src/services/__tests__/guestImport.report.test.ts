/**
 * The CSV import's report and its retry (review of #306, 2026-11-27): no
 * row is dropped without a reason, and a retry after a partial failure
 * never adds a resident twice.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import { GuestCsvError, GuestImportRow, importGuests, parseGuestCsvReport } from '../guestImport';
import { MAX_IMPORT_ROWS } from '../guestImportRules';

const HEADER = 'firstName,lastName,email,sobrietyDate,drugOfChoice,moveInDate';
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n');

describe('parseGuestCsvReport', () => {
  it('reports each skipped row with its number and reason', () => {
    const report = parseGuestCsvReport(
      csv(
        'Jane,Smith,jane@example.com,2025-01-15,Alcohol,',
        'Bad,Date,bad@example.com,someday,Alcohol,',
        'Dup,Case,JANE@example.com,2025-01-15,Alcohol,',
        `${'x'.repeat(101)},Long,long@example.com,2025-01-15,Alcohol,`,
        'No,Email,,2025-01-15,Alcohol,',
        'Move,In,move@example.com,2025-01-15,Alcohol,31/31/2025',
      ),
    );
    expect(report.rows.map((r) => r.email)).toEqual(['jane@example.com']);
    expect(report.skipped).toEqual([
      { row: 2, reason: 'sobrietyDate is not a date (use YYYY-MM-DD)' },
      { row: 3, reason: 'email appears earlier in the file' },
      { row: 4, reason: 'firstName is longer than 100 characters' },
      { row: 5, reason: 'missing email' },
      { row: 6, reason: 'moveInDate is not a date (use YYYY-MM-DD)' },
    ]);
  });

  it('stores dates as YYYY-MM-DD', () => {
    const [row] = parseGuestCsvReport(
      csv('Jane,Smith,jane@example.com,3/7/2024,Alcohol,4/1/2025'),
    ).rows;
    expect(row).toMatchObject({ sobrietyDate: '2024-03-07', moveInDate: '2025-04-01' });
  });

  it(`refuses a file of more than ${MAX_IMPORT_ROWS} residents`, () => {
    const lines = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, i) => `F${i},L${i},g${i}@example.com,2025-01-15,Alcohol,`,
    );
    expect(() => parseGuestCsvReport(csv(...lines))).toThrow(GuestCsvError);
    expect(() => parseGuestCsvReport(csv(...lines))).toThrow(
      `The file has ${MAX_IMPORT_ROWS + 1} residents. Import at most ${MAX_IMPORT_ROWS} at a time.`,
    );
    expect(parseGuestCsvReport(csv(...lines.slice(1))).rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});

const row = (n: number, email = `g${n}@example.com`): GuestImportRow => ({
  firstName: `F${n}`,
  lastName: `L${n}`,
  email,
  sobrietyDate: '2026-01-01',
  drugOfChoice: 'none',
});

describe('importGuests', () => {
  beforeEach(() => resetOpLog());

  it("skips anyone already a resident of the house, whatever the email's case", async () => {
    seedDoc('guests/existing', { houseId: 'h1', email: 'G1@Example.com' });
    seedDoc('guests/elsewhere', { houseId: 'h2', email: 'g2@example.com' });

    const result = await importGuests('h1', [row(1), row(2)]);

    expect(result).toEqual({ imported: 1, alreadyResidents: 1, failed: 0 });
    expect(getOpLog()[0]).toEqual({
      op: 'getDocs',
      path: 'guests',
      constraints: [['where', 'houseId', '==', 'h1']],
    });
    const written = getOpLog().filter((e) => e.op === 'batch.set');
    expect(written).toHaveLength(1);
    expect(written[0].data).toMatchObject({ email: 'g2@example.com', houseId: 'h1' });
  });

  // The count is "already on file", not "already residents": a departed
  // resident's record has the email too, and is not re-added.
  it("counts a departed resident's record as already on file", async () => {
    seedDoc('guests/left', { houseId: 'h1', email: 'g1@example.com', status: 'departed' });

    const result = await importGuests('h1', [row(1), row(2)]);

    expect(result).toEqual({ imported: 1, alreadyResidents: 1, failed: 0 });
  });

  it('reports a partial import, and a retry adds only what is missing', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => row(i));
    failNext('batch.commit', new Error('denied'), undefined, { after: 1 });

    const first = await importGuests('h1', rows);
    expect(first).toEqual({ imported: 499, alreadyResidents: 0, failed: 101 });

    // Keep the written guests; clear only the log.
    require('../../../__mocks__/firebase-modular/log').state.log = [];
    const retry = await importGuests('h1', rows);
    expect(retry).toEqual({ imported: 101, alreadyResidents: 499, failed: 0 });
    expect(readDoc('guests/auto-1')).toBeDefined();
  });

  it('refuses to guess when it cannot read the house residents', async () => {
    failNext('getDocs', new Error('denied'));
    await expect(importGuests('h1', [row(1)])).rejects.toThrow(
      "Could not check the house's residents. Please try again.",
    );
    expect(getOpLog().some((e) => e.op === 'batch.set')).toBe(false);
  });
});
