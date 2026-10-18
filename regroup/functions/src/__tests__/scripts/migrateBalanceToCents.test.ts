// src/__tests__/scripts/migrateBalanceToCents.test.ts
//
// The legacy guests.balance (dollars) → rentOwed (integer cents) migration.
// Covers the per-guest verdict, the dry-run default, the --apply write, batch
// flushing, the refusal to overwrite an existing rentOwed, and the non-zero
// exit code.
//
// Firestore is a fake that records batch.update calls — nothing here can
// reach a project, and scriptBootstrap is stubbed so importing is inert.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

jest.mock('firebase-admin', () => {
  const firestore: any = () => ({ collection: jest.fn(), batch: jest.fn() });
  firestore.FieldValue = { delete: () => '__delete' };
  return { firestore };
});

import { classify, main, run } from '../../scripts/migrateBalanceToCents';

function makeDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const updates: Array<{ id: string; update: Record<string, unknown> }> = [];
  /** Number of updates flushed by each commit, in order. */
  const commits: number[] = [];

  const database = {
    collection: jest.fn(() => ({
      get: jest.fn(async () => ({
        docs: docs.map((d) => ({ id: d.id, ref: { id: d.id }, data: () => d.data })),
      })),
    })),
    batch: jest.fn(() => {
      let staged = 0;
      return {
        update: (ref: { id: string }, update: Record<string, unknown>) => {
          updates.push({ id: ref.id, update });
          staged++;
        },
        commit: jest.fn(async () => {
          commits.push(staged);
          staged = 0;
        }),
      };
    }),
  };

  return { database, updates, commits };
}

const asFirestore = (database: unknown) => database as FirebaseFirestore.Firestore;

let exitCodeBefore: typeof process.exitCode;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
  jest.restoreAllMocks();
});

const logged = () => logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

describe('classify', () => {
  it('converts a dollar balance to integer cents', () => {
    expect(classify({ balance: 125.5 })).toEqual({ kind: 'convert', rentOwed: 12550 });
  });

  it('rounds away floating-point noise rather than truncating it', () => {
    // 0.29 * 100 === 28.999999999999996
    expect(classify({ balance: 0.29 })).toEqual({ kind: 'convert', rentOwed: 29 });
  });

  it('skips a guest that has no legacy balance', () => {
    expect(classify({ rentOwed: 50000 })).toEqual({
      kind: 'skip',
      reason: 'no legacy balance',
    });
  });

  it.each([
    ['a string', '500'],
    ['null', null],
    ['NaN', Number.NaN],
  ])('reports a balance that is %s instead of guessing', (_label, balance) => {
    expect(classify({ balance }).kind).toBe('report');
  });

  it('reports a guest that already has rentOwed instead of overwriting it', () => {
    // rentOwed is the live field. A leftover balance beside it is stale, and
    // replacing the current figure with it would silently rewrite what the
    // resident owes.
    const verdict = classify({ balance: 100, rentOwed: 25000 });

    expect(verdict.kind).toBe('report');
  });
});

describe('run', () => {
  const legacy = (id: string, balance: unknown) => ({ id, data: { balance } });

  it('writes nothing in a dry run', async () => {
    const { database, updates, commits } = makeDb([legacy('g1', 500)]);

    const counts = await run(asFirestore(database), false);

    expect(updates).toEqual([]);
    expect(commits).toEqual([]);
    expect(counts).toEqual({ scanned: 1, converted: 1, skipped: 0, reported: 0 });
  });

  it('sets rentOwed in cents and deletes balance when applying', async () => {
    const { database, updates } = makeDb([legacy('g1', 500), { id: 'g2', data: {} }]);

    await run(asFirestore(database), true);

    expect(updates).toEqual([{ id: 'g1', update: { rentOwed: 50000, balance: '__delete' } }]);
  });

  it('flushes a batch at the limit and commits the remainder', async () => {
    const docs = Array.from({ length: 401 }, (_, i) => legacy(`g${i}`, 1));
    const { database, commits } = makeDb(docs);

    await run(asFirestore(database), true);

    expect(commits).toEqual([400, 1]);
  });

  it('never writes a reported guest, and exits non-zero', async () => {
    const { database, updates } = makeDb([
      { id: 'g1', data: { balance: 100, rentOwed: 25000 } },
      legacy('g2', 'oops'),
    ]);

    const counts = await run(asFirestore(database), true);

    expect(updates).toEqual([]);
    expect(counts.reported).toBe(2);
    expect(process.exitCode).toBe(1);
  });

  it('logs document ids for reported guests but never their amounts', async () => {
    const { database } = makeDb([{ id: 'g1', data: { balance: 731.25, rentOwed: 98765 } }]);

    await run(asFirestore(database), false);

    expect(logged()).toContain('g1');
    expect(logged()).not.toMatch(/731|98765/);
  });

  it('leaves the exit code alone when nothing needs a human', async () => {
    const { database } = makeDb([legacy('g1', 500)]);

    await run(asFirestore(database), true);

    expect(process.exitCode).toBeUndefined();
  });
});

describe('main', () => {
  it('is a dry run unless --apply is passed', async () => {
    const { database, updates } = makeDb([{ id: 'g1', data: { balance: 500 } }]);

    await main([], asFirestore(database));

    expect(updates).toEqual([]);
  });

  it('writes with --apply', async () => {
    const { database, updates } = makeDb([{ id: 'g1', data: { balance: 500 } }]);

    await main(['--apply'], asFirestore(database));

    expect(updates).toHaveLength(1);
  });
});
