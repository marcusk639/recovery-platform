/**
 * guestImport.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. parseGuestCsv makes no Firebase call
 * and is covered by guestImport.test.ts.
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
import { GuestImportRow, importGuestsFromRows } from '../guestImport';

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
  updatedAt: { __fv: 'serverTimestamp' },
});

beforeEach(() => {
  resetOpLog();
});

describe('importGuestsFromRows', () => {
  it('refuses a missing houseId before writing', async () => {
    await expect(importGuestsFromRows('', [row(1)])).rejects.toThrow('houseId is required');
    expect(getOpLog()).toEqual([]);
  });

  it('returns 0 for no rows without writing', async () => {
    expect(await importGuestsFromRows('h1', [])).toBe(0);
    expect(getOpLog()).toEqual([]);
  });

  it('batch-sets one guests/{auto id} doc per row, then commits once', async () => {
    const imported = await importGuestsFromRows('h1', [row(1), row(2)]);

    expect(imported).toBe(2);
    expect(getOpLog()).toEqual([
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

    expect(await importGuestsFromRows('h1', rows)).toBe(500);

    const ops = getOpLog().map((e) => e.op);
    expect(ops.length).toBe(502);
    expect(ops[499]).toBe('batch.commit');
    expect(ops[500]).toBe('batch.set');
    expect(ops[501]).toBe('batch.commit');
    expect(getOpLog()[500].path).toBe('guests/auto-500');
  });

  it('replaces a commit failure with a generic message and stores nothing', async () => {
    failNext('batch.commit', new Error('denied'));

    await expect(importGuestsFromRows('h1', [row(1)])).rejects.toThrow(
      'Guest import failed. Please check your CSV and try again.',
    );
    expect(readDoc('guests/auto-1')).toBeUndefined();
  });
});
