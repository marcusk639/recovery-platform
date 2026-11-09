import { reconcileNaMeetings, type NaReconcileDeps } from './naSync';
import { mapBmltMeeting } from './sources/bmlt';
import { bmltRow, bmltRows, makeNaSyncDb, now, regionSweep } from './testing/naSyncTestDb';

const key = (id: string) => `directoryMeetings/${id}`;

/** Seeds `count` rows in region 100 and returns a way to run again against them. */
async function seeded(count: number, sourceId = 100) {
  const harness = makeNaSyncDb();
  await reconcileNaMeetings([regionSweep(sourceId, bmltRows(count))], {
    db: harness.db,
    apply: true,
    now,
  });
  const run = (
    sweeps: Parameters<typeof reconcileNaMeetings>[0],
    over: Partial<NaReconcileDeps> = {},
  ) => reconcileNaMeetings(sweeps, { db: harness.db, apply: true, now, ...over });
  return { ...harness, run };
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errorSpy.mockRestore());

test('deletes a row missing from a healthy region', async () => {
  const { run, store } = await seeded(20);
  const result = await run([regionSweep(100, bmltRows(19))]);
  expect(result.deleted).toBe(1);
  expect(store.size).toBe(19);
});

test.each(['fetch_failed', 'count_mismatch', 'stale_import'] as const)(
  'keeps missing rows when the region has %s',
  async (problem) => {
    const { run, store } = await seeded(2);
    const result = await run([regionSweep(100, bmltRows(1), { problem })]);
    expect(result).toMatchObject({ deleted: 0, keptUnhealthy: 1 });
    expect(store.size).toBe(2);
  },
);

test('a row the region did not return keeps its old date', async () => {
  const { run, store } = await seeded(2);
  const missing = mapBmltMeeting(bmltRow(2), regionSweep(100, []).region)!;
  await run([
    regionSweep(100, bmltRows(1), {
      problem: 'count_mismatch',
      lastSuccessfulImport: '2026-12-01 01:00:00',
    }),
  ]);
  expect(store.get(key(missing.id))!.dataAsOf).toBe('2026-11-08');
});

test('keeps rows whose region was not swept', async () => {
  const { run } = await seeded(1);
  const result = await run([regionSweep(101, [bmltRow(50)])]);
  expect(result).toMatchObject({ deleted: 0, keptUnhealthy: 1, created: 1 });
});

test('blocks a region that would lose more than the allowance', async () => {
  const { run, store } = await seeded(100);
  const result = await run([regionSweep(100, bmltRows(89))]);

  expect(result).toMatchObject({ deleted: 0, blockedRegions: ['100'] });
  expect(store.size).toBe(100);
  expect(errorSpy).toHaveBeenCalledWith('syncNa: region delete blocked', {
    region: '100',
    missing: 11,
    existing: 100,
  });
});

test('a region may lose exactly the fractional allowance', async () => {
  const { run } = await seeded(100);
  const result = await run([regionSweep(100, bmltRows(90))]);
  expect(result).toMatchObject({ deleted: 10, blockedRegions: [] });
});

test('a small region may lose up to five rows', async () => {
  const allowed = await seeded(10);
  expect((await allowed.run([regionSweep(100, bmltRows(5))])).deleted).toBe(5);

  const blocked = await seeded(10);
  const result = await blocked.run([regionSweep(100, bmltRows(4))]);
  expect(result).toMatchObject({ deleted: 0, blockedRegions: ['100'] });
});

test('allowDeletes lifts the cap for a named healthy region only', async () => {
  const named = await seeded(100);
  const result = await named.run([regionSweep(100, bmltRows(50))], { allowDeletes: ['100'] });
  expect(result).toMatchObject({ deleted: 50, blockedRegions: [] });

  const other = await seeded(100);
  const otherResult = await other.run([regionSweep(100, bmltRows(50))], { allowDeletes: ['101'] });
  expect(otherResult).toMatchObject({ deleted: 0, blockedRegions: ['100'] });
});

test('allowDeletes removes rows of a named region no longer in the list', async () => {
  const { run, store } = await seeded(3, 999);
  const result = await run([regionSweep(100, [bmltRow(50)])], { allowDeletes: ['999'] });
  expect(result.deleted).toBe(3);
  expect(store.size).toBe(1);
});

test('allowDeletes never overrides an unhealthy region', async () => {
  const { run, store } = await seeded(2);
  const result = await run([regionSweep(100, bmltRows(1), { problem: 'fetch_failed' })], {
    allowDeletes: ['100'],
  });
  expect(result).toMatchObject({ deleted: 0, keptUnhealthy: 1 });
  expect(store.size).toBe(2);
});

test('leaves legacy NA rows without sourceRegion and counts them', async () => {
  const { db, store } = makeNaSyncDb({
    [key('legacy')]: { source: 'external', provider: 'NA', name: 'Old', dataAsOf: '2023-03-01' },
  });
  const result = await reconcileNaMeetings([regionSweep(100, [bmltRow(1)])], {
    db,
    apply: true,
    now,
  });
  expect(result).toMatchObject({ deleted: 0, legacyRows: 1 });
  expect(store.has(key('legacy'))).toBe(true);
});

test('leaves other providers alone', async () => {
  const aa = { source: 'external', provider: 'AA', sourceRegion: '100' };
  const { db, store } = makeNaSyncDb({ [key('aa')]: aa });
  await reconcileNaMeetings([regionSweep(100, [bmltRow(1)])], { db, apply: true, now });
  expect(store.get(key('aa'))).toEqual(aa);
});

test('the same meeting in two regions becomes one document and survives losing one listing', async () => {
  const { db, store } = makeNaSyncDb();
  const shared = bmltRow(1);
  const both = await reconcileNaMeetings(
    [regionSweep(100, [shared]), regionSweep(101, [{ ...shared, source_id: 77 }])],
    { db, apply: true, now },
  );
  expect(both).toMatchObject({ created: 1, collapsedDuplicates: 1 });
  expect(store.size).toBe(1);

  const after = await reconcileNaMeetings(
    [regionSweep(100, []), regionSweep(101, [{ ...shared, source_id: 77 }])],
    { db, apply: true, now },
  );
  expect(after.deleted).toBe(0);
  expect(store.size).toBe(1);
  expect([...store.values()][0]).toMatchObject({ sourceRegion: '101', externalId: '101:77' });
});

test('the row that wins a duplicate does not depend on response order', async () => {
  const shared = bmltRow(1);
  const sweepA = regionSweep(100, [
    { ...shared, source_id: 5 },
    { ...shared, source_id: 2 },
  ]);
  const sweepB = regionSweep(101, [{ ...shared, source_id: 1 }]);

  const forward = makeNaSyncDb();
  await reconcileNaMeetings([sweepA, sweepB], { db: forward.db, apply: true, now });
  const reversed = makeNaSyncDb();
  await reconcileNaMeetings([sweepB, sweepA], { db: reversed.db, apply: true, now });

  expect([...forward.store.values()][0]).toMatchObject({ externalId: '100:2' });
  expect([...reversed.store.values()][0]).toMatchObject({ externalId: '100:2' });
});

test('deletes run after writes', async () => {
  const { run, ops } = await seeded(20);
  ops.length = 0;

  await run([regionSweep(100, [...bmltRows(19), bmltRow(500)])]);

  const types = ops.map((op) => op.type);
  expect(types).toContain('set');
  expect(types).toContain('delete');
  expect(types.lastIndexOf('set')).toBeLessThan(types.indexOf('delete'));
});

test('handles more rows than one page or batch holds', async () => {
  const { run, store } = await seeded(1205);
  expect(store.size).toBe(1205);
  const result = await run([regionSweep(100, bmltRows(1205))]);
  expect(result.unchanged).toBe(1205);
});
