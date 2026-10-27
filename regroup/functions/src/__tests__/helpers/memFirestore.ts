// In-memory Firestore for suites that run real server code against a store of
// docs (membership marks, EES, invitations). Not a suite: jest matches only
// *.test.ts. Wire in lazily so jest's hoisted mock factory never reads an
// uninitialized import:
//
//   jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
//
// Supports where ('==', '>', '<', 'in', 'array-contains'), limit, get, set
// (with merge), update (dotted paths, increment), delete, batch, and a
// simple runTransaction (reads see committed state; writes apply at the end).
// Every doc carries a server createTime (fixed at first write) and updateTime
// (every write); batch.update honours a { lastUpdateTime } precondition and
// throws FAILED_PRECONDITION when the doc changed since it was read.
// mem.beforeCommit runs at the start of each batch commit, to simulate a
// concurrent write landing between a read and the commit.

type Data = Record<string, unknown>;
interface Stored {
  data: Data;
  createTimeMs: number;
  updateTimeMs: number;
}

const store = new Map<string, Stored>();
let clock = 1_000;
let autoId = 0;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const mem = {
  reset(): void {
    store.clear();
    clock = 1_000;
    autoId = 0;
    mem.writes.length = 0;
    mem.beforeCommit = null;
  },
  seed(path: string, data: Data): void {
    clock += 1000;
    store.set(path, { data: clone(data), createTimeMs: clock, updateTimeMs: clock });
  },
  get(path: string): Data | undefined {
    const s = store.get(path);
    return s ? clone(s.data) : undefined;
  },
  paths(prefix: string): string[] {
    return [...store.keys()].filter((p) => p.startsWith(prefix)).sort();
  },
  writes: [] as Array<{ op: string; path: string; data?: Data }>,
  beforeCommit: null as null | (() => void),
};

export const fieldValue = {
  increment: (n: number) => ({ __op: 'increment', n }),
  delete: () => ({ __op: 'delete' }),
  serverTimestamp: () => new Date(clock).toISOString(),
};

function applyUpdate(data: Data, update: Data): Data {
  const out = clone(data);
  for (const [key, value] of Object.entries(update)) {
    const parts = key.split('.');
    let target = out;
    for (const p of parts.slice(0, -1)) {
      target[p] = (target[p] as Data | undefined) ?? {};
      target = target[p] as Data;
    }
    const last = parts[parts.length - 1];
    const op = value as { __op?: string; n?: number } | null;
    if (op && op.__op === 'increment') target[last] = ((target[last] as number) ?? 0) + (op.n ?? 0);
    else if (op && op.__op === 'delete') delete target[last];
    else target[last] = clone(value);
  }
  return out;
}

function writeDoc(path: string, data: Data): void {
  const existing = store.get(path);
  clock += 1000;
  store.set(path, {
    data: clone(data),
    createTimeMs: existing?.createTimeMs ?? clock,
    updateTimeMs: clock,
  });
}

type Precondition = { lastUpdateTime?: { toMillis: () => number } };

function snapshot(path: string) {
  const s = store.get(path);
  const id = path.split('/').pop() ?? '';
  return {
    id,
    exists: s !== undefined,
    ref: docRef(path),
    createTime: s ? { toMillis: () => s.createTimeMs } : undefined,
    updateTime: s ? { toMillis: () => s.updateTimeMs } : undefined,
    data: () => (s ? clone(s.data) : undefined),
  };
}

const ops = {
  set(path: string, data: Data, opts?: { merge?: boolean }) {
    const cur = store.get(path)?.data;
    mem.writes.push({ op: opts?.merge ? 'merge' : 'set', path, data: clone(data) });
    writeDoc(path, opts?.merge && cur ? applyUpdate(cur, data) : data);
  },
  update(path: string, data: Data, pre?: Precondition) {
    const cur = store.get(path);
    if (!cur) throw new Error(`NOT_FOUND: no document to update: ${path}`);
    if (pre?.lastUpdateTime && pre.lastUpdateTime.toMillis() !== cur.updateTimeMs) {
      throw new Error(`FAILED_PRECONDITION: ${path} changed since it was read`);
    }
    mem.writes.push({ op: 'update', path, data: clone(data) });
    writeDoc(path, applyUpdate(cur.data, data));
  },
  create(path: string, data: Data) {
    if (store.has(path)) throw new Error(`ALREADY_EXISTS: ${path}`);
    mem.writes.push({ op: 'create', path, data: clone(data) });
    writeDoc(path, data);
  },
  delete(path: string) {
    mem.writes.push({ op: 'delete', path });
    store.delete(path);
  },
};

function docRef(path: string): any {
  const seg = path.split('/');
  return {
    path,
    id: seg[seg.length - 1],
    get: async () => snapshot(path),
    set: async (d: Data, o?: { merge?: boolean }) => ops.set(path, d, o),
    update: async (d: Data) => ops.update(path, d),
    create: async (d: Data) => ops.create(path, d),
    delete: async () => ops.delete(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}

function matches(d: Data, field: string, op: string, v: unknown): boolean {
  const x = d[field];
  switch (op) {
    case '==':
      return x === v;
    case '>':
      return typeof x === 'number' && x > (v as number);
    case '<':
      return typeof x === 'number' && x < (v as number);
    case 'in':
      return (v as unknown[]).includes(x);
    case 'array-contains':
      return Array.isArray(x) && x.includes(v);
    default:
      throw new Error(`memFirestore: unsupported operator ${op}`);
  }
}

function query(collection: string, filters: Array<[string, string, unknown]>, max = Infinity): any {
  const depth = collection.split('/').length + 1;
  return {
    where: (f: string, op: string, v: unknown) => query(collection, [...filters, [f, op, v]], max),
    limit: (n: number) => query(collection, filters, n),
    get: async () => {
      const docs = [...store.entries()]
        .filter(([p]) => p.startsWith(`${collection}/`) && p.split('/').length === depth)
        .filter(([, s]) => filters.every(([f, op, v]) => matches(s.data, f, op, v)))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(0, max)
        .map(([p]) => snapshot(p));
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  };
}

function collectionRef(path: string): any {
  return {
    ...query(path, []),
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
  };
}

function batch() {
  const pending: Array<() => void> = [];
  return {
    set: (r: { path: string }, d: Data, o?: { merge?: boolean }) => {
      pending.push(() => ops.set(r.path, d, o));
    },
    update: (r: { path: string }, d: Data, pre?: Precondition) => {
      pending.push(() => ops.update(r.path, d, pre));
    },
    create: (r: { path: string }, d: Data) => {
      pending.push(() => ops.create(r.path, d));
    },
    delete: (r: { path: string }) => {
      pending.push(() => ops.delete(r.path));
    },
    commit: async () => {
      if (mem.beforeCommit) mem.beforeCommit();
      // Atomic, like Firestore: one failed write rolls back the whole batch.
      const backup = new Map(store);
      try {
        pending.forEach((fn) => fn());
      } catch (err) {
        store.clear();
        backup.forEach((v, k) => store.set(k, v));
        throw err;
      }
    },
  };
}

/**
 * Optimistic like Firestore for DOCUMENT reads: docs read through tx.get(doc)
 * or tx.getAll are versioned; if any changed before the commit, the whole
 * function runs again (up to 5 times), so two racing transactions cannot both
 * act on the same doc read. QUERY reads (tx.get(query)) are NOT versioned
 * here, unlike Firestore: a doc added to a query's result meanwhile does not
 * re-run the transaction.
 */
async function runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const b = batch();
    const reads = new Map<string, number>();
    const tx = {
      get: async (refOrQuery: { path?: string; get: () => Promise<unknown> }) => {
        if (refOrQuery.path)
          reads.set(refOrQuery.path, store.get(refOrQuery.path)?.updateTimeMs ?? -1);
        return refOrQuery.get();
      },
      getAll: async (...refs: Array<{ path: string; get: () => Promise<unknown> }>) => {
        for (const r of refs) reads.set(r.path, store.get(r.path)?.updateTimeMs ?? -1);
        return Promise.all(refs.map((r) => r.get()));
      },
      set: (r: { path: string }, d: Data, o?: { merge?: boolean }) => {
        b.set(r, d, o);
        return tx;
      },
      update: (r: { path: string }, d: Data) => {
        b.update(r, d);
        return tx;
      },
      create: (r: { path: string }, d: Data) => {
        b.create(r, d);
        return tx;
      },
      delete: (r: { path: string }) => {
        b.delete(r);
        return tx;
      },
    };
    const result = await fn(tx);
    const conflicted = [...reads].some(([path, t]) => (store.get(path)?.updateTimeMs ?? -1) !== t);
    if (conflicted) {
      if (attempt >= 5) throw new Error('ABORTED: transaction contention');
      continue;
    }
    await b.commit();
    return result;
  }
}

export const memDb: any = {
  collection: (name: string) => collectionRef(name),
  doc: (path: string) => docRef(path),
  getAll: async (...refs: Array<{ get: () => Promise<unknown> }>) =>
    Promise.all(refs.map((r) => r.get())),
  batch,
  runTransaction,
};

/** Drop-in for '../../api/firestore' (only the parts these suites use). */
export const apiFirestore = {
  ratsFirestore: memDb,
  guestCollection: collectionRef('guests'),
  houseCollection: collectionRef('houses'),
  userCollection: collectionRef('users'),
  invitationCollection: collectionRef('invitations'),
  adminCollection: collectionRef('admins'),
  houseRolesCollection: collectionRef('house-roles'),
};
