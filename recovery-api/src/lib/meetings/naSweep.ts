import { BMLT_FIELDS, type BmltRegion, type BmltRow } from './sources/bmlt';

/**
 * Reads every region from the BMLT aggregator and judges whether each answer can
 * be trusted as complete. A region with a problem still returns whatever rows it
 * gave, because those are real listings. The problem only stops deletions.
 */

export const AGGREGATOR_BASE = 'https://aggregator.bmltenabled.org/main_server';
/** 44 were listed on 2026-11-08. Far fewer means the list itself is wrong. */
export const MIN_EXPECTED_REGIONS = 30;
export const STALE_IMPORT_HOURS = 48;
export const SWEEP_CONCURRENCY = 3;
export const REQUEST_TIMEOUT_MS = 120_000;
export const MAX_ATTEMPTS = 2;
const REQUEST_DELAY_MS = 400;
const USER_AGENT = 'RecoveryPlatformDirectorySync/1.0';

export type RegionProblem = 'fetch_failed' | 'count_mismatch' | 'stale_import';

export interface RegionSweep {
  region: BmltRegion;
  rows: BmltRow[];
  problem?: RegionProblem;
}

export interface NaSweepDeps {
  fetchFn?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** A region `sourceId`; sweeps only that region. */
  onlyRegion?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The aggregator's "2026-11-08 23:44:02" has no zone and is treated as UTC. */
export function parseImportTime(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getJson(url: string, deps: NaSweepDeps): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(REQUEST_DELAY_MS);
    }
  }
  throw lastError;
}

interface RawRegion {
  id?: unknown;
  sourceId?: unknown;
  name?: unknown;
  statistics?: { meetings?: { numTotal?: unknown } };
  lastSuccessfulImport?: unknown;
}

export async function fetchBmltRegions(deps: NaSweepDeps): Promise<BmltRegion[]> {
  let reason = 'it looks wrong';
  const body = await getJson(`${AGGREGATOR_BASE}/api/v1/rootservers`, deps).catch(
    (err: unknown) => {
      reason = String(err);
      return null;
    },
  );
  if (!Array.isArray(body) || body.length < MIN_EXPECTED_REGIONS) {
    throw new Error(`Could not use the BMLT region list (${reason}), so nothing was changed`);
  }
  return (body as RawRegion[]).map((region) => ({
    id: Number(region.id),
    sourceId: Number(region.sourceId),
    name: String(region.name),
    expectedMeetings: Number(region.statistics?.meetings?.numTotal),
    lastSuccessfulImport:
      typeof region.lastSuccessfulImport === 'string' ? region.lastSuccessfulImport : null,
  }));
}

function rowsFrom(body: unknown): BmltRow[] {
  if (Array.isArray(body)) return body as BmltRow[];
  const meetings = (body as { meetings?: unknown } | null)?.meetings;
  if (Array.isArray(meetings)) return meetings as BmltRow[];
  throw new Error('Response has no meetings');
}

function isStale(region: BmltRegion, now: Date): boolean {
  const imported = parseImportTime(region.lastSuccessfulImport);
  if (!imported) return true;
  return now.getTime() - imported.getTime() > STALE_IMPORT_HOURS * 3_600_000;
}

async function sweepRegion(region: BmltRegion, deps: NaSweepDeps): Promise<RegionSweep> {
  const query = new URLSearchParams({
    switcher: 'GetSearchResults',
    root_server_ids: String(region.id),
    data_field_key: BMLT_FIELDS.join(','),
  });

  let rows: BmltRow[];
  try {
    rows = rowsFrom(await getJson(`${AGGREGATOR_BASE}/client_interface/json/?${query}`, deps));
  } catch {
    return { region, rows: [], problem: 'fetch_failed' };
  }

  if (rows.length !== region.expectedMeetings) {
    return { region, rows, problem: 'count_mismatch' };
  }
  const now = deps.now ? deps.now() : new Date();
  return isStale(region, now) ? { region, rows, problem: 'stale_import' } : { region, rows };
}

export async function sweepBmlt(deps: NaSweepDeps): Promise<RegionSweep[]> {
  const regions = await fetchBmltRegions(deps);
  const selected =
    deps.onlyRegion === undefined
      ? regions
      : regions.filter((region) => region.sourceId === deps.onlyRegion);
  if (selected.length === 0) {
    throw new Error(`BMLT has no region with sourceId ${deps.onlyRegion}`);
  }

  const sleep = deps.sleep ?? realSleep;
  const results: RegionSweep[] = new Array(selected.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < selected.length) {
      const index = next++;
      results[index] = await sweepRegion(selected[index], deps);
      await sleep(REQUEST_DELAY_MS);
    }
  };
  await Promise.all(Array.from({ length: SWEEP_CONCURRENCY }, worker));
  return results;
}
