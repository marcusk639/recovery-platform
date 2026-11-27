/**
 * guestImport.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. parseGuestCsv makes no Firebase call
 * and is covered by guestImport.test.ts.
 *
 * importGuestsFromRows, which these cases first pinned, had no callers left
 * after #306 and was removed (2026-11-27); they now pin importGuests, the
 * import GuestImportScreen runs, which writes the same records in the same
 * batches after reading the house's guest records once.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, readDoc, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import { GuestImportRow, importGuests } from '../guestImport';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

const row = (n: number): GuestImportRow => ({
  firstName: `F${n}`,
  lastName: `L${n}`,
  email: `g${n}@example.com`,
  sobrietyDate: '2026-01-01',
  drugOfChoice: 'none',
});

const guestDoc = (id: string, n: number) => ({
  ...row(n),
  id,
  houseId: 'h1',
  displayName: `F${n} L${n}`,
  status: 'active',
  isAdmin: false,
  infoEntered: false,
  hasJob: false,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  version: 0,
  phase: 'default',
  step: 1,
  createdAt: ISO,
  // From main (rent charges, #212): rent charging starts an imported resident at
  // the next full period. No createdBy here: the mock has no signed-in user.
  importedAt: ISO,
  updatedAt: { __fv: 'serverTimestamp' },
});

beforeEach(() => {
  resetOpLog();
});

// importGuests reads the house's guest records first, to skip anyone on file.
const houseRead = { op: 'getDocs', path: 'guests', constraints: [['where', 'houseId', '==', 'h1']] };

describe('importGuests', () => {
  it('refuses a missing houseId before reading or writing', async () => {
    await expect(importGuests('', [row(1)])).rejects.toThrow('houseId is required');
    expect(getOpLog()).toEqual([]);
  });

  it('imports nothing for no rows, and writes nothing', async () => {
    expect(await importGuests('h1', [])).toEqual({ imported: 0, alreadyResidents: 0, failed: 0 });
    expect(getOpLog()).toEqual([houseRead]);
  });

  it('batch-sets one guests/{auto id} doc per row, then commits once', async () => {
    const result = await importGuests('h1', [row(1), row(2)]);

    expect(result).toEqual({ imported: 2, alreadyResidents: 0, failed: 0 });
    expect(getOpLog()).toEqual([
      houseRead,
      { op: 'batch.set', path: 'guests/auto-1', data: guestDoc('auto-1', 1) },
      { op: 'batch.set', path: 'guests/auto-2', data: guestDoc('auto-2', 2) },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('guests/auto-2')).toEqual(
      expect.objectContaining({ id: 'auto-2', houseId: 'h1', status: 'active' }),
    );
  });

  it('splits more than 499 rows into batches of 499', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => row(i));

    expect((await importGuests('h1', rows)).imported).toBe(500);

    const ops = getOpLog().map((e) => e.op);
    expect(ops.length).toBe(503);
    expect(ops[500]).toBe('batch.commit');
    expect(ops[501]).toBe('batch.set');
    expect(ops[502]).toBe('batch.commit');
    expect(getOpLog()[501].path).toBe('guests/auto-500');
  });

  it('reports a commit failure as failed rows and stores nothing', async () => {
    failNext('batch.commit', new Error('denied'));

    expect(await importGuests('h1', [row(1)])).toEqual({
      imported: 0,
      alreadyResidents: 0,
      failed: 1,
    });
    expect(readDoc('guests/auto-1')).toBeUndefined();
  });
});
