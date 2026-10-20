// In-memory Firestore for account-deletion suites that run real step code
// against a store of docs. Wire in with
// `jest.mock('../../api/firestore', () => require('./fakeFirestore').firestoreModule)`
// and use `fieldValue` for `firebase-admin`'s `firestore.FieldValue`.
// Not a suite itself: jest only matches `*.test.ts`.

export type Doc = { path: string; data: Record<string, unknown> };
type Data = Record<string, unknown>;
type Sentinel = { __op: 'delete' } | { __op: 'arrayRemove'; v: unknown[] };

export const fake = { store: [] as Doc[] };

export const fieldValue = {
  delete: (): Sentinel => ({ __op: 'delete' }),
  arrayRemove: (...v: unknown[]): Sentinel => ({ __op: 'arrayRemove', v }),
};

/** Apply a Firestore `update` (dotted paths, delete / arrayRemove sentinels). */
export function applyUpdate(data: Data, update: Data): Data {
  const out = JSON.parse(JSON.stringify(data)) as Data;
  for (const [key, value] of Object.entries(update)) {
    const parts = key.split('.');
    let target = out;
    for (const p of parts.slice(0, -1)) {
      target[p] = (target[p] as Data | undefined) ?? {};
      target = target[p] as Data;
    }
    const last = parts[parts.length - 1];
    const op = value as Partial<{ __op: string; v: unknown[] }> | null;
    if (op?.__op === 'delete') delete target[last];
    else if (op?.__op === 'arrayRemove') {
      const current = Array.isArray(target[last]) ? (target[last] as unknown[]) : [];
      target[last] = current.filter((x) => !(op.v ?? []).includes(x));
    } else target[last] = value;
  }
  return out;
}

const find = (path: string) => fake.store.find((d) => d.path === path);
const write = (path: string, data: Data) => {
  fake.store = [...fake.store.filter((d) => d.path !== path), { path, data }];
};
const remove = (path: string) => {
  fake.store = fake.store.filter((d) => d.path !== path);
};

const docRef = (path: string): Record<string, unknown> => {
  const seg = path.split('/');
  return {
    path,
    id: seg[seg.length - 1],
    // doc -> collection -> parent doc -> parent collection
    parent: { id: seg[seg.length - 2], parent: { parent: { id: seg[seg.length - 4] } } },
    get: async () => snap(path),
    set: async (data: Data) => write(path, JSON.parse(JSON.stringify(data))),
    update: async (u: Data) => {
      const d = find(path);
      if (!d) throw new Error(`no document to update: ${path}`);
      write(path, applyUpdate(d.data, u));
    },
    delete: async () => remove(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
};

const snap = (path: string) => {
  const d = find(path);
  return {
    id: path.split('/').pop(),
    exists: d !== undefined,
    ref: docRef(path),
    data: () => (d ? JSON.parse(JSON.stringify(d.data)) : undefined),
  };
};

const matches = (d: Doc, f: string, op: string, v: unknown) =>
  op === 'array-contains'
    ? Array.isArray(d.data[f]) && (d.data[f] as unknown[]).includes(v)
    : d.data[f] === v;

const query = (inScope: (d: Doc) => boolean, max = Infinity, after?: string): unknown => ({
  where: (f: string, op: string, v: unknown) =>
    query((d) => inScope(d) && matches(d, f, op, v), max, after),
  limit: (n: number) => query(inScope, n, after),
  startAfter: (s: { ref: { path: string } }) => query(inScope, max, s.ref.path),
  get: async () => {
    const docs = fake.store
      .filter(inScope)
      .filter((d) => after === undefined || d.path > after)
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .slice(0, max)
      .map((d) => snap(d.path));
    return { empty: docs.length === 0, size: docs.length, docs };
  },
});

const depth = (path: string) => path.split('/').length;

/** A collection at `path` (top-level name or `houses/h1/votes`). */
function collectionRef(path: string): Record<string, unknown> {
  const inCollection = (d: Doc) =>
    depth(d.path) === depth(path) + 1 && d.path.startsWith(`${path}/`);
  return {
    ...(query(inCollection) as Record<string, unknown>),
    doc: (id: string) => docRef(`${path}/${id}`),
  };
}

const parentName = (path: string) => path.split('/').slice(-2)[0];

export const firestoreModule = {
  ratsFirestore: {
    collection: (name: string) => collectionRef(name),
    collectionGroup: (name: string) => query((d) => parentName(d.path) === name),
    batch: () => {
      const paths: string[] = [];
      return {
        delete: (r: { path: string }) => paths.push(r.path),
        commit: async () => paths.forEach(remove),
      };
    },
  },
  houseCollection: collectionRef('houses'),
  guestCollection: collectionRef('guests'),
  adminCollection: collectionRef('admins'),
};
