import type { RegionProblem, RegionSweep } from '../naSweep';
import type { BmltRow } from '../sources/bmlt';

/**
 * In-memory Firestore covering exactly what the NA sync uses, plus fixtures. It
 * records batch operations and commits so tests can check what was written, in
 * what order, without a real database.
 */

type Doc = Record<string, unknown>;
type Op = { type: 'set' | 'delete'; key: string; data?: Doc; merge?: boolean };

export function makeNaSyncDb(seed: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(seed));
  const ops: Op[] = [];
  const commits = { count: 0 };

  function collection(name: string) {
    const filters: Array<{ field: string; value: unknown }> = [];
    let max = Infinity;
    let afterKey: string | undefined;
    const api = {
      doc: (id: string) => ({
        id,
        __key: `${name}/${id}`,
        set: async (data: Doc) => {
          store.set(`${name}/${id}`, data);
        },
      }),
      where(field: string, _op: string, value: unknown) {
        filters.push({ field, value });
        return api;
      },
      limit(n: number) {
        max = n;
        return api;
      },
      startAfter(doc: { id: string }) {
        afterKey = `${name}/${doc.id}`;
        return api;
      },
      get: async () => {
        const docs = [...store.entries()]
          .filter(([key]) => key.startsWith(`${name}/`))
          .filter(([key]) => afterKey === undefined || key > afterKey)
          .filter(([, data]) => filters.every((f) => data[f.field] === f.value))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(0, max)
          .map(([key, data]) => ({
            id: key.slice(name.length + 1),
            data: () => data,
            ref: { __key: key },
          }));
        return { docs };
      },
    };
    return api;
  }

  const batch = () => {
    const pending: Op[] = [];
    return {
      set: (ref: { __key: string }, data: Doc, opts?: { merge?: boolean }) => {
        pending.push({ type: 'set', key: ref.__key, data, merge: opts?.merge ?? false });
      },
      delete: (ref: { __key: string }) => {
        pending.push({ type: 'delete', key: ref.__key });
      },
      commit: async () => {
        commits.count++;
        for (const op of pending) {
          ops.push(op);
          if (op.type === 'delete') store.delete(op.key);
          else store.set(op.key, { ...(op.merge ? store.get(op.key) : {}), ...op.data });
        }
        pending.length = 0;
      },
    };
  };

  const db = { collection, batch } as unknown as FirebaseFirestore.Firestore;
  return { db, store, ops, commits };
}

export const IMPORTED = '2026-11-08 23:44:02';
export const now = () => new Date('2026-11-09T02:00:00Z');

/** A valid in-person BMLT row, distinct for each `n`. */
export function bmltRow(n: number, over: BmltRow = {}): BmltRow {
  return {
    source_id: n,
    meeting_name: `Meeting ${n}`,
    weekday_tinyint: '1',
    start_time: '19:30:00',
    venue_type: '1',
    formats: 'O',
    latitude: '33.04',
    longitude: '-96.99',
    location_street: '1 Main St',
    location_municipality: 'Dallas',
    location_province: 'TX',
    published: '1',
    ...over,
  };
}

export function bmltRows(count: number): BmltRow[] {
  return Array.from({ length: count }, (_v, i) => bmltRow(i + 1));
}

export function regionSweep(
  sourceId: number,
  rows: BmltRow[],
  over: { problem?: RegionProblem; lastSuccessfulImport?: string | null } = {},
): RegionSweep {
  const { problem, lastSuccessfulImport = IMPORTED } = over;
  return {
    region: {
      id: sourceId - 99,
      sourceId,
      name: `Region ${sourceId}`,
      expectedMeetings: rows.length,
      lastSuccessfulImport,
    },
    rows,
    ...(problem ? { problem } : {}),
  };
}
