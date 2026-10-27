// In-memory stand-in for the slice of the Admin SDK that the week-summary
// code uses: doc get, where/orderBy/get queries, and runTransaction with
// tx.get / tx.set. Nothing here can reach a real project.
//
// Transactions buffer writes and apply them on commit, so a test can make a
// transaction fail (failTransactions) and see that nothing was written.

type Data = Record<string, any>;

const comparable = (v: unknown): unknown => {
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return v;
};

const OPS: Record<string, (a: any, b: any) => boolean> = {
  '==': (a, b) => a === b,
  '>=': (a, b) => a >= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
};

export class FakeFirestore {
  readonly collections = new Map<string, Map<string, Data>>();
  readonly writes: Array<{ collection: string; id: string; data: Data }> = [];
  transactions = 0;
  readOnlyTransactions = 0;
  readonly queries: Array<{ collection: string; spec: unknown }> = [];
  /** Number of upcoming transactions that should throw instead of committing. */
  failTransactions = 0;
  failWith: Error = Object.assign(new Error('unavailable'), { code: 14 });

  private col(name: string): Map<string, Data> {
    let c = this.collections.get(name);
    if (!c) {
      c = new Map();
      this.collections.set(name, c);
    }
    return c;
  }

  seed(collection: string, id: string, data: Data): void {
    this.col(collection).set(id, data);
  }

  read(collection: string, id: string): Data | undefined {
    return this.col(collection).get(id);
  }

  collection(name: string) {
    return new FakeQuery(this, name);
  }

  docRef(collection: string, id: string) {
    const db = this;
    return {
      id,
      collection,
      async get() {
        const data = db.col(collection).get(id);
        return { exists: data !== undefined, id, data: () => data };
      },
    };
  }

  runQuery(collection: string, spec: QuerySpec) {
    let entries = [...this.col(collection).entries()].filter(([, data]) =>
      spec.filters.every(([field, op, value]) => OPS[op](comparable(data[field]), comparable(value))),
    );
    if (spec.order) {
      const [field, dir] = spec.order;
      const sign = dir === 'desc' ? -1 : 1;
      entries.sort(([ia, a], [ib, b]) => {
        const x = comparable(a[field]) as any;
        const y = comparable(b[field]) as any;
        return x === y ? ia.localeCompare(ib) : x < y ? -sign : sign;
      });
    }
    if (spec.afterId !== undefined) {
      entries = entries.slice(entries.findIndex(([id]) => id === spec.afterId) + 1);
    }
    if (spec.limit !== undefined) entries = entries.slice(0, spec.limit);
    this.queries.push({ collection, spec });
    const docs = entries.map(([id, data]) => ({
      id,
      data: () => data,
      ref: this.docRef(collection, id),
    }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>, options?: { readOnly?: boolean }): Promise<T> {
    this.transactions++;
    if (options?.readOnly) this.readOnlyTransactions++;
    const staged: Array<{ collection: string; id: string; data: Data }> = [];
    const tx = {
      get: (target: { get: () => Promise<unknown> }) => target.get(),
      set: (ref: { collection: string; id: string }, data: Data) => {
        // The real SDK rejects writes in a read-only transaction.
        if (options?.readOnly) throw new Error('write in a read-only transaction');
        staged.push({ collection: ref.collection, id: ref.id, data });
      },
    };
    const result = await fn(tx);
    if (this.failTransactions > 0) {
      this.failTransactions--;
      throw this.failWith;
    }
    for (const w of staged) {
      this.col(w.collection).set(w.id, w.data);
      this.writes.push(w);
    }
    return result;
  }
}

interface QuerySpec {
  filters: Array<[string, string, unknown]>;
  order?: [string, string];
  limit?: number;
  afterId?: string;
}

class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly name: string,
    private readonly spec: QuerySpec = { filters: [] },
  ) {}

  doc(id: string) {
    return this.db.docRef(this.name, id);
  }

  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.db, this.name, {
      ...this.spec,
      filters: [...this.spec.filters, [field, op, value]],
    });
  }

  orderBy(field: string, dir = 'asc') {
    return new FakeQuery(this.db, this.name, { ...this.spec, order: [field, dir] });
  }

  limit(n: number) {
    return new FakeQuery(this.db, this.name, { ...this.spec, limit: n });
  }

  startAfter(doc: { id: string }) {
    return new FakeQuery(this.db, this.name, { ...this.spec, afterId: doc.id });
  }

  async get() {
    return this.db.runQuery(this.name, this.spec);
  }
}

export const asFirestore = (db: FakeFirestore) => db as unknown as FirebaseFirestore.Firestore;
