import {
  CHECKPOINT_EVERY_CELLS,
  cellsPerRun,
  refreshSlice,
  REFRESH_CYCLE_RUNS,
  REFRESH_STATE_COLLECTION,
  REFRESH_STATE_DOC_ID,
  RUN_BUDGET_MS,
  REFRESH_TIMEOUT_SECONDS,
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
const STALE = { toMillis: () => new Date('2026-07-16T00:00:00Z').getTime() };
const TOTAL = [...gridCells()].length;
const CURSOR_KEY = `${REFRESH_STATE_COLLECTION}/${REFRESH_STATE_DOC_ID}`;

const AA_RECORD = {
  id: 99,
  name: 'Sunrise Group',
  day: 2,
  time: '07:00:00',
  latitude: '40.0',
  longitude: '-100.0',
  formatted_address: '1 Main St',
};

/** Both sources answer; AA's response is configurable. */
function healthyFetch(meetings: Array<Record<string, unknown>> = []) {
  return jest.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('meetingguide.org')) {
      return { ok: true, json: async () => ({ meetings }) };
    }
    return { ok: true, text: async () => '<markers></markers>' };
  }) as unknown as typeof fetch;
}

/** Meeting Guide rejects with 401 while Celebrate Recovery answers. */
function aaUnauthorizedFetch() {
  return jest.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('meetingguide.org')) {
      return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
    }
    return { ok: true, text: async () => '<markers></markers>' };
  }) as unknown as typeof fetch;
}

function fullSweep(records = 100) {
  return { attempted: TOTAL - 1, failed: 0, records };
}

function staleRow(provider: string): MockDoc {
  return { source: 'external', provider, location: IN_GRID, lastSeenAt: STALE };
}

function staleRows500(): Record<string, MockDoc> {
  const rows: Record<string, MockDoc> = {};
  for (let i = 0; i < 500; i++) rows[`directoryMeetings/stale-${i}`] = staleRow('AA');
  return rows;
}

/** A db whose cursor is on the last cell, so one run closes the cycle. */
function closingCycleDb(sweep: unknown, rows: Record<string, MockDoc>) {
  return makeDirectoryDb({
    [CURSOR_KEY]: { cursor: TOTAL - 1, sweep, sweepStartedAt: NOW.getTime() - 7 * 86_400_000 },
    ...freshRows('AA', 20),
    ...freshRows('CELEBRATE_RECOVERY', 20),
    ...rows,
  });
}

describe('refreshSlice time budget', () => {
  it('leaves the budget inside the function timeout', () => {
    expect(RUN_BUDGET_MS).toBeLessThan(REFRESH_TIMEOUT_SECONDS * 1000);
  });

  it('stops at the budget and saves the cursor where it stopped', async () => {
    const { db, store } = makeDirectoryDb();
    let elapsed = 0;
    const perCell = RUN_BUDGET_MS / 10;
    // Two sources per cell, so each cell costs perCell.
    const fetchFn = jest.fn(async (url: unknown) => {
      elapsed += perCell / 2;
      if (typeof url === 'string' && url.includes('meetingguide.org')) {
        return { ok: true, json: async () => ({ meetings: [] }) };
      }
      return { ok: true, text: async () => '<markers></markers>' };
    }) as unknown as typeof fetch;

    const result = await refreshSlice({
      db,
      fetchFn,
      now: () => new Date(NOW.getTime() + elapsed),
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.cellsProcessed).toBe(10);
    expect(result.nextCursor).toBe(10);
    expect(result.cycleCompleted).toBe(false);
    expect(store.get(CURSOR_KEY)?.cursor).toBe(10);
  });

  it('keeps checkpointed progress when a run dies mid-slice', async () => {
    const { db, store } = makeDirectoryDb();
    const realBatch = db.batch.bind(db);
    let batches = 0;
    const killAfter = CHECKPOINT_EVERY_CELLS + 3;
    (db as unknown as { batch: () => unknown }).batch = () => {
      batches++;
      if (batches > killAfter) throw new Error('instance killed');
      return realBatch();
    };

    await expect(refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW })).rejects.toThrow(
      'instance killed',
    );

    expect(store.get(CURSOR_KEY)?.cursor).toBe(CHECKPOINT_EVERY_CELLS);
  });

  it('moves on from a stuck mid-grid cursor once the run can finish', async () => {
    const { db, store } = makeDirectoryDb({ [CURSOR_KEY]: { cursor: 853 } });
    const perRun = cellsPerRun(TOTAL, REFRESH_CYCLE_RUNS);

    const result = await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(result.startCursor).toBe(853);
    expect(result.stoppedEarly).toBe(false);
    expect(store.get(CURSOR_KEY)?.cursor).toBe(853 + perRun);
  });
});

describe('refreshSlice sweep tally', () => {
  it('saves per-source results with the cursor and adds to them on the next slice', async () => {
    const { db, store } = makeDirectoryDb();
    const perRun = cellsPerRun(TOTAL, REFRESH_CYCLE_RUNS);

    await refreshSlice({ db, fetchFn: aaUnauthorizedFetch(), now: () => NOW });
    await refreshSlice({ db, fetchFn: aaUnauthorizedFetch(), now: () => NOW });

    expect(store.get(CURSOR_KEY)?.sweep).toEqual({
      AA: { attempted: perRun * 2, failed: perRun * 2, records: 0 },
      CelebrateRecovery: { attempted: perRun * 2, failed: 0, records: 0 },
    });
  });

  it('starts a fresh tally when a sweep begins at the first cell', async () => {
    const { db, store } = makeDirectoryDb({
      [CURSOR_KEY]: { cursor: 0, sweep: { AA: { attempted: 999, failed: 999, records: 0 } } },
    });
    const perRun = cellsPerRun(TOTAL, REFRESH_CYCLE_RUNS);

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    const sweep = store.get(CURSOR_KEY)?.sweep as Record<string, { attempted: number }>;
    expect(sweep.AA.attempted).toBe(perRun);
  });

  it('clears the tally when the cycle closes', async () => {
    const { db, store } = closingCycleDb({ AA: fullSweep(), CelebrateRecovery: fullSweep() }, {});

    const result = await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(result.cycleCompleted).toBe(true);
    expect(store.get(CURSOR_KEY)).toEqual({ cursor: 0, sweep: {} });
  });
});

describe('refreshSlice prune guard', () => {
  it('keeps rows from a failing source while pruning a healthy source', async () => {
    const { db, store } = closingCycleDb(
      {
        AA: { attempted: TOTAL - 1, failed: TOTAL - 1, records: 0 },
        CelebrateRecovery: fullSweep(),
      },
      {
        'directoryMeetings/stale-aa': staleRow('AA'),
        'directoryMeetings/stale-cr': staleRow('CELEBRATE_RECOVERY'),
      },
    );

    const result = await refreshSlice({ db, fetchFn: aaUnauthorizedFetch(), now: () => NOW });

    expect(store.has('directoryMeetings/stale-aa')).toBe(true);
    expect(store.has('directoryMeetings/stale-cr')).toBe(false);
    expect(result.prune).toEqual({
      providers: ['CELEBRATE_RECOVERY'],
      deleted: 1,
      scanned: 1,
      blocked: [],
    });
  });

  it('deletes nothing when every source is failing', async () => {
    const { db, store } = closingCycleDb(
      {
        AA: { attempted: TOTAL - 1, failed: TOTAL - 1, records: 0 },
        CelebrateRecovery: { attempted: TOTAL - 1, failed: TOTAL - 1, records: 0 },
      },
      {
        'directoryMeetings/stale-aa': staleRow('AA'),
        'directoryMeetings/stale-cr': staleRow('CELEBRATE_RECOVERY'),
      },
    );
    const allDown = jest.fn(async () => {
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;

    const result = await refreshSlice({ db, fetchFn: allDown, now: () => NOW });

    expect(store.has('directoryMeetings/stale-aa')).toBe(true);
    expect(store.has('directoryMeetings/stale-cr')).toBe(true);
    expect(result.prune).toEqual({ providers: [], deleted: 0, scanned: 0, blocked: [] });
  });

  it('deletes nothing on a first cycle that resumed mid-grid, even with healthy sources', async () => {
    const { db, store } = closingCycleDb(
      {
        AA: { attempted: 100, failed: 0, records: 100 },
        CelebrateRecovery: { attempted: 100, failed: 0, records: 100 },
      },
      { 'directoryMeetings/stale-cr': staleRow('CELEBRATE_RECOVERY') },
    );

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(store.has('directoryMeetings/stale-cr')).toBe(true);
  });

  it('never prunes imported NA rows, which have no live source to re-see them', async () => {
    const { db, store } = closingCycleDb(
      { AA: fullSweep(), CelebrateRecovery: fullSweep() },
      { 'directoryMeetings/stale-na': { ...staleRow('NA'), dataAsOf: '2023-03-19' } },
    );

    await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(store.has('directoryMeetings/stale-na')).toBe(true);
  });

  it('keeps imported AA rows during an outage and retires them once AA recovers', async () => {
    const imported = { ...staleRow('AA'), dataAsOf: '2025-09-17' };
    const during = closingCycleDb(
      {
        AA: { attempted: TOTAL - 1, failed: TOTAL - 1, records: 0 },
        CelebrateRecovery: fullSweep(),
      },
      { 'directoryMeetings/imported': imported },
    );
    await refreshSlice({ db: during.db, fetchFn: aaUnauthorizedFetch(), now: () => NOW });
    expect(during.store.has('directoryMeetings/imported')).toBe(true);

    const after = closingCycleDb(
      { AA: fullSweep(), CelebrateRecovery: fullSweep() },
      { 'directoryMeetings/imported': imported },
    );
    await refreshSlice({ db: after.db, fetchFn: healthyFetch(), now: () => NOW });
    expect(after.store.has('directoryMeetings/imported')).toBe(false);
  });

  it('stops a degraded source that answered for only a few cells', async () => {
    const { db, store } = closingCycleDb(
      { AA: fullSweep(3), CelebrateRecovery: fullSweep() },
      staleRows500(),
    );

    const result = await refreshSlice({ db, fetchFn: healthyFetch(), now: () => NOW });

    expect(result.prune?.blocked).toEqual(['AA']);
    expect([...store.keys()].filter((k) => k.includes('/stale-'))).toHaveLength(500);
  });

  it('clears the import marker when a live sweep re-sees a row', async () => {
    const { db, store } = makeDirectoryDb();
    const cells = [...gridCells()];
    const idx = cells.findIndex(
      (c) => Math.abs(c.lat - 40) < 1e-9 && Math.abs(c.lng - -100) < 1e-9,
    );
    await db.collection(REFRESH_STATE_COLLECTION).doc(REFRESH_STATE_DOC_ID).set({ cursor: idx });

    await refreshSlice({ db, fetchFn: healthyFetch([AA_RECORD]), now: () => NOW });

    const row = [...store.entries()].find(([key]) => key.startsWith('directoryMeetings/'))?.[1];
    expect(row?.dataAsOf).toBeNull();
  });
});
