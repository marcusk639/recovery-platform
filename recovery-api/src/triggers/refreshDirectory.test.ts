import {
  cellsPerRun,
  computeSlice,
  refreshSlice,
  pruneStale,
  REFRESH_CYCLE_RUNS,
  REFRESH_STATE_COLLECTION,
  REFRESH_STATE_DOC_ID,
  STALE_PRUNE_DAYS,
} from './refreshDirectory';
import { gridCells } from '../lib/meetings/ingest';
import { directoryMeetingId } from '../lib/meetings/identity';
import type { DirectoryMeeting } from '../entities/DirectoryMeeting';

/**
 * Zero real network / zero real Firestore: an in-memory Firestore mock + an
 * injected fetchFn mock + a fixed `now`. Mirrors the DI style of
 * lib/meetings/ingest.test.ts and callable/referrals.test.ts.
 */

const SERVER_TS = '__serverTimestamp__';

// Mock the firebase-admin/firestore surface used across the refresh path:
//  - FieldValue.serverTimestamp() (used by ingestGridCell)
//  - Timestamp.fromMillis()/comparison (used by pruneStale)
// The Timestamp mock stores millis and supports a `<` style numeric compare via
// the query mock below.
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
  Timestamp: {
    fromMillis: (ms: number) => ({ __ts__: true, toMillis: () => ms }),
  },
}));

// db is provided by deps in every test; the firebase singleton import must not
// initialize a real app.
jest.mock('../lib/firebase', () => ({ db: {}, auth: {} }));

interface MockDoc {
  source?: string;
  lastSeenAt?: { toMillis: () => number };
  [k: string]: unknown;
}

/**
 * In-memory Firestore mock covering exactly the surface the refresh path uses:
 *  - collection(name).doc(id).get()/set()      (cursor read/write)
 *  - collection(name).doc(id).get()            (per-cell ingest read)
 *  - db.batch().set/delete/commit              (ingest upsert + prune delete)
 *  - collection(name).where().where().get()    (prune query)
 */
function makeDb(seed: Record<string, MockDoc> = {}) {
  const store = new Map<string, MockDoc>(Object.entries(seed));

  function docRef(name: string, id: string) {
    const key = `${name}/${id}`;
    return {
      id,
      ref: { __key: key },
      get: async () => ({
        id,
        exists: store.has(key),
        data: () => store.get(key),
      }),
      set: async (data: MockDoc, opts?: { merge?: boolean }) => {
        const prev = opts?.merge ? (store.get(key) ?? {}) : {};
        store.set(key, { ...prev, ...data });
      },
    };
  }

  function collection(name: string) {
    const api = {
      doc: (id: string) => docRef(name, id),
      // Chainable where(): collects {field,op,value} filters, executed on get().
      _filters: [] as Array<{ field: string; op: string; value: unknown }>,
      where(field: string, op: string, value: unknown) {
        api._filters.push({ field, op, value });
        return api;
      },
      get: async () => {
        const docs = [...store.entries()]
          .filter(([key]) => key.startsWith(`${name}/`))
          .filter(([, data]) =>
            api._filters.every((f) => {
              const v = (data as Record<string, unknown>)[f.field];
              if (f.op === '==') return v === f.value;
              if (f.op === '<') {
                const lhs = (v as { toMillis?: () => number })?.toMillis?.();
                const rhs = (f.value as { toMillis?: () => number })?.toMillis?.();
                return lhs !== undefined && rhs !== undefined && lhs < rhs;
              }
              return true;
            }),
          )
          .map(([key, data]) => ({
            id: key.split('/').slice(1).join('/'),
            data: () => data,
            ref: { __key: key },
          }));
        return { docs, size: docs.length };
      },
    };
    return api;
  }

  const batch = () => {
    const ops: Array<
      { type: 'set'; key: string; data: MockDoc; merge: boolean } | { type: 'delete'; key: string }
    > = [];
    return {
      set: (ref: { id: string }, data: MockDoc, opts?: { merge?: boolean }) => {
        // ingest writes go to directoryMeetings.
        ops.push({
          type: 'set',
          key: `directoryMeetings/${ref.id}`,
          data,
          merge: opts?.merge ?? false,
        });
      },
      delete: (ref: { __key: string }) => {
        ops.push({ type: 'delete', key: ref.__key });
      },
      commit: async () => {
        for (const op of ops) {
          if (op.type === 'set') {
            const prev = op.merge ? (store.get(op.key) ?? {}) : {};
            store.set(op.key, { ...prev, ...op.data });
          } else {
            store.delete(op.key);
          }
        }
        ops.length = 0;
      },
    };
  };

  const db = {
    collection: jest.fn(collection),
    batch: jest.fn(batch),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, store };
}

/** fetchFn mock: one AA meeting from meetingguide, empty CR markers. */
function makeFetchFn(meetings: Array<Record<string, unknown>>) {
  return jest.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('meetingguide.org')) {
      return { ok: true, json: async () => ({ meetings }) };
    }
    return { ok: true, text: async () => '<markers></markers>' };
  }) as unknown as jest.Mock & typeof fetch;
}

function sourceMeeting(over: Partial<DirectoryMeeting> = {}): DirectoryMeeting {
  return {
    source: 'external',
    provider: 'AA',
    name: 'Sunrise Group',
    day: 2,
    time: '07:00',
    location: { lat: 40, lng: -100, geohash: 'abc' },
    ...over,
  } as DirectoryMeeting;
}

const AA_RECORD = {
  id: 99,
  name: 'Sunrise Group',
  day: 2,
  time: '07:00:00',
  latitude: '40.0',
  longitude: '-100.0',
  formatted_address: '1 Main St',
};

describe('cellsPerRun (slicing math)', () => {
  it('ceil-divides total cells across the cycle so a few short runs cover all', () => {
    expect(cellsPerRun(100, 7)).toBe(15); // ceil(100/7)
    expect(cellsPerRun(7, 7)).toBe(1);
    expect(cellsPerRun(0, 7)).toBe(0);
  });

  it('a full set of runs covers every cell exactly once, then wraps to 0', () => {
    const total = [...gridCells()].length;
    const perRun = cellsPerRun(total, REFRESH_CYCLE_RUNS);

    const covered = new Set<number>();
    let cursor = 0;
    let runs = 0;
    let wrapped = false;
    // Drive runs until the cursor wraps back to 0.
    do {
      const { start, end, nextCursor, cycleCompleted } = computeSlice(cursor, perRun, total);
      for (let i = start; i < end; i++) covered.add(i);
      cursor = nextCursor;
      runs++;
      if (cycleCompleted) wrapped = true;
      expect(runs).toBeLessThanOrEqual(REFRESH_CYCLE_RUNS + 1);
    } while (cursor !== 0);

    // Every cell covered exactly once across the cycle.
    expect(covered.size).toBe(total);
    // Wrap occurred and cursor is back at 0.
    expect(wrapped).toBe(true);
    expect(cursor).toBe(0);
    // Cycle completes within the configured cadence.
    expect(runs).toBeLessThanOrEqual(REFRESH_CYCLE_RUNS);
  });
});

describe('computeSlice', () => {
  it('advances by the slice size', () => {
    expect(computeSlice(0, 10, 100)).toMatchObject({
      start: 0,
      end: 10,
      nextCursor: 10,
      cycleCompleted: false,
    });
    expect(computeSlice(10, 10, 100)).toMatchObject({ start: 10, end: 20, nextCursor: 20 });
  });

  it('clamps the final slice and WRAPS the cursor to 0 at grid end', () => {
    // 95..100 then wrap.
    const r = computeSlice(95, 10, 100);
    expect(r.start).toBe(95);
    expect(r.end).toBe(100);
    expect(r.cycleCompleted).toBe(true);
    expect(r.nextCursor).toBe(0);
  });

  it('restarts at 0 for an out-of-range cursor', () => {
    expect(computeSlice(999, 10, 100).start).toBe(0);
    expect(computeSlice(-5, 10, 100).start).toBe(0);
  });
});

describe('refreshSlice', () => {
  it('advances and persists the cursor by the slice size on a normal run', async () => {
    const { db, store } = makeDb();
    const total = [...gridCells()].length;
    const perRun = cellsPerRun(total, REFRESH_CYCLE_RUNS);

    const result = await refreshSlice({
      db,
      fetchFn: makeFetchFn([]),
      now: () => new Date('2026-06-21T03:00:00Z'),
    });

    expect(result.startCursor).toBe(0);
    expect(result.cellsProcessed).toBe(perRun);
    expect(result.nextCursor).toBe(perRun);
    expect(result.totalCells).toBe(total);
    expect(result.cycleCompleted).toBe(false);

    // Cursor persisted for next run.
    const cursorDoc = store.get(`${REFRESH_STATE_COLLECTION}/${REFRESH_STATE_DOC_ID}`);
    expect(cursorDoc?.cursor).toBe(perRun);
  });

  it('updates an existing external doc and re-stamps lastRefreshedAt when the record changed (upsert, not skip-if-exists)', async () => {
    // Seed an existing external doc at the colliding id with a STALE name.
    const id = directoryMeetingId(sourceMeeting());
    const { db, store } = makeDb({
      [`directoryMeetings/${id}`]: {
        source: 'external',
        name: 'OLD NAME',
        createdAt: 'ORIGINAL_CREATED',
        lastRefreshedAt: 'OLD_TS',
      },
    });

    // Start the cursor exactly at the cell containing (40,-100) so ingest hits it.
    const cells = [...gridCells()];
    const idx = cells.findIndex(
      (c) => Math.abs(c.lat - 40) < 1e-9 && Math.abs(c.lng - -100) < 1e-9,
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    await db.collection(REFRESH_STATE_COLLECTION).doc(REFRESH_STATE_DOC_ID).set({ cursor: idx });

    await refreshSlice({
      db,
      fetchFn: makeFetchFn([AA_RECORD]),
      now: () => new Date('2026-06-21T03:00:00Z'),
    });

    const doc = store.get(`directoryMeetings/${id}`)!;
    // Field updated from the fresh source record (not skipped because it existed).
    expect(doc.name).toBe('Sunrise Group');
    // Freshness re-stamped.
    expect(doc.lastRefreshedAt).toBe(SERVER_TS);
    expect(doc.lastSeenAt).toBe(SERVER_TS);
    // createdAt preserved (createdAt-once).
    expect(doc.createdAt).toBe('ORIGINAL_CREATED');
  });

  it('runs the stale prune when a slice completes the full cycle', async () => {
    const total = [...gridCells()].length;
    // Cursor near the end so this single run completes the cycle.
    const { db, store } = makeDb({
      [`${REFRESH_STATE_COLLECTION}/${REFRESH_STATE_DOC_ID}`]: { cursor: total - 1 },
      // A stale external doc that should be pruned at cycle end.
      'directoryMeetings/stale-ext': {
        source: 'external',
        lastSeenAt: { toMillis: () => new Date('2026-01-01T00:00:00Z').getTime() },
      },
    });

    const result = await refreshSlice({
      db,
      fetchFn: makeFetchFn([]),
      now: () => new Date('2026-06-21T03:00:00Z'),
    });

    expect(result.cycleCompleted).toBe(true);
    expect(result.nextCursor).toBe(0);
    // Prune ran: the stale external doc is gone.
    expect(store.has('directoryMeetings/stale-ext')).toBe(false);
  });
});

describe('pruneStale', () => {
  const NOW = () => new Date('2026-06-21T00:00:00Z');
  const staleMs = new Date('2026-01-01T00:00:00Z').getTime(); // ~5+ months old
  const freshMs = new Date('2026-06-20T00:00:00Z').getTime(); // 1 day old

  it('deletes only stale source:"external" docs', async () => {
    const { db, store } = makeDb({
      'directoryMeetings/stale-ext': {
        source: 'external',
        lastSeenAt: { toMillis: () => staleMs },
      },
      'directoryMeetings/fresh-ext': {
        source: 'external',
        lastSeenAt: { toMillis: () => freshMs },
      },
    });

    const result = await pruneStale({ db, now: NOW });

    expect(result.deleted).toBe(1);
    expect(store.has('directoryMeetings/stale-ext')).toBe(false);
    // Fresh external doc survives (within the prune horizon).
    expect(store.has('directoryMeetings/fresh-ext')).toBe(true);
  });

  it('NEVER prunes a stale source:"app" doc — it SURVIVES', async () => {
    const { db, store } = makeDb({
      'directoryMeetings/stale-app': {
        source: 'app',
        createdByApp: 'homegroups',
        createdByUid: 'uid-1',
        lastSeenAt: { toMillis: () => staleMs },
      },
      'directoryMeetings/stale-ext': {
        source: 'external',
        lastSeenAt: { toMillis: () => staleMs },
      },
    });

    const result = await pruneStale({ db, now: NOW });

    // Only the external one is deleted.
    expect(result.deleted).toBe(1);
    expect(store.has('directoryMeetings/stale-ext')).toBe(false);
    // The app-owned doc survives even though it is stale.
    expect(store.has('directoryMeetings/stale-app')).toBe(true);
  });

  it('uses the STALE_PRUNE_DAYS horizon for the cutoff', () => {
    // Sanity-check the constant is a positive horizon (sized over multiple cycles).
    expect(STALE_PRUNE_DAYS).toBeGreaterThanOrEqual(REFRESH_CYCLE_RUNS);
  });
});
