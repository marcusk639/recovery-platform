// src/__tests__/scripts/migratePaymentCreatedAtToTimestamp.test.ts
//
// The payments.createdAt string -> Timestamp migration: what it converts, what it
// leaves alone, the dry-run/apply split and batch flushing. Firestore is a fake
// that records batch.update calls; scriptBootstrap is stubbed so importing is inert.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

jest.mock('firebase-admin', () => {
  const firestore: any = () => ({ collection: jest.fn(), batch: jest.fn() });
  return { firestore };
});

jest.mock('firebase-admin/firestore', () => {
  class Timestamp {
    constructor(readonly millis: number) {}
    static fromMillis(ms: number) {
      return new Timestamp(ms);
    }
    toMillis() {
      return this.millis;
    }
  }
  return { Timestamp };
});

import { Timestamp } from 'firebase-admin/firestore';
import { classify, main, run } from '../../scripts/migratePaymentCreatedAtToTimestamp';

type Doc = { id: string; data: Record<string, unknown> };

function makeDb(payments: Doc[]) {
  const updates: Array<{ id: string; update: Record<string, unknown> }> = [];
  const commits: number[] = [];
  const database = {
    collection: jest.fn(() => ({
      get: jest.fn(async () => ({
        docs: payments.map((d) => ({ id: d.id, ref: { id: d.id }, data: () => d.data })),
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
  return { database: database as unknown as FirebaseFirestore.Firestore, updates, commits };
}

const ISO = '2026-07-01T12:30:00.000Z';
const PAYMENTS: Doc[] = [
  { id: 'p-iso', data: { createdAt: ISO } },
  { id: 'p-ts', data: { createdAt: Timestamp.fromMillis(5) } },
  { id: 'p-missing', data: {} },
  { id: 'p-junk', data: { createdAt: 'not a date' } },
  { id: 'p-number', data: { createdAt: 1700000000000 } },
];

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => logSpy.mockRestore());

describe('classify', () => {
  it('converts a parseable ISO string to the same instant', () => {
    expect(classify({ createdAt: ISO })).toEqual({ kind: 'convert', millis: Date.parse(ISO) });
  });

  it('leaves a Timestamp alone', () => {
    expect(classify({ createdAt: Timestamp.fromMillis(5) })).toEqual({ kind: 'timestamp' });
  });

  it('reports a missing createdAt without guessing one', () => {
    expect(classify({})).toEqual({ kind: 'missing' });
    expect(classify({ createdAt: null })).toEqual({ kind: 'missing' });
  });

  it('converts a string with an explicit offset to the instant it names', () => {
    const offset = '2026-07-01T07:30:00-05:00';
    expect(classify({ createdAt: offset })).toEqual({ kind: 'convert', millis: Date.parse(ISO) });
  });

  // A zoneless string would be read in the migration host's local time.
  it('reports a string with no time zone instead of guessing one', () => {
    expect(classify({ createdAt: '2026-07-01T12:30:00' })).toEqual({ kind: 'unusable' });
    expect(classify({ createdAt: '2026-07-01' })).toEqual({ kind: 'unusable' });
  });

  it('reports an unparseable string or another type', () => {
    expect(classify({ createdAt: 'not a date' })).toEqual({ kind: 'unusable' });
    expect(classify({ createdAt: 1700000000000 })).toEqual({ kind: 'unusable' });
  });
});

describe('run', () => {
  it('writes nothing on a dry run, and counts every shape', async () => {
    const { database, updates } = makeDb(PAYMENTS);

    const counts = await run(database, false);

    expect(updates).toEqual([]);
    expect(counts).toEqual({
      scanned: 5,
      alreadyTimestamp: 1,
      converted: 1,
      missing: 1,
      unusable: 2,
    });
  });

  it('on --apply rewrites only the string createdAt, as a Timestamp of the same instant', async () => {
    const { database, updates } = makeDb(PAYMENTS);

    await run(database, true);

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('p-iso');
    expect(Object.keys(updates[0].update)).toEqual(['createdAt']);
    const written = updates[0].update.createdAt as Timestamp;
    expect(written).toBeInstanceOf(Timestamp);
    expect(written.toMillis()).toBe(Date.parse(ISO));
  });

  it('is a no-op when re-run after applying', async () => {
    const converted = { createdAt: Timestamp.fromMillis(Date.parse(ISO)) };
    const { database, updates } = makeDb([{ id: 'p-iso', data: converted }]);

    const counts = await run(database, true);

    expect(updates).toEqual([]);
    expect(counts.converted).toBe(0);
  });

  it('flushes a full batch and then the remainder', async () => {
    const many: Doc[] = Array.from({ length: 401 }, (_, i) => ({
      id: `p${i}`,
      data: { createdAt: ISO },
    }));
    const { database, commits } = makeDb(many);

    await run(database, true);

    expect(commits).toEqual([400, 1]);
  });

  it('lists the documents it left alone by id only', async () => {
    const { database } = makeDb(PAYMENTS);

    await run(database, false);

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('p-missing');
    expect(logged).toContain('p-junk');
    expect(logged).not.toContain('not a date');
  });
});

describe('main', () => {
  it('applies only with --apply', async () => {
    const dry = makeDb([{ id: 'p-iso', data: { createdAt: ISO } }]);
    await main([], dry.database);
    expect(dry.updates).toEqual([]);

    const live = makeDb([{ id: 'p-iso', data: { createdAt: ISO } }]);
    await main(['--apply'], live.database);
    expect(live.updates).toHaveLength(1);
  });
});
