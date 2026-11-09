import { REQUEST_DELAY_MS, sweepMeetingGuide, type SweepCell } from './meetingSweep';

const CELL: SweepCell = { s: 40, n: 40.25, w: -74.25, e: -74 };

describe('sweepMeetingGuide rate limiting', () => {
  it('waits as long as a 429 asks before trying again', async () => {
    let limited = true;
    const rateLimited = (async () => {
      if (limited) {
        limited = false;
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '30' }),
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ meetings: [{ id: 1, country: 'US', distance: 0 }] }),
      };
    }) as unknown as typeof fetch;
    const sleep = jest.fn(async () => undefined);
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: rateLimited,
      sleep,
    });
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(result.meetings).toHaveLength(1);
    expect(result.rateLimited).toBe(1);
  });

  it('pauses every worker during a 429, not only the one that received it', async () => {
    let limited = true;
    const started: number[] = [];
    let now = 0;
    const api = (async () => {
      started.push(now);
      if (limited) {
        limited = false;
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '10' }),
          json: async () => ({}),
        };
      }
      return { ok: true, status: 200, json: async () => ({ meetings: [] }) };
    }) as unknown as typeof fetch;
    const sleep = async (ms: number) => {
      await new Promise((r) => setImmediate(r));
      now = Math.max(now, ms);
    };
    const cells = Array.from({ length: 6 }, (_, i) => ({ ...CELL, s: CELL.s + i, n: CELL.n + i }));
    await sweepMeetingGuide({ key: 'k', baseCells: cells, fetchFn: api, sleep, concurrency: 1 });
    expect(started.slice(1).every((t) => t === 10_000)).toBe(true);
  });

  // Small enough that a cell which never resolves stops splitting after a few levels.
  const TINY: SweepCell = { s: 40, n: 40.001, w: -74.001, e: -74 };
  const noSleep = async () => undefined;
  const alwaysCapped = (onCall: () => void = () => undefined) =>
    (async () => {
      onCall();
      const meetings = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        country: 'US',
        distance: 0.001,
      }));
      return { ok: true, status: 200, json: async () => ({ meetings }) };
    }) as unknown as typeof fetch;

  it('holds the concurrency limit while subdivided requests queue up', async () => {
    let running = 0;
    let peak = 0;
    const api = (async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setImmediate(r));
      running--;
      const meetings = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        country: 'US',
        distance: 0.001,
      }));
      return { ok: true, status: 200, json: async () => ({ meetings }) };
    }) as unknown as typeof fetch;
    const cells = [0, 1, 2, 3].map((i) => ({ ...TINY, s: TINY.s + i, n: TINY.n + i }));
    await sweepMeetingGuide({
      key: 'k',
      baseCells: cells,
      fetchFn: api,
      concurrency: 2,
      sleep: noSleep,
    });
    expect(peak).toBe(2);
  });

  it('pauses after each request, so a run never runs flat out', async () => {
    const sleep = jest.fn(async () => undefined);
    const api = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ meetings: [] }),
    })) as unknown as typeof fetch;
    await sweepMeetingGuide({ key: 'k', baseCells: [TINY], fetchFn: api, sleep });
    expect(sleep).toHaveBeenCalledWith(REQUEST_DELAY_MS);
  });

  it('stops at the request budget, so bad API data cannot run away', async () => {
    let calls = 0;
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: alwaysCapped(() => calls++),
      sleep: noSleep,
      maxRequests: 50,
      concurrency: 2,
    });
    expect(result.aborted).toBe('budget');
    expect(calls).toBeLessThanOrEqual(52);
  });

  it('reports progress while it runs, because a full sweep takes many minutes', async () => {
    const onProgress = jest.fn();
    const api = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ meetings: [] }),
    })) as unknown as typeof fetch;
    const cells = [0, 1, 2].map((i) => ({ ...TINY, s: TINY.s + i, n: TINY.n + i }));
    await sweepMeetingGuide({
      key: 'k',
      baseCells: cells,
      fetchFn: api,
      sleep: noSleep,
      onProgress,
      concurrency: 1,
    });
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseCellsDone: 3, baseCells: 3, requests: 3, meetings: 0 }),
    );
  });
});
