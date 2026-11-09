import {
  cellsPerRun,
  refreshSlice,
  REFRESH_CYCLE_RUNS,
  REFRESH_STATE_COLLECTION,
  REFRESH_STATE_DOC_ID,
} from './refreshDirectory';
import { gridCells } from '../lib/meetings/ingest';
import { freshRows, IN_GRID, makeDirectoryDb, type MockDoc } from './testing/directoryDbMock';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
  Timestamp: {
    fromMillis: (ms: number) => ({ __ts__: true, toMillis: () => ms }),
  },
}));

jest.mock('../lib/firebase', () => ({ db: {}, auth: {} }));

jest.mock('firebase-functions/v2', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const NOW = new Date('2026-11-08T03:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const TOTAL = [...gridCells()].length;
const CURSOR_KEY = `${REFRESH_STATE_COLLECTION}/${REFRESH_STATE_DOC_ID}`;
const HEALTHY = {
  AA: { attempted: TOTAL - 1, failed: 0, records: 100 },
  CelebrateRecovery: { attempted: TOTAL - 1, failed: 0, records: 100 },
};

function healthyFetch() {
  return jest.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('meetingguide.org')) {
      return { ok: true, json: async () => ({ meetings: [] }) };
    }
    return { ok: true, text: async () => '<markers></markers>' };
  }) as unknown as typeof fetch;
}

function rowSeenDaysAgo(days: number): MockDoc {
  const ms = NOW.getTime() - days * DAY_MS;
  return {
    source: 'external',
    provider: 'AA',
    location: IN_GRID,
    lastSeenAt: { toMillis: () => ms },
  };
}

describe('refreshSlice sweep start time', () => {
  it('keeps a row a long sweep saw near its start, even past the stale horizon', async () => {
    const { db, store } = makeDirectoryDb({
      [CURSOR_KEY]: {
        cursor: TOTAL - 1,
        sweep: HEALTHY,
        sweepStartedAt: NOW.getTime() - 60 * DAY_MS,
      },
      'directoryMeetings/seen-this-sweep': rowSeenDaysAgo(45),
      'directoryMeetings/gone-from-source': rowSeenDaysAgo(70),
      ...freshRows('AA', 30),
    });

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(store.has('directoryMeetings/seen-this-sweep')).toBe(true);
    expect(store.has('directoryMeetings/gone-from-source')).toBe(false);
  });

  it('still waits out the stale horizon after a short sweep', async () => {
    const { db, store } = makeDirectoryDb({
      [CURSOR_KEY]: {
        cursor: TOTAL - 1,
        sweep: HEALTHY,
        sweepStartedAt: NOW.getTime() - 7 * DAY_MS,
      },
      'directoryMeetings/missed-once': rowSeenDaysAgo(14),
      'directoryMeetings/long-gone': rowSeenDaysAgo(40),
      ...freshRows('AA', 30),
    });

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(store.has('directoryMeetings/missed-once')).toBe(true);
    expect(store.has('directoryMeetings/long-gone')).toBe(false);
  });

  it('prunes nothing when a sweep has no recorded start', async () => {
    const { db, store } = makeDirectoryDb({
      [CURSOR_KEY]: { cursor: TOTAL - 1, sweep: HEALTHY },
      'directoryMeetings/long-gone': rowSeenDaysAgo(40),
      ...freshRows('AA', 30),
    });

    const result = await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(result.prune?.providers).toEqual([]);
    expect(store.has('directoryMeetings/long-gone')).toBe(true);
  });

  it('records the start when a sweep begins at the first cell', async () => {
    const { db, store } = makeDirectoryDb();

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(store.get(CURSOR_KEY)?.sweepStartedAt).toBe(NOW.getTime());
  });

  it('keeps the original start across later slices', async () => {
    const { db, store } = makeDirectoryDb();
    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    const nextDay = new Date(NOW.getTime() + DAY_MS);
    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => nextDay });

    const perRun = cellsPerRun(TOTAL, REFRESH_CYCLE_RUNS);
    expect(store.get(CURSOR_KEY)?.cursor).toBe(perRun * 2);
    expect(store.get(CURSOR_KEY)?.sweepStartedAt).toBe(NOW.getTime());
  });

  it('records no start when resuming mid-grid from before this field existed', async () => {
    const { db, store } = makeDirectoryDb({ [CURSOR_KEY]: { cursor: 853 } });

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(store.get(CURSOR_KEY)?.sweepStartedAt).toBeUndefined();
  });
});
