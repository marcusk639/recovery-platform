// src/__tests__/scripts/backfillPaymentGuestUserId.test.ts
//
// The payments.guestUserId backfill: what it sets, what it leaves alone, the
// dry-run/apply split, batch flushing, and that it never logs a uid.
// Firestore is a fake that records batch.update calls; scriptBootstrap is
// stubbed so importing is inert.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

jest.mock('firebase-admin', () => {
  const firestore: any = () => ({ collection: jest.fn(), batch: jest.fn() });
  return { firestore };
});

import { classify, main, run } from '../../scripts/backfillPaymentGuestUserId';

type Doc = { id: string; data: Record<string, unknown> };

function makeDb(payments: Doc[], guests: Record<string, Record<string, unknown>>) {
  const updates: Array<{ id: string; update: Record<string, unknown> }> = [];
  const commits: number[] = [];
  const guestReads: string[] = [];

  const database = {
    collection: jest.fn((name: string) =>
      name === 'payments'
        ? {
            get: jest.fn(async () => ({
              docs: payments.map((d) => ({ id: d.id, ref: { id: d.id }, data: () => d.data })),
            })),
          }
        : {
            doc: (id: string) => ({
              get: jest.fn(async () => {
                guestReads.push(id);
                return { exists: id in guests, data: () => guests[id] };
              }),
            }),
          },
    ),
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
  return {
    database: database as unknown as FirebaseFirestore.Firestore,
    updates,
    commits,
    guestReads,
  };
}

const GUESTS = {
  g1: { userId: 'uid-1', houseId: 'h1' },
  g2: { userId: '', houseId: 'h1' },
  g3: { houseId: 'h1' },
};

const PAYMENTS: Doc[] = [
  { id: 'p-set', data: { guestId: 'g1', houseId: 'h1' } },
  { id: 'p-set-2', data: { guestId: 'g1', houseId: 'h1' } },
  { id: 'p-has', data: { guestId: 'g1', houseId: 'h1', guestUserId: 'uid-keep' } },
  { id: 'p-null-guest', data: { guestId: null, houseId: 'h1' } },
  { id: 'p-empty-user', data: { guestId: 'g2', houseId: 'h1' } },
  { id: 'p-no-user', data: { guestId: 'g3', houseId: 'h1' } },
  { id: 'p-gone', data: { guestId: 'g-deleted', houseId: 'h1' } },
];

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => logSpy.mockRestore());

describe('classify', () => {
  const lookup = (id: string) =>
    id in GUESTS ? (GUESTS as Record<string, { userId?: string }>)[id].userId : null;

  it('sets the guest doc userId when the payment has none', () => {
    expect(classify({ guestId: 'g1' }, lookup)).toEqual({ kind: 'set', guestUserId: 'uid-1' });
  });

  it('never overwrites an existing guestUserId', () => {
    expect(classify({ guestId: 'g1', guestUserId: 'other' }, lookup)).toEqual({ kind: 'has-uid' });
  });

  it('treats an empty-string guestUserId as missing', () => {
    expect(classify({ guestId: 'g1', guestUserId: '' }, lookup)).toEqual({
      kind: 'set',
      guestUserId: 'uid-1',
    });
  });

  it('leaves a record with no guestId, a missing guest, or a guest with no account', () => {
    expect(classify({ guestId: null }, lookup)).toEqual({ kind: 'no-guest-id' });
    expect(classify({}, lookup)).toEqual({ kind: 'no-guest-id' });
    expect(classify({ guestId: 'g-deleted' }, lookup)).toEqual({ kind: 'guest-missing' });
    expect(classify({ guestId: 'g2' }, lookup)).toEqual({ kind: 'guest-no-user' });
    expect(classify({ guestId: 'g3' }, lookup)).toEqual({ kind: 'guest-no-user' });
  });
});

describe('run', () => {
  it('dry run counts but writes nothing', async () => {
    const { database, updates, commits } = makeDb(PAYMENTS, GUESTS);

    const counts = await run(database, false);

    expect(counts).toEqual({
      scanned: 7,
      alreadySet: 1,
      set: 2,
      noGuestId: 1,
      guestMissing: 1,
      guestNoUser: 2,
    });
    expect(updates).toEqual([]);
    expect(commits).toEqual([]);
  });

  it('--apply writes only guestUserId, only on the resolvable docs', async () => {
    const { database, updates, commits } = makeDb(PAYMENTS, GUESTS);

    await main(['--apply'], database);

    expect(updates).toEqual([
      { id: 'p-set', update: { guestUserId: 'uid-1' } },
      { id: 'p-set-2', update: { guestUserId: 'uid-1' } },
    ]);
    expect(commits).toEqual([2]);
  });

  it('reads each distinct guest once, and none for docs that already have the field', async () => {
    const { database, guestReads } = makeDb(PAYMENTS, GUESTS);

    await run(database, false);

    expect(guestReads.sort()).toEqual(['g-deleted', 'g1', 'g2', 'g3']);
  });

  it('flushes a batch every 400 writes', async () => {
    const many: Doc[] = Array.from({ length: 401 }, (_, i) => ({
      id: `p${i}`,
      data: { guestId: 'g1', houseId: 'h1' },
    }));
    const { database, commits } = makeDb(many, GUESTS);

    await run(database, true);

    expect(commits).toEqual([400, 1]);
  });

  it('logs ids and counts, never the uid it copies', async () => {
    const { database } = makeDb(PAYMENTS, GUESTS);

    await run(database, true);

    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('uid-1');
    expect(logged).toContain('p-gone');
  });
});
