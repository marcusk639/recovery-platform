// The web SDK, under the names the phone's code imports from RN Firebase. The
// error handling is ported from regroup/mobile/src/integration/rnfb-to-web.ts,
// which can't be imported here because it uses Node's fs and test settings.
import * as web from 'firebase/firestore';
import { plainData } from './plain-data';

export * from 'firebase/firestore';

type RnfbError = Error & { code: string };

// Matched by shape: the SDK's rejections aren't instances of FirestoreError.
export function toRnfbError(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (!(error instanceof Error) || typeof code !== 'string' || code.includes('/')) {
    return error;
  }
  const converted = new Error(`[firestore/${code}] ${error.message}`) as RnfbError;
  converted.code = `firestore/${code}`;
  return converted;
}

const rejectAsRnfb = <T>(promise: Promise<T>): Promise<T> =>
  promise.catch((error: unknown) => {
    throw toRnfbError(error);
  });

const withRnfbErrors = <F extends (...args: never[]) => Promise<unknown>>(operation: F): F =>
  ((...args: Parameters<F>) => rejectAsRnfb(operation(...args))) as F;

export const getDoc = withRnfbErrors(web.getDoc);
export const getDocs = withRnfbErrors(web.getDocs);
export const getDocFromServer = withRnfbErrors(web.getDocFromServer);
export const getDocsFromServer = withRnfbErrors(web.getDocsFromServer);
// Everything after the reference is data, for set, update (either form) and add.
const plainArgs = <F extends (...args: any[]) => any>(operation: F): F =>
  ((reference: unknown, ...data: unknown[]) => operation(reference, ...data.map(plainData))) as F;

// The same for a batch or a transaction's set and update.
function plainWrites<T extends { set: unknown; update: unknown }>(writer: T): T {
  const target = writer as unknown as Record<'set' | 'update', (...args: unknown[]) => unknown>;
  for (const method of ['set', 'update'] as const) {
    if (typeof target[method] !== 'function') continue;
    const original = target[method].bind(writer);
    target[method] = (reference: unknown, ...data: unknown[]) => original(reference, ...data.map(plainData));
  }
  return writer;
}

export const setDoc = withRnfbErrors(plainArgs(web.setDoc));
export const updateDoc = withRnfbErrors(plainArgs(web.updateDoc));
export const deleteDoc = withRnfbErrors(web.deleteDoc);
export const addDoc = withRnfbErrors(plainArgs(web.addDoc));
export const runTransaction = withRnfbErrors(((db: web.Firestore, update: (tx: web.Transaction) => Promise<unknown>, options?: web.TransactionOptions) =>
  web.runTransaction(db, (tx) => update(plainWrites(tx)), options)) as typeof web.runTransaction);

export const writeBatch = (db: web.Firestore): web.WriteBatch => {
  const batch = plainWrites(web.writeBatch(db));
  const commit = batch.commit.bind(batch);
  batch.commit = () => rejectAsRnfb(commit());
  return batch;
};

type SnapshotError = (error: unknown) => void;
const convertingErrors =
  (onError: SnapshotError): SnapshotError =>
  (error) =>
    onError(toRnfbError(error));

export const onSnapshot = ((reference: unknown, ...rest: unknown[]) => {
  const firstCallback = rest.findIndex((arg) => typeof arg === 'function');
  const args = rest.map((arg, index) => {
    if (index === firstCallback + 1 && firstCallback >= 0 && typeof arg === 'function') {
      return convertingErrors(arg as SnapshotError);
    }
    if (firstCallback < 0 && arg && typeof arg === 'object' && 'error' in arg) {
      const observer = arg as { error?: SnapshotError };
      return observer.error ? { ...observer, error: convertingErrors(observer.error) } : arg;
    }
    return arg;
  });
  return (web.onSnapshot as (...a: unknown[]) => web.Unsubscribe)(reference, ...args);
}) as typeof web.onSnapshot;
