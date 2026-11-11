import { geohashForLocation } from 'geofire-common';
import { handleFindMeetings } from './findMeetings';

interface Row {
  id: string;
  provider: string;
  day: string;
  location: { lat: number; lng: number; geohash: string };
}

function row(id: string, lat: number, lng: number): Row {
  return {
    id,
    provider: 'AA',
    day: 'monday',
    location: { lat, lng, geohash: geohashForLocation([lat, lng], 10) },
  };
}

/**
 * Follows Firestore's cursor rules, because that's what this fix depends on: rows sort by
 * geohash then document id, there is one start cursor, and a later one replaces an
 * earlier one. Rows on one coordinate share a geohash, so only a document cursor can
 * continue from the middle of them.
 */
function makeDb(rows: Row[]) {
  const sorted = [...rows].sort((a, b) =>
    a.location.geohash === b.location.geohash
      ? a.id.localeCompare(b.id)
      : a.location.geohash.localeCompare(b.location.geohash),
  );
  const reads = { count: 0 };
  type Doc = { id: string; data: () => Row };
  const query = (state: { start?: (r: Row) => boolean; end?: string; max?: number }) => ({
    orderBy: () => query(state),
    startAt: (hash: string) => query({ ...state, start: (r) => r.location.geohash >= hash }),
    startAfter: (doc: Doc) => {
      const at = doc.data();
      const start = (r: Row) =>
        r.location.geohash > at.location.geohash ||
        (r.location.geohash === at.location.geohash && r.id > at.id);
      return query({ ...state, start });
    },
    endAt: (hash: string) => query({ ...state, end: hash }),
    limit: (max: number) => query({ ...state, max }),
    get: async () => {
      const matched = sorted
        .filter((r) => (state.start ? state.start(r) : true))
        .filter((r) => (state.end === undefined ? true : r.location.geohash <= state.end))
        .slice(0, state.max ?? Infinity);
      reads.count += matched.length;
      return { docs: matched.map((r) => ({ id: r.id, data: () => r })) };
    },
  });
  const db = {
    collection: (name: string) =>
      name === 'directoryMeetings' ? query({}) : { add: async () => ({ id: 'audit' }) },
  } as unknown as FirebaseFirestore.Firestore;
  return { db, reads };
}

const ctx = { appId: 'regroup', uid: 'u1' } as never;
const CENTER = { lat: 40.7128, lng: -74.006 };
const ids = (result: { meetings: Array<{ id?: string }> }) => result.meetings.map((m) => m.id);

describe('handleFindMeetings in a dense city', () => {
  it('returns every meeting in the radius when an area holds far more than one page', async () => {
    const rows = Array.from({ length: 3200 }, (_, i) =>
      row(`m${i}`, CENTER.lat + (i % 60) * 0.0002, CENTER.lng + (Math.floor(i / 60) % 60) * 0.0002),
    );
    const { db } = makeDb(rows);
    const result = await handleFindMeetings({ location: CENTER, radiusMeters: 5000 }, ctx, { db });
    expect(new Set(ids(result)).size).toBe(3200);
    expect(result.meetings).toHaveLength(3200);
  });

  it('does not lose or repeat meetings when one address spans a page boundary', async () => {
    const rows = Array.from({ length: 1700 }, (_, i) => row(`pile${i}`, CENTER.lat, CENTER.lng));
    const { db } = makeDb(rows);
    const result = await handleFindMeetings({ location: CENTER, radiusMeters: 1000 }, ctx, { db });
    expect(result.meetings).toHaveLength(1700);
    expect(new Set(ids(result)).size).toBe(1700);
  });

  it('stops paging when an area is exactly full pages', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(`m${i}`, CENTER.lat, CENTER.lng));
    const { db, reads } = makeDb(rows);
    const result = await handleFindMeetings({ location: CENTER, radiusMeters: 1000 }, ctx, { db });
    expect(result.meetings).toHaveLength(1000);
    expect(reads.count).toBeLessThan(5000);
  });

  it('still excludes meetings beyond the radius', async () => {
    const { db } = makeDb([row('near', CENTER.lat, CENTER.lng), row('far', 41.5, -74.006)]);
    const result = await handleFindMeetings({ location: CENTER, radiusMeters: 5000 }, ctx, { db });
    expect(ids(result)).toEqual(['near']);
  });
});
