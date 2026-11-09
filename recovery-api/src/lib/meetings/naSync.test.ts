import { purgeNaMeetings, reconcileNaMeetings, runNaSync, NA_SYNC_STATE_DOC_ID } from './naSync';
import { mapBmltMeeting } from './sources/bmlt';
import { IMPORTED, bmltRow, makeNaSyncDb, now, regionSweep } from './testing/naSyncTestDb';

const OLD = 'old-timestamp';
const key = (id: string) => `directoryMeetings/${id}`;
const idOf = (n: number, sourceId = 100) =>
  mapBmltMeeting(bmltRow(n), regionSweep(sourceId, []).region)!.id;

function docOf(store: Map<string, Record<string, unknown>>, n = 1) {
  return store.get(key(idOf(n)))!;
}

/** Ages a stored doc so a test can see which timestamps a later write changes. */
function ageTimestamps(store: Map<string, Record<string, unknown>>, n = 1) {
  const k = key(idOf(n));
  store.set(k, {
    ...store.get(k),
    createdAt: OLD,
    updatedAt: OLD,
    lastSeenAt: OLD,
    lastRefreshedAt: OLD,
  });
}

describe('reconcileNaMeetings writes', () => {
  test('creates new rows with all timestamps and the import date', async () => {
    const { db, store } = makeNaSyncDb();
    const result = await reconcileNaMeetings([regionSweep(100, [bmltRow(1)])], {
      db,
      apply: true,
      now,
    });

    expect(result.created).toBe(1);
    const doc = docOf(store);
    expect(doc.dataAsOf).toBe('2026-11-08');
    expect(doc).toMatchObject({ source: 'external', provider: 'NA', sourceRegion: '100' });
    expect(doc).not.toHaveProperty('id');
    ['createdAt', 'updatedAt', 'lastSeenAt', 'lastRefreshedAt'].forEach((field) =>
      expect(doc[field]).toBeDefined(),
    );
  });

  test('falls back to the run date when the import date cannot be parsed', async () => {
    const { db, store } = makeNaSyncDb();
    await reconcileNaMeetings([regionSweep(100, [bmltRow(1)], { lastSuccessfulImport: null })], {
      db,
      apply: true,
      now,
    });
    expect(docOf(store).dataAsOf).toBe('2026-11-09');
  });

  test('a second run with the same data and import date writes nothing', async () => {
    const { db, commits } = makeNaSyncDb();
    const sweeps = [regionSweep(100, [bmltRow(1)])];
    await reconcileNaMeetings(sweeps, { db, apply: true, now });
    const commitsAfterFirst = commits.count;

    const second = await reconcileNaMeetings(sweeps, { db, apply: true, now });

    expect(second).toMatchObject({ unchanged: 1, created: 0, updated: 0, redated: 0, deleted: 0 });
    expect(commits.count).toBe(commitsAfterFirst);
  });

  test('a newer import redates an unchanged row without touching updatedAt', async () => {
    const { db, store } = makeNaSyncDb();
    await reconcileNaMeetings([regionSweep(100, [bmltRow(1)])], { db, apply: true, now });
    ageTimestamps(store);

    const result = await reconcileNaMeetings(
      [regionSweep(100, [bmltRow(1)], { lastSuccessfulImport: '2026-12-01 01:00:00' })],
      { db, apply: true, now },
    );

    expect(result).toMatchObject({ redated: 1, updated: 0 });
    const doc = docOf(store);
    expect(doc.dataAsOf).toBe('2026-12-01');
    expect(doc.lastSeenAt).not.toBe(OLD);
    expect(doc.lastRefreshedAt).not.toBe(OLD);
    expect(doc.updatedAt).toBe(OLD);
    expect(doc.createdAt).toBe(OLD);
  });

  test('a changed field updates the row, keeps createdAt and drops a removed field', async () => {
    const { db, store } = makeNaSyncDb();
    const phone = { phone_meeting_number: '+15551230000', formats: 'O' };
    await reconcileNaMeetings([regionSweep(100, [bmltRow(1, phone)])], { db, apply: true, now });
    ageTimestamps(store);
    expect(docOf(store).onlineNotes).toBeDefined();

    const result = await reconcileNaMeetings([regionSweep(100, [bmltRow(1, { formats: 'C' })])], {
      db,
      apply: true,
      now,
    });

    expect(result.updated).toBe(1);
    const doc = docOf(store);
    expect(doc.format).toBe('C');
    expect(doc.createdAt).toBe(OLD);
    expect(doc.updatedAt).not.toBe(OLD);
    expect(doc).not.toHaveProperty('onlineNotes');
  });

  test('a row an unhealthy region did return gets the new date', async () => {
    const { db, store } = makeNaSyncDb();
    await reconcileNaMeetings([regionSweep(100, [bmltRow(1)])], { db, apply: true, now });

    const result = await reconcileNaMeetings(
      [
        regionSweep(100, [bmltRow(1)], {
          problem: 'count_mismatch',
          lastSuccessfulImport: '2026-12-01 01:00:00',
        }),
      ],
      { db, apply: true, now },
    );

    expect(result.redated).toBe(1);
    expect(docOf(store).dataAsOf).toBe('2026-12-01');
  });

  test('never touches an app-owned document with the same id', async () => {
    const appDoc = { source: 'app', provider: 'NA', name: 'Mine' };
    const { db, store } = makeNaSyncDb({ [key(idOf(1))]: appDoc });

    const result = await reconcileNaMeetings([regionSweep(100, [bmltRow(1)])], {
      db,
      apply: true,
      now,
    });

    expect(result).toMatchObject({ skippedAppOwned: 1, created: 0 });
    expect(store.get(key(idOf(1)))).toEqual(appDoc);
  });

  test('counts service and unmappable rows separately', async () => {
    const { db } = makeNaSyncDb();
    const result = await reconcileNaMeetings(
      [
        regionSweep(100, [
          bmltRow(1),
          bmltRow(2, { formats: 'ASM' }),
          bmltRow(3, { start_time: 'noon' }),
        ]),
      ],
      { db, apply: true, now },
    );
    expect(result).toMatchObject({ created: 1, excludedService: 1, unmappable: 1 });
  });

  test('a dry run reports the same counts and writes nothing', async () => {
    const applied = makeNaSyncDb();
    const dry = makeNaSyncDb();
    const sweeps = [regionSweep(100, [bmltRow(1), bmltRow(2)])];

    const appliedResult = await reconcileNaMeetings(sweeps, { db: applied.db, apply: true, now });
    const dryResult = await reconcileNaMeetings(sweeps, { db: dry.db, apply: false, now });

    expect(dryResult).toEqual(appliedResult);
    expect(dry.store.size).toBe(0);
    expect(dry.commits.count).toBe(0);
  });
});

describe('runNaSync', () => {
  const regionList = () => [
    ...Array.from({ length: 30 }, (_v, i) => ({
      id: 100 + i,
      sourceId: 200 + i,
      name: `Pad ${i}`,
      statistics: { meetings: { numTotal: 0 } },
      lastSuccessfulImport: IMPORTED,
    })),
    {
      id: 1,
      sourceId: 100,
      name: 'Region 100',
      statistics: { meetings: { numTotal: 1 } },
      lastSuccessfulImport: IMPORTED,
    },
  ];

  const fetchWith = (meetings: unknown[]) =>
    (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/rootservers')) return new Response(JSON.stringify(regionList()));
      const isRegion = new URL(url).searchParams.get('root_server_ids') === '1';
      return new Response(JSON.stringify({ meetings: isRegion ? meetings : [] }));
    }) as unknown as typeof fetch;

  const sleep = async () => undefined;

  test('records the run when applying', async () => {
    const { db, store } = makeNaSyncDb();
    const summary = await runNaSync({
      db,
      apply: true,
      now,
      sleep,
      fetchFn: fetchWith([bmltRow(1)]),
    });

    expect(summary.regions).toBe(31);
    expect(store.get(`refreshState/${NA_SYNC_STATE_DOC_ID}`)).toMatchObject({
      lastRunAt: '2026-11-09T02:00:00.000Z',
      scope: 'all',
      regions: 31,
      unhealthy: [],
      result: { created: 1 },
    });
  });

  test('records a single-region run as that region', async () => {
    const { db, store } = makeNaSyncDb();
    await runNaSync({
      db,
      apply: true,
      now,
      sleep,
      onlyRegion: 100,
      fetchFn: fetchWith([bmltRow(1)]),
    });
    expect(store.get(`refreshState/${NA_SYNC_STATE_DOC_ID}`)).toMatchObject({
      scope: 100,
      regions: 1,
    });
  });

  test('a dry run does not record itself', async () => {
    const { db, store } = makeNaSyncDb();
    await runNaSync({ db, apply: false, now, sleep, fetchFn: fetchWith([bmltRow(1)]) });
    expect(store.size).toBe(0);
  });

  test('reports each region by name with its row count', async () => {
    const { db } = makeNaSyncDb();
    const summary = await runNaSync({
      db,
      apply: false,
      now,
      sleep,
      onlyRegion: 100,
      fetchFn: fetchWith([bmltRow(1)]),
    });
    expect(summary.perRegion).toEqual([{ name: 'Region 100', sourceId: 100, rows: 1 }]);
  });

  test('reports unhealthy regions', async () => {
    const { db } = makeNaSyncDb();
    const summary = await runNaSync({
      db,
      apply: false,
      now,
      sleep,
      fetchFn: fetchWith([bmltRow(1), bmltRow(2)]),
    });
    expect(summary.unhealthy).toEqual([{ sourceId: 100, problem: 'count_mismatch' }]);
  });

  test('throws when every region returned no rows', async () => {
    const { db, store } = makeNaSyncDb();
    await expect(
      runNaSync({ db, apply: true, now, sleep, fetchFn: fetchWith([]) }),
    ).rejects.toThrow(/not changed/);
    expect(store.size).toBe(0);
  });
});

describe('purgeNaMeetings', () => {
  const seed = () => ({
    [key('synced')]: { source: 'external', provider: 'NA', sourceRegion: '100' },
    [key('legacy')]: { source: 'external', provider: 'NA' },
    [key('aa')]: { source: 'external', provider: 'AA', sourceRegion: '100' },
    [key('app')]: { source: 'app', provider: 'NA', sourceRegion: '100' },
  });

  test('removes only rows this sync created', async () => {
    const { db, store } = makeNaSyncDb(seed());
    await expect(purgeNaMeetings({ db, apply: true, now })).resolves.toEqual({ deleted: 1 });
    expect([...store.keys()].sort()).toEqual([key('aa'), key('app'), key('legacy')].sort());
  });

  test('a dry run reports the count and removes nothing', async () => {
    const { db, store } = makeNaSyncDb(seed());
    await expect(purgeNaMeetings({ db, apply: false, now })).resolves.toEqual({ deleted: 1 });
    expect(store.size).toBe(4);
  });
});
