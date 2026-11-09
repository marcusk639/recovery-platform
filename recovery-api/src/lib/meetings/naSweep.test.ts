import { BMLT_FIELDS } from './sources/bmlt';
import { AGGREGATOR_BASE, fetchBmltRegions, sweepBmlt, type NaSweepDeps } from './naSweep';

const RECENT = '2026-11-08 23:44:02';
const now = () => new Date('2026-11-09T02:00:00Z');
const sleep = async () => undefined;

interface RegionOpts {
  id: number;
  sourceId?: number;
  numTotal?: number;
  lastSuccessfulImport?: string | null;
}

const regionJson = ({ id, sourceId, numTotal = 2, lastSuccessfulImport = RECENT }: RegionOpts) => ({
  id,
  sourceId: sourceId ?? id + 99,
  name: `Region ${id}`,
  statistics: { meetings: { numTotal } },
  lastSuccessfulImport,
});

/** Thirty extra healthy, empty regions so a list clears MIN_EXPECTED_REGIONS. */
const padding = Array.from({ length: 30 }, (_v, i) => regionJson({ id: 1000 + i, numTotal: 0 }));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

type RowsHandler = (regionId: number, attempt: number) => Response;

function makeFetch(regions: RegionOpts[], rows: RowsHandler) {
  const attempts = new Map<number, number>();
  return jest.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/v1/rootservers')) {
      return json([...regions.map(regionJson), ...padding]);
    }
    const id = Number(new URL(url).searchParams.get('root_server_ids'));
    const attempt = (attempts.get(id) ?? 0) + 1;
    attempts.set(id, attempt);
    return id >= 1000 ? json({ meetings: [], formats: [] }) : rows(id, attempt);
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

const deps = (fetchFn: typeof fetch, over: Partial<NaSweepDeps> = {}): NaSweepDeps => ({
  fetchFn,
  now,
  sleep,
  ...over,
});

const twoRows = { meetings: [{ source_id: 1 }, { source_id: 2 }], formats: [] };

async function sweepOne(region: RegionOpts, rows: RowsHandler) {
  const result = await sweepBmlt(deps(makeFetch([region], rows)));
  return result.find((s) => s.region.id === region.id)!;
}

test('every row request is filtered by region and asks only for allowlisted fields', async () => {
  const fetchFn = makeFetch([{ id: 1 }], () => json(twoRows));
  await sweepBmlt(deps(fetchFn));

  const url = fetchFn.mock.calls
    .map(([input]) => new URL(String(input)))
    .find((u) => u.searchParams.get('root_server_ids') === '1')!;
  expect(url.origin + url.pathname).toBe(`${AGGREGATOR_BASE}/client_interface/json/`);
  expect(url.searchParams.get('switcher')).toBe('GetSearchResults');
  expect(url.searchParams.get('data_field_key')).toBe(BMLT_FIELDS.join(','));
  expect(url.href).not.toMatch(/contact|comments/);
});

test('sends a descriptive user agent', async () => {
  const fetchFn = makeFetch([{ id: 1 }], () => json(twoRows));
  await sweepBmlt(deps(fetchFn));
  for (const [, init] of fetchFn.mock.calls) {
    expect(new Headers(init?.headers).get('User-Agent')).toBe('RecoveryPlatformDirectorySync/1.0');
  }
});

test('a region whose count matches and whose import is recent has no problem', async () => {
  const sweep = await sweepOne({ id: 1 }, () => json(twoRows));
  expect(sweep.problem).toBeUndefined();
  expect(sweep.rows).toHaveLength(2);
});

test('accepts both response shapes', async () => {
  const wrapped = await sweepOne({ id: 1 }, () => json(twoRows));
  const bare = await sweepOne({ id: 1 }, () => json(twoRows.meetings));
  expect(bare.rows).toEqual(wrapped.rows);
  expect(bare.problem).toBeUndefined();
});

test('an empty 200 is a count mismatch, not an empty region', async () => {
  const sweep = await sweepOne({ id: 1 }, () => json({ meetings: [], formats: [] }));
  expect(sweep.problem).toBe('count_mismatch');
  expect(sweep.rows).toEqual([]);
});

test('a short answer keeps its rows but is flagged', async () => {
  const sweep = await sweepOne({ id: 1 }, () => json({ meetings: [{ source_id: 1 }] }));
  expect(sweep.problem).toBe('count_mismatch');
  expect(sweep.rows).toHaveLength(1);
});

test.each([['2026-11-06 01:00:00'], [null], ['not a date']])(
  'an import of %s is stale',
  async (lastSuccessfulImport) => {
    const sweep = await sweepOne({ id: 1, lastSuccessfulImport }, () => json(twoRows));
    expect(sweep.problem).toBe('stale_import');
    expect(sweep.rows).toHaveLength(2);
  },
);

test('an import just inside 48 hours is not stale', async () => {
  const sweep = await sweepOne({ id: 1, lastSuccessfulImport: '2026-11-07 02:30:00' }, () =>
    json(twoRows),
  );
  expect(sweep.problem).toBeUndefined();
});

test('a request that fails twice is flagged without failing the other regions', async () => {
  const fetchFn = makeFetch([{ id: 1 }, { id: 2 }], (id) =>
    id === 1 ? json({}, 500) : json(twoRows),
  );
  const result = await sweepBmlt(deps(fetchFn));

  const first = result.find((s) => s.region.id === 1)!;
  expect(first.problem).toBe('fetch_failed');
  expect(first.rows).toEqual([]);
  expect(result.find((s) => s.region.id === 2)!.problem).toBeUndefined();
  const firstCalls = fetchFn.mock.calls.filter(
    ([input]) => new URL(String(input)).searchParams.get('root_server_ids') === '1',
  );
  expect(firstCalls).toHaveLength(2);
});

test('a request that fails once and then succeeds is healthy', async () => {
  const sweep = await sweepOne({ id: 1 }, (_id, attempt) =>
    attempt === 1 ? json({}, 503) : json(twoRows),
  );
  expect(sweep.problem).toBeUndefined();
});

test('a network error counts as a failed request', async () => {
  const fetchFn = jest.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith('/api/v1/rootservers')) {
      return json([regionJson({ id: 1 }), ...padding]);
    }
    if (new URL(String(input)).searchParams.get('root_server_ids') === '1') {
      throw new Error('socket hang up');
    }
    return json({ meetings: [] });
  }) as unknown as typeof fetch;
  const result = await sweepBmlt(deps(fetchFn));
  expect(result.find((s) => s.region.id === 1)!.problem).toBe('fetch_failed');
});

test.each([
  ['HTML', new Response('<html>busy</html>')],
  ['a body with no rows', json({ error: 'nope' })],
])('a 200 with %s counts as a failed request', async (_label, response) => {
  const sweep = await sweepOne({ id: 1 }, () => response.clone());
  expect(sweep.problem).toBe('fetch_failed');
});

test.each([
  ['HTTP 500', () => json({}, 500)],
  ['a non-array', () => json({ regions: [] })],
  ['too few regions', () => json([regionJson({ id: 1 })])],
])('a bad region list throws so nothing changes: %s', async (_label, list) => {
  const fetchFn = jest.fn(async () => list()) as unknown as typeof fetch;
  await expect(fetchBmltRegions(deps(fetchFn))).rejects.toThrow(/region list/);
  await expect(sweepBmlt(deps(fetchFn))).rejects.toThrow(/region list/);
});

test('fetchBmltRegions maps the list', async () => {
  const fetchFn = makeFetch([{ id: 1, sourceId: 100, numTotal: 7 }], () => json(twoRows));
  const regions = await fetchBmltRegions(deps(fetchFn));
  expect(regions[0]).toEqual({
    id: 1,
    sourceId: 100,
    name: 'Region 1',
    expectedMeetings: 7,
    lastSuccessfulImport: RECENT,
  });
});

test('onlyRegion sweeps just that region', async () => {
  const fetchFn = makeFetch(
    [
      { id: 1, sourceId: 100 },
      { id: 2, sourceId: 101 },
    ],
    () => json(twoRows),
  );
  const result = await sweepBmlt(deps(fetchFn, { onlyRegion: 101 }));

  expect(result.map((s) => s.region.sourceId)).toEqual([101]);
  const swept = fetchFn.mock.calls
    .map(([input]) => new URL(String(input)).searchParams.get('root_server_ids'))
    .filter(Boolean);
  expect(swept).toEqual(['2']);
});

test('onlyRegion rejects an unknown region', async () => {
  const fetchFn = makeFetch([{ id: 1 }], () => json(twoRows));
  await expect(sweepBmlt(deps(fetchFn, { onlyRegion: 999 }))).rejects.toThrow(/999/);
});

test('results come back in the same order as the region list', async () => {
  const fetchFn = makeFetch([{ id: 3 }, { id: 1 }, { id: 2 }], () => json(twoRows));
  const result = await sweepBmlt(deps(fetchFn));
  expect(result.slice(0, 3).map((s) => s.region.id)).toEqual([3, 1, 2]);
});
