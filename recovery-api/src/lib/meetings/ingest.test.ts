import { ingestGridCell, gridCells, GRID_CONFIG } from './ingest';
import { directoryMeetingId } from './identity';
import type { DirectoryMeeting } from '../../entities/DirectoryMeeting';

/**
 * Tests use a fully in-memory Firestore mock + an injected fetchFn mock — zero
 * real network, zero real Firestore. Mirrors the dependency-injection style of
 * callable/referrals.test.ts.
 */

// Sentinel returned by FieldValue.serverTimestamp() in the mock below.
const SERVER_TS = '__serverTimestamp__';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
}));

/** A minimal source meeting (pre-timestamp slice, as the fetchers return). */
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

/**
 * In-memory Firestore mock. `store` is a Map of docId → docData. Supports the
 * exact surface ingestGridCell touches: collection().doc(id).get(),
 * db.batch().set(ref, data, {merge}), batch.commit().
 */
function makeDb(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(seed));

  const collection = () => ({
    doc: (id: string) => ({
      id,
      get: async () => ({
        exists: store.has(id),
        data: () => store.get(id),
      }),
    }),
  });

  let commitCount = 0;
  const batch = () => {
    const ops: Array<{ id: string; data: Record<string, unknown>; merge: boolean }> = [];
    return {
      set: (ref: { id: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        ops.push({ id: ref.id, data, merge: opts?.merge ?? false });
      },
      commit: async () => {
        commitCount++;
        for (const op of ops) {
          const prev = op.merge ? (store.get(op.id) ?? {}) : {};
          store.set(op.id, { ...prev, ...op.data });
        }
        ops.length = 0;
      },
    };
  };

  const db = {
    collection: jest.fn(collection),
    batch: jest.fn(batch),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, store, commitCount: () => commitCount };
}

/** A fetchFn mock that returns one AA meeting (JSON) and empty CR (XML). */
function makeFetchFn(meetings: Array<Record<string, unknown>>) {
  return jest.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('meetingguide.org')) {
      return {
        ok: true,
        json: async () => ({ meetings }),
      };
    }
    // Celebrate Recovery — empty XML marker set.
    return {
      ok: true,
      text: async () => '<markers></markers>',
    };
  }) as unknown as jest.Mock & typeof fetch;
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

describe('gridCells / GRID_CONFIG', () => {
  it('uses the continental-US bounds copied from homegroups shared-types.ts', () => {
    expect(GRID_CONFIG).toEqual({
      LAT_MIN: 24.0,
      LAT_MAX: 49.0,
      LON_MIN: -125.0,
      LON_MAX: -67.0,
      STEP: 0.5,
    });
  });

  it('yields a non-empty grid that stays within bounds', () => {
    const cells = [...gridCells()];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.lat).toBeGreaterThanOrEqual(GRID_CONFIG.LAT_MIN);
      expect(c.lat).toBeLessThanOrEqual(GRID_CONFIG.LAT_MAX);
      expect(c.lng).toBeGreaterThanOrEqual(GRID_CONFIG.LON_MIN);
      expect(c.lng).toBeLessThanOrEqual(GRID_CONFIG.LON_MAX);
    }
  });
});

describe('ingestGridCell', () => {
  it('upserts external meetings with ingestor-owned timestamps', async () => {
    const { db, store } = makeDb();
    const fetchFn = makeFetchFn([AA_RECORD]);

    const result = await ingestGridCell(40, -100, { db, fetchFn });

    expect(result.upserted).toBe(1);
    expect(result.skippedAppOwned).toBe(0);
    expect(store.size).toBe(1);

    const id = directoryMeetingId(sourceMeeting());
    const doc = store.get(id)!;
    expect(doc.source).toBe('external');
    // Ingestor owns all four timestamps; createdAt set on first write.
    expect(doc.lastRefreshedAt).toBe(SERVER_TS);
    expect(doc.lastSeenAt).toBe(SERVER_TS);
    expect(doc.updatedAt).toBe(SERVER_TS);
    expect(doc.createdAt).toBe(SERVER_TS);
  });

  it('is idempotent: re-running the same cell creates ZERO new docs but re-stamps freshness (upsert, not skip)', async () => {
    const { db, store } = makeDb();
    const id = directoryMeetingId(sourceMeeting());

    // First run.
    await ingestGridCell(40, -100, { db, fetchFn: makeFetchFn([AA_RECORD]) });
    expect(store.size).toBe(1);
    // Mark createdAt with a distinct sentinel so we can prove it's preserved.
    store.set(id, { ...store.get(id)!, createdAt: 'ORIGINAL_CREATED' });

    // Second run, identical source data.
    const result = await ingestGridCell(40, -100, {
      db,
      fetchFn: makeFetchFn([AA_RECORD]),
    });

    // Zero new docs.
    expect(store.size).toBe(1);
    // It was an upsert (write happened), not a skip-if-exists.
    expect(result.upserted).toBe(1);

    const doc = store.get(id)!;
    // Freshness re-stamped on the existing doc.
    expect(doc.lastSeenAt).toBe(SERVER_TS);
    expect(doc.lastRefreshedAt).toBe(SERVER_TS);
    // createdAt preserved (createdAt-once): the second run did NOT overwrite it.
    expect(doc.createdAt).toBe('ORIGINAL_CREATED');
  });

  it('never overwrites a pre-existing source:"app" doc at a colliding id', async () => {
    const id = directoryMeetingId(sourceMeeting());
    const appDoc = {
      source: 'app',
      provider: 'AA',
      name: 'App-owned Sunrise Group',
      createdByApp: 'homegroups',
      createdByUid: 'uid-1',
    };
    const { db, store } = makeDb({ [id]: { ...appDoc } });

    const result = await ingestGridCell(40, -100, {
      db,
      fetchFn: makeFetchFn([AA_RECORD]),
    });

    expect(result.skippedAppOwned).toBe(1);
    expect(result.upserted).toBe(0);
    // The app doc is untouched — still app-owned, name unchanged, no ingestor stamps.
    const doc = store.get(id)!;
    expect(doc).toEqual(appDoc);
    expect(doc.source).toBe('app');
    expect(doc.lastSeenAt).toBeUndefined();
  });

  it('does zero real network and zero real Firestore (mocks only)', async () => {
    const { db } = makeDb();
    const fetchFn = makeFetchFn([AA_RECORD]);

    await ingestGridCell(40, -100, { db, fetchFn });

    // fetchFn was the only network path, and it was a mock.
    expect(fetchFn).toHaveBeenCalled();
    for (const call of fetchFn.mock.calls) {
      expect(typeof call[0]).toBe('string');
    }
    // db is the injected mock; collection() was driven through it.
    expect(db.collection as jest.Mock).toHaveBeenCalledWith('directoryMeetings');
  });
});
