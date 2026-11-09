/**
 * In-memory Firestore mock covering exactly the surface the directory refresh
 * path uses:
 *  - collection(name).doc(id).get()/set()      (cursor read/write, per-cell read)
 *  - db.batch().set/delete/commit              (ingest upsert + prune delete)
 *  - collection(name).where()...limit().get()  (prune query)
 */

export interface MockDoc {
  source?: string;
  lastSeenAt?: { toMillis: () => number };
  [k: string]: unknown;
}

type MockFilter = { field: string; op: string; value: unknown };
type MockOp =
  { type: 'set'; key: string; data: MockDoc; merge: boolean } | { type: 'delete'; key: string };

function matches(data: MockDoc, filter: MockFilter): boolean {
  const value = data[filter.field];
  if (filter.op === '==') return value === filter.value;
  if (filter.op === '<') {
    const lhs = (value as { toMillis?: () => number })?.toMillis?.();
    const rhs = (filter.value as { toMillis?: () => number })?.toMillis?.();
    return lhs !== undefined && rhs !== undefined && lhs < rhs;
  }
  return true;
}

/** A location inside the live sweep's grid. */
export const IN_GRID = { lat: 40, lng: -100 };

/** Recently seen rows, so a stale row is a small share of its provider. */
export function freshRows(provider: string, count: number): Record<string, MockDoc> {
  const rows: Record<string, MockDoc> = {};
  for (let i = 0; i < count; i++) {
    rows[`directoryMeetings/fresh-${provider}-${i}`] = {
      source: 'external',
      provider,
      location: IN_GRID,
      lastSeenAt: { toMillis: () => new Date('2026-11-01T00:00:00Z').getTime() },
    };
  }
  return rows;
}

export function makeDirectoryDb(seed: Record<string, MockDoc> = {}) {
  const store = new Map<string, MockDoc>(Object.entries(seed));

  function docRef(name: string, id: string) {
    const key = `${name}/${id}`;
    return {
      id,
      ref: { __key: key },
      get: async () => ({
        id,
        exists: store.has(key),
        data: () => store.get(key),
      }),
      set: async (data: MockDoc, opts?: { merge?: boolean }) => {
        const prev = opts?.merge ? (store.get(key) ?? {}) : {};
        store.set(key, { ...prev, ...data });
      },
    };
  }

  function collection(name: string) {
    const filters: MockFilter[] = [];
    let max = Infinity;
    let afterKey: string | undefined;
    const api = {
      doc: (id: string) => docRef(name, id),
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
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
      count() {
        return {
          get: async () => ({
            data: () => ({
              count: [...store.entries()]
                .filter(([key]) => key.startsWith(`${name}/`))
                .filter(([, data]) => filters.every((f) => matches(data, f))).length,
            }),
          }),
        };
      },
      get: async () => {
        const docs = [...store.entries()]
          .filter(([key]) => key.startsWith(`${name}/`))
          .filter(([key]) => afterKey === undefined || key > afterKey)
          .filter(([, data]) => filters.every((f) => matches(data, f)))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(0, max)
          .map(([key, data]) => ({
            id: key.split('/').slice(1).join('/'),
            data: () => data,
            ref: { __key: key },
          }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return api;
  }

  const batch = () => {
    const ops: MockOp[] = [];
    return {
      set: (ref: { id: string }, data: MockDoc, opts?: { merge?: boolean }) => {
        ops.push({
          type: 'set',
          key: `directoryMeetings/${ref.id}`,
          data,
          merge: opts?.merge ?? false,
        });
      },
      delete: (ref: { __key: string }) => {
        ops.push({ type: 'delete', key: ref.__key });
      },
      commit: async () => {
        for (const op of ops) {
          if (op.type === 'set') {
            const prev = op.merge ? (store.get(op.key) ?? {}) : {};
            store.set(op.key, { ...prev, ...op.data });
          } else {
            store.delete(op.key);
          }
        }
        ops.length = 0;
      },
    };
  };

  const db = { collection, batch } as unknown as FirebaseFirestore.Firestore;

  return { db, store };
}
