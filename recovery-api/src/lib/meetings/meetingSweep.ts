import type { MeetingGuideMeeting } from './sources/meetingGuide';

/**
 * Crawls Meeting Guide across a set of base cells. How it behaves was measured
 * against the live API on 2026-11-08, and each rule below follows from that:
 *
 * - A response holds at most 500 meetings, nearest first, and `radius` stops
 *   mattering once capped. Paging and filter params are ignored. So a capped cell
 *   is complete only out to its last result and must be split to see further.
 * - Only organizations whose service area contains the search point are returned.
 *   A point 45 km off Miami answered empty at a 106 km radius. So an empty or short
 *   answer says nothing reliable about the rest of its circle, and neighbors are
 *   always queried. Base cells must be small enough that a search point lands
 *   inside every organization's area.
 */

export const RESPONSE_CAP = 500;
/** Below this a capped cell is one address, which subdividing can't separate. */
const MIN_HALF_DIAGONAL_KM = 0.02;
/** `distance` is rounded to two decimals, so back off before trusting the last row. */
const DISTANCE_ROUNDING_KM = 0.02;
const DEFAULT_CONCURRENCY = 4;
/** Measured need is about 15,000 requests, so this only trips if something is wrong. */
const DEFAULT_MAX_REQUESTS = 60_000;
/** Each worker rests this long between requests, to stay gentle on the API. */
export const REQUEST_DELAY_MS = 100;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 600;
const US_COUNTRIES = new Set(['US', 'PR', 'VI', 'GU', 'AS', 'MP']);

export interface SweepCell {
  s: number;
  n: number;
  w: number;
  e: number;
}

export interface SweepOptions {
  /** Inserted into the URL as given: it is already encoded, and encoding it again breaks it. */
  key: string;
  baseCells: readonly SweepCell[];
  fetchFn?: typeof fetch;
  concurrency?: number;
  /** Injected so retry tests don't wait out the backoff. */
  sleep?: (ms: number) => Promise<void>;
  /** The run stops here rather than letting bad API data split cells without end. */
  maxRequests?: number;
  onProgress?: (progress: SweepProgress) => void;
}

export interface SweepProgress {
  baseCellsDone: number;
  baseCells: number;
  requests: number;
  meetings: number;
}

export interface SweepResult {
  meetings: MeetingGuideMeeting[];
  baseCells: number;
  requests: number;
  cappedResponses: number;
  /** Base cells with at least one request that never succeeded. */
  failedBaseCells: number;
  /** Single spots holding more meetings than one response can return. */
  unresolvedCells: number;
  droppedNonUs: number;
  /** 429 responses received. Non-zero means the concurrency should come down. */
  rateLimited: number;
  aborted?: 'unauthorized' | 'budget';
}

class Unauthorized extends Error {}

function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers?.get('retry-after'));
  const wait = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(wait, MAX_RETRY_AFTER_SECONDS) * 1000;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function center(c: SweepCell): { lat: number; lng: number } {
  return { lat: (c.s + c.n) / 2, lng: (c.w + c.e) / 2 };
}

function halfDiagonalKm(c: SweepCell): number {
  const { lat, lng } = center(c);
  return Math.max(
    haversineKm(lat, lng, c.s, c.w),
    haversineKm(lat, lng, c.s, c.e),
    haversineKm(lat, lng, c.n, c.w),
    haversineKm(lat, lng, c.n, c.e),
  );
}

function quarters(c: SweepCell): SweepCell[] {
  const { lat, lng } = center(c);
  return [
    { s: c.s, n: lat, w: c.w, e: lng },
    { s: c.s, n: lat, w: lng, e: c.e },
    { s: lat, n: c.n, w: c.w, e: lng },
    { s: lat, n: c.n, w: lng, e: c.e },
  ];
}

export async function sweepMeetingGuide(options: SweepOptions): Promise<SweepResult> {
  const { key, baseCells } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;

  const found = new Map<number, MeetingGuideMeeting>();
  const result: SweepResult = {
    meetings: [],
    baseCells: baseCells.length,
    requests: 0,
    cappedResponses: 0,
    failedBaseCells: 0,
    unresolvedCells: 0,
    droppedNonUs: 0,
    rateLimited: 0,
  };
  const droppedIds = new Set<number>();

  let active = 0;
  const waiting: Array<() => void> = [];
  async function withSlot<T>(work: () => Promise<T>): Promise<T> {
    // A loop, not an if: a freed slot can be taken before the woken waiter runs.
    while (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await work();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  // Shared across workers: the limit applies to the key, so one 429 pauses everyone.
  let pause: Promise<void> | null = null;
  function pauseAll(ms: number): void {
    pause ??= sleep(ms).finally(() => {
      pause = null;
    });
  }

  async function request(cell: SweepCell, radiusKm: number): Promise<MeetingGuideMeeting[] | null> {
    const { lat, lng } = center(cell);
    const url =
      `https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}` +
      `&radius=${radiusKm}&language=en&search=&key=${key}`;
    let backoff = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (backoff) await sleep(1000 * 2 ** (attempt - 1));
      backoff = true;
      while (pause) await pause;
      if (result.requests >= maxRequests) result.aborted ??= 'budget';
      if (result.aborted) return null;
      result.requests++;
      try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (res.status === 401) throw new Unauthorized();
        if (res.status === 429) {
          result.rateLimited++;
          pauseAll(retryAfterMs(res));
          backoff = false;
          continue;
        }
        if (res.ok) {
          const body = (await res.json()) as { meetings?: unknown } | null;
          if (Array.isArray(body?.meetings)) return body.meetings as MeetingGuideMeeting[];
        }
      } catch (err) {
        if (err instanceof Unauthorized) throw err;
      }
    }
    return null;
  }

  /** Returns false if any request under this cell failed. */
  async function crawl(cell: SweepCell): Promise<boolean> {
    const halfDiagonal = halfDiagonalKm(cell);
    const radiusKm = Math.ceil(halfDiagonal * 1.02) + 1;
    const meetings = await withSlot(async () => {
      const response = await request(cell, radiusKm);
      await sleep(REQUEST_DELAY_MS);
      return response;
    });
    if (meetings === null) return false;

    for (const m of meetings) {
      if (US_COUNTRIES.has(String(m.country ?? '').toUpperCase())) found.set(m.id, m);
      else droppedIds.add(m.id);
    }
    if (meetings.length < RESPONSE_CAP) return true;

    result.cappedResponses++;
    const reach = Math.max(...meetings.map((m) => Number(m.distance))) - DISTANCE_ROUNDING_KM;
    if (reach >= halfDiagonal) return true;
    if (halfDiagonal < MIN_HALF_DIAGONAL_KM) {
      result.unresolvedCells++;
      return true;
    }
    const parts = await Promise.all(quarters(cell).map(crawl));
    return parts.every(Boolean);
  }

  let next = 0;
  let baseCellsDone = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < baseCells.length && !result.aborted) {
      const cell = baseCells[next++];
      try {
        if (!(await crawl(cell))) result.failedBaseCells++;
      } catch (err) {
        if (!(err instanceof Unauthorized)) throw err;
        result.aborted = 'unauthorized';
      }
      baseCellsDone++;
      options.onProgress?.({
        baseCellsDone,
        baseCells: baseCells.length,
        requests: result.requests,
        meetings: found.size,
      });
    }
  });
  await Promise.all(workers);

  result.meetings = [...found.values()];
  result.droppedNonUs = droppedIds.size;
  return result;
}
