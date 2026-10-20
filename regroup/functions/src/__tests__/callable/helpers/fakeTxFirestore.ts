/**
 * In-memory stand-in for `api/firestore` with a recording transaction fake.
 *
 * `store` holds committed docs keyed by "collection/id". Transaction writes are
 * buffered and applied only when the update function resolves, mirroring
 * Firestore's all-or-nothing commit (a thrown error writes nothing). Every
 * get/create/set/update, and the commit itself, lands in `events` so tests can
 * assert exactly what was written and its order relative to other side effects.
 *
 * Usage:
 *   jest.mock('../../api/firestore', () =>
 *     jest.requireActual('./helpers/fakeTxFirestore').apiFirestoreMock());
 */
import { HttpsError } from 'firebase-functions/v2/https';

export type Doc = Record<string, any>;
export interface TxEvent {
  op: string;
  path: string;
  data?: Doc;
  opts?: unknown;
}
interface Ref {
  id: string;
  path: string;
}

export const store = new Map<string, Doc>();
export const events: TxEvent[] = [];
let autoId = 0;

export const resetFakeFirestore = (): void => {
  store.clear();
  events.length = 0;
  autoId = 0;
};

export const writeEvents = (): TxEvent[] =>
  events.filter((e) => ['create', 'set', 'update'].includes(e.op));

const makeRef = (collection: string, id: string): Ref => ({ id, path: `${collection}/${id}` });
const makeCollection = (name: string) => ({
  doc: (id?: string) => makeRef(name, id ?? `${name}-auto-${++autoId}`),
});

export const runTransaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  const writes: Array<() => void> = [];
  const tx = {
    get: async (ref: Ref) => {
      events.push({ op: 'get', path: ref.path });
      const data = store.get(ref.path);
      return { exists: data !== undefined, id: ref.id, data: () => data };
    },
    create: (ref: Ref, data: Doc) => {
      events.push({ op: 'create', path: ref.path, data });
      writes.push(() => {
        if (store.has(ref.path)) throw new Error(`ALREADY_EXISTS ${ref.path}`);
        store.set(ref.path, data);
      });
      return tx;
    },
    set: (ref: Ref, data: Doc, opts?: { merge?: boolean }) => {
      events.push({ op: 'set', path: ref.path, data, opts });
      writes.push(() =>
        store.set(ref.path, opts?.merge ? { ...(store.get(ref.path) ?? {}), ...data } : data),
      );
      return tx;
    },
    update: (ref: Ref, data: Doc) => {
      events.push({ op: 'update', path: ref.path, data });
      writes.push(() => {
        if (!store.has(ref.path)) throw new Error(`NOT_FOUND ${ref.path}`);
        store.set(ref.path, { ...store.get(ref.path), ...data });
      });
      return tx;
    },
  };
  const result = await fn(tx);
  writes.forEach((w) => w());
  events.push({ op: 'commit', path: '' });
  return result;
});

export const apiFirestoreMock = () => ({
  ratsFirestore: { runTransaction },
  userCollection: makeCollection('users'),
  houseCollection: makeCollection('houses'),
  houseTombstoneCollection: makeCollection('houseTombstones'),
  adminCollection: makeCollection('admins'),
  createAdminId: () => `admin-new-${++autoId}`,
});

/** Asserts the promise rejects with an HttpsError of the given code (and message). */
export const expectCode = async (p: Promise<unknown>, code: string, message?: string) => {
  const err = await p.then(
    () => {
      throw new Error('expected rejection');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpsError);
  expect((err as HttpsError).code).toBe(code);
  if (message) expect((err as HttpsError).message).toBe(message);
};
