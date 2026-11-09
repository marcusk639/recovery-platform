import { sweepMeetingGuide, type SweepCell } from './meetingSweep';

interface FakeMeeting {
  id: number;
  latitude: string;
  longitude: string;
  country?: string;
  /** When set, the API returns this row only for search points inside this box. */
  serviceArea?: SweepCell;
}

const rad = (x: number) => (x * Math.PI) / 180;
function km(a: number, b: number, c: number, d: number): number {
  const x =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/** Behaves as the live API was measured to: nearest first, capped, gated by service area. */
function fakeApi(rows: FakeMeeting[], cap = 500) {
  const urls: string[] = [];
  const fetchFn = jest.fn(async (url: string) => {
    urls.push(url);
    const params = new URL(url).searchParams;
    const lat = Number(params.get('latitude'));
    const lng = Number(params.get('longitude'));
    const radius = Number(params.get('radius'));
    const visible = rows.filter(({ serviceArea: a }) => {
      if (!a) return true;
      return lat >= a.s && lat <= a.n && lng >= a.w && lng <= a.e;
    });
    const meetings = visible
      .map((m) => ({
        ...m,
        country: m.country ?? 'US',
        distance: km(lat, lng, Number(m.latitude), Number(m.longitude)),
      }))
      .filter((m) => m.distance <= radius)
      .sort((x, y) => x.distance - y.distance)
      .slice(0, cap);
    return { ok: true, status: 200, json: async () => ({ meetings, organizations: [] }) };
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, urls, calls: fetchFn };
}

const CELL: SweepCell = { s: 40, n: 40.25, w: -74.25, e: -74 };
const CENTER_LAT = '40.125';
const CENTER_LNG = '-74.125';
const noSleep = async () => undefined;

function denseCluster(count: number): FakeMeeting[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    latitude: String(40 + (i % 50) * 0.005),
    longitude: String(-74.25 + (Math.floor(i / 50) % 50) * 0.005),
  }));
}

describe('sweepMeetingGuide', () => {
  it('sends the key exactly as given, because re-encoding it makes the API reject it', async () => {
    const { fetchFn, urls } = fakeApi([]);
    await sweepMeetingGuide({ key: 'abc%253fdef', baseCells: [CELL], fetchFn, sleep: noSleep });
    expect(urls[0]).toContain('key=abc%253fdef');
  });

  it('makes one request for a cell below the cap', async () => {
    const { fetchFn, calls } = fakeApi([{ id: 1, latitude: CENTER_LAT, longitude: CENTER_LNG }]);
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn,
      sleep: noSleep,
    });
    expect(calls).toHaveBeenCalledTimes(1);
    expect(result.meetings.map((m) => m.id)).toEqual([1]);
    expect(result.cappedResponses).toBe(0);
  });

  it('subdivides capped cells until every meeting in a dense area is found', async () => {
    const { fetchFn } = fakeApi(denseCluster(2000));
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn,
      sleep: noSleep,
    });
    expect(result.meetings).toHaveLength(2000);
    expect(result.cappedResponses).toBeGreaterThan(0);
    expect(result.unresolvedCells).toBe(0);
  });

  it('queries every base cell even when a neighbor came back empty', async () => {
    // The Miami case: the first search point is outside the service area, so it
    // answers empty despite the meeting being inside its radius.
    const neighbor: SweepCell = { s: 40.25, n: 40.5, w: -74.25, e: -74 };
    const { fetchFn } = fakeApi([
      { id: 7, latitude: '40.375', longitude: '-74.125', serviceArea: neighbor },
    ]);
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL, neighbor],
      fetchFn,
      sleep: noSleep,
    });
    expect(result.meetings.map((m) => m.id)).toEqual([7]);
  });

  it('returns a meeting once when overlapping cells both find it', async () => {
    const neighbor: SweepCell = { s: 40.25, n: 40.5, w: -74.25, e: -74 };
    const { fetchFn } = fakeApi([{ id: 3, latitude: '40.25', longitude: '-74.125' }]);
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL, neighbor],
      fetchFn,
      sleep: noSleep,
    });
    expect(result.meetings.map((m) => m.id)).toEqual([3]);
  });

  it.each([
    ['US', true],
    ['us', true],
    ['PR', true],
    ['VI', true],
    ['CA', false],
    ['MX', false],
  ])('treats country %s as in the US: %s', async (country, kept) => {
    const { fetchFn } = fakeApi([{ id: 1, latitude: CENTER_LAT, longitude: CENTER_LNG, country }]);
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn,
      sleep: noSleep,
    });
    expect(result.meetings).toHaveLength(kept ? 1 : 0);
    expect(result.droppedNonUs).toBe(kept ? 0 : 1);
  });

  it('reports a spot it cannot split instead of looping forever', async () => {
    const pile = Array.from({ length: 600 }, (_, i) => ({
      id: i + 1,
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
    }));
    const { fetchFn } = fakeApi(pile);
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn,
      sleep: noSleep,
    });
    expect(result.unresolvedCells).toBeGreaterThan(0);
    expect(result.meetings).toHaveLength(500);
  });

  it('retries a failed request and keeps the result', async () => {
    const { fetchFn: ok } = fakeApi([{ id: 1, latitude: CENTER_LAT, longitude: CENTER_LNG }]);
    let failures = 2;
    const flaky = (async (url: string) => {
      if (failures-- > 0) return { ok: false, status: 503, json: async () => ({}) };
      return (ok as unknown as (u: string) => Promise<unknown>)(url);
    }) as unknown as typeof fetch;
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: flaky,
      sleep: noSleep,
    });
    expect(result.meetings).toHaveLength(1);
    expect(result.failedBaseCells).toBe(0);
  });

  it('counts a base cell as failed once its retries run out', async () => {
    const down = (async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: down,
      sleep: noSleep,
    });
    expect(result.failedBaseCells).toBe(1);
  });

  it('treats a 200 without a meetings array as a failure, not an empty cell', async () => {
    const wrong = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: 'nope' }),
    })) as unknown as typeof fetch;
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: wrong,
      sleep: noSleep,
    });
    expect(result.failedBaseCells).toBe(1);
  });

  it('counts a cell as failed when any of its subdivisions fail', async () => {
    const { fetchFn: ok } = fakeApi(denseCluster(2000));
    let calls = 0;
    const secondOnward = (async (url: string) => {
      calls++;
      if (calls > 1) return { ok: false, status: 503, json: async () => ({}) };
      return (ok as unknown as (u: string) => Promise<unknown>)(url);
    }) as unknown as typeof fetch;
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: secondOnward,
      sleep: noSleep,
    });
    expect(result.failedBaseCells).toBe(1);
  });

  it('stops immediately on 401, because every other request would fail the same way', async () => {
    const calls = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const cells = Array.from({ length: 50 }, (_, i) => ({ ...CELL, s: CELL.s + i, n: CELL.n + i }));
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: cells,
      fetchFn: calls as unknown as typeof fetch,
      sleep: noSleep,
      concurrency: 1,
    });
    expect(result.aborted).toBe('unauthorized');
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('never runs more requests at once than the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    const slow = (async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return { ok: true, status: 200, json: async () => ({ meetings: [] }) };
    }) as unknown as typeof fetch;
    const cells = Array.from({ length: 20 }, (_, i) => ({ ...CELL, s: CELL.s + i, n: CELL.n + i }));
    await sweepMeetingGuide({
      key: 'k',
      baseCells: cells,
      fetchFn: slow,
      sleep: noSleep,
      concurrency: 3,
    });
    expect(peak).toBe(3);
  });
});
