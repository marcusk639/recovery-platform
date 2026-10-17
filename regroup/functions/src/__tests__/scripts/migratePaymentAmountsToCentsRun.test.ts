// src/__tests__/scripts/migratePaymentAmountsToCentsRun.test.ts
//
// Covers the driver: the mandatory --deployed-at guard, the dry-run/apply
// split, batch flushing, the idempotency marker and the non-zero exit code.
// The unit discriminator itself is covered in
// migratePaymentAmountsToCents.test.ts.
//
// Firestore is a fake that records batch.update calls — nothing here can
// reach a project, and scriptBootstrap is stubbed so importing is inert.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

jest.mock('firebase-admin', () => {
  const firestore: any = () => ({ collection: jest.fn(), batch: jest.fn() });
  firestore.FieldValue = { serverTimestamp: () => '__serverTimestamp' };
  return { firestore };
});

import { main, run } from '../../scripts/migratePaymentAmountsToCents';

const CUTOFF = Date.parse('2026-10-16T00:00:00.000Z');
const BEFORE = '2026-10-15T00:00:00.000Z';
const AFTER = '2026-10-17T00:00:00.000Z';
const CUTOFF_ISO = new Date(CUTOFF).toISOString();

/** A pre-deploy webhook doc holding dollars — rule 2 converts it. */
const dollarsDoc = (amount = 500) => ({
  amount,
  stripePaymentIntentId: 'pi_x',
  status: 'succeeded',
  updatedAt: BEFORE,
});

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

beforeEach(() => {
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
  jest.restoreAllMocks();
});

describe('main — refuses to touch Firestore without a usable cutoff', () => {
  it.each([
    ['no flag', [] as string[]],
    ['unparseable flag', ['--deployed-at=monday']],
    ['future flag', [`--deployed-at=${new Date(Date.now() + 86_400_000).toISOString()}`]],
  ])('refuses on %s', async (_label, argv) => {
    const { database, updates } = makeDb([{ id: 'p1', data: dollarsDoc() }]);

    await main([...argv, '--apply'], asFirestore(database));

    expect(database.collection).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });

  it('runs once the cutoff is valid', async () => {
    const { database, updates } = makeDb([{ id: 'p1', data: dollarsDoc() }]);

    await main([`--deployed-at=${CUTOFF_ISO}`, '--apply'], asFirestore(database));

    expect(database.collection).toHaveBeenCalledWith('payments');
    expect(updates).toEqual([
      { id: 'p1', update: { amount: 50000, amountMigratedToCentsAt: '__serverTimestamp' } },
    ]);
  });

  it('honours the absence of --apply', async () => {
    const { database, updates } = makeDb([{ id: 'p1', data: dollarsDoc() }]);

    await main([`--deployed-at=${CUTOFF_ISO}`], asFirestore(database));

    expect(updates).toHaveLength(0);
  });
});

describe('run', () => {
  it('writes nothing on a dry run but still counts the work', async () => {
    const { database, updates, commits } = makeDb([
      { id: 'p1', data: dollarsDoc() },
      { id: 'p2', data: { amount: 50000, status: 'succeeded', currency: 'usd' } },
    ]);

    const counts = await run(asFirestore(database), false, CUTOFF);

    expect(updates).toHaveLength(0);
    expect(commits).toHaveLength(0);
    expect(counts).toMatchObject({ scanned: 2, dollarsConverted: 1, alreadyCents: 1 });
  });

  it('writes the converted amount and the marker on --apply', async () => {
    const { database, updates, commits } = makeDb([{ id: 'p1', data: dollarsDoc(19.99) }]);

    await run(asFirestore(database), true, CUTOFF);

    expect(updates).toEqual([
      { id: 'p1', update: { amount: 1999, amountMigratedToCentsAt: '__serverTimestamp' } },
    ]);
    expect(commits).toEqual([1]);
  });

  it('marks an already-cents document without rewriting its amount', async () => {
    const { database, updates } = makeDb([
      { id: 'p1', data: { amount: 50000, status: 'succeeded', currency: 'usd' } },
    ]);

    await run(asFirestore(database), true, CUTOFF);

    expect(updates).toEqual([
      { id: 'p1', update: { amountMigratedToCentsAt: '__serverTimestamp' } },
    ]);
    expect(updates[0].update).not.toHaveProperty('amount');
  });

  it('flushes at the 400-document batch boundary and again at the end', async () => {
    const docs = Array.from({ length: 401 }, (_unused, i) => ({
      id: `p${i}`,
      data: dollarsDoc(),
    }));
    const { database, updates, commits } = makeDb(docs);

    await run(asFirestore(database), true, CUTOFF);

    expect(updates).toHaveLength(401);
    expect(commits).toEqual([400, 1]);
    // A fresh batch per flush: the committed one must not be reused.
    expect(database.batch).toHaveBeenCalledTimes(2);
  });

  it('commits exactly once when the document count lands on the boundary', async () => {
    const docs = Array.from({ length: 400 }, (_unused, i) => ({
      id: `p${i}`,
      data: dollarsDoc(),
    }));
    const { database, commits } = makeDb(docs);

    await run(asFirestore(database), true, CUTOFF);

    expect(commits).toEqual([400]);
  });

  it('skips and reports without writing, and exits non-zero when it reported', async () => {
    const { database, updates } = makeDb([
      { id: 'p1', data: { amount: 500, currency: 'eur', status: 'succeeded' } },
      {
        id: 'p2',
        data: { amount: 50000, amountMigratedToCentsAt: '2026-10-01', status: 'succeeded' },
      },
    ]);

    const counts = await run(asFirestore(database), true, CUTOFF);

    expect(updates).toHaveLength(0);
    expect(counts).toMatchObject({ scanned: 2, reported: 1, skipped: 1 });
    expect(process.exitCode).toBe(1);
  });

  it('leaves the exit code alone when nothing needed a human', async () => {
    const { database } = makeDb([{ id: 'p1', data: dollarsDoc() }]);

    await run(asFirestore(database), true, CUTOFF);

    expect(process.exitCode).toBeUndefined();
  });

  it('reports — and refuses to write — a post-cutoff webhook document', async () => {
    const { database, updates } = makeDb([
      { id: 'p1', data: { ...dollarsDoc(), updatedAt: AFTER } },
    ]);

    const counts = await run(asFirestore(database), true, CUTOFF);

    expect(updates).toHaveLength(0);
    expect(counts).toMatchObject({ reported: 1, dollarsConverted: 0 });
    expect(process.exitCode).toBe(1);
  });
});
