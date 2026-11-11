import { MAX_CONSECUTIVE_FAILED_CELLS, sweepMeetingGuide, type SweepCell } from './meetingSweep';

const CELL: SweepCell = { s: 40, n: 40.25, w: -74.25, e: -74 };
const noSleep = async () => undefined;

describe('sweepMeetingGuide when access fails', () => {
  it('treats 403 as a rejected key too, since a revoked key may answer that way', async () => {
    const calls = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL],
      fetchFn: calls as unknown as typeof fetch,
      sleep: noSleep,
    });
    expect(result.aborted).toBe('unauthorized');
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('gives up when no cell is answering, rather than retrying the whole country', async () => {
    const down = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const cells = Array.from({ length: MAX_CONSECUTIVE_FAILED_CELLS * 3 }, (_, i) => ({
      ...CELL,
      s: CELL.s + i,
      n: CELL.n + i,
    }));
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: cells,
      fetchFn: down as unknown as typeof fetch,
      sleep: noSleep,
      concurrency: 1,
    });
    expect(result.aborted).toBe('unanswered');
    expect(result.failedBaseCells).toBe(MAX_CONSECUTIVE_FAILED_CELLS);
  });

  it('keeps going through scattered failures, because one good answer resets the count', async () => {
    const goodEvery = MAX_CONSECUTIVE_FAILED_CELLS - 1;
    let cell = -1;
    let lastLat = '';
    const flaky = (async (url: string) => {
      const lat = new URL(url).searchParams.get('latitude') ?? '';
      if (lat !== lastLat) cell++;
      lastLat = lat;
      return cell % goodEvery === 0
        ? { ok: true, status: 200, json: async () => ({ meetings: [] }) }
        : { ok: false, status: 500, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const cells = Array.from({ length: goodEvery * 4 }, (_, i) => ({
      ...CELL,
      s: CELL.s + i,
      n: CELL.n + i,
    }));
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: cells,
      fetchFn: flaky,
      sleep: noSleep,
      concurrency: 1,
    });
    expect(result.aborted).toBeUndefined();
    expect(result.failedBaseCells).toBeGreaterThan(MAX_CONSECUTIVE_FAILED_CELLS);
  });
});
