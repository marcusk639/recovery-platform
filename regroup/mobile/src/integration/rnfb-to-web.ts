/**
 * React Native Firebase for the integration suite: the Firebase JS SDK on the
 * local emulators, under the module names the app imports.
 *
 * jest.config.integration.js maps @react-native-firebase/{app,auth,firestore,
 * functions,storage} and firebase-setup here. A service on the modular API
 * runs unchanged, signed in as a real Auth-emulator user, so the security
 * rules apply. The namespaced API (`firestore.collection(...)`, default
 * imports) is deliberately absent: a service fails here until its Task 10
 * group migrates it.
 *
 * Shimmed where React Native Firebase differs and the app depends on it:
 *  - Firestore errors carry RNFirebase's `firestore/<code>` codes
 *    (activity.ts retries on 'firestore/permission-denied').
 *  - `putFile(ref, path, metadata)` uploads a local file, as RNFirebase's does.
 *
 * Messaging has no JS SDK equivalent; firebase-setup's `messaging` stays the
 * unit mock from jest.setup.js.
 */
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import * as web from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  connectStorageEmulator,
  getStorage,
  uploadBytesResumable,
  type StorageReference,
  type UploadMetadata,
} from 'firebase/storage';
import messagingModule from '@react-native-firebase/messaging';
import { EMULATOR_HOST, emulatorPort, integrationProjectId } from './emulator-env';

export * from 'firebase/app';
export * from 'firebase/auth';
export * from 'firebase/firestore';
export * from 'firebase/functions';
export * from 'firebase/storage';
// Names two of the modules export; RNFirebase's meaning wins. setLogLevel: the
// app's is the global one. Unsubscribe and TaskState are type-only.
export { setLogLevel } from 'firebase/app';
export type { Unsubscribe } from 'firebase/firestore';
export type { TaskState } from 'firebase/storage';

const projectId = integrationProjectId();
const app = initializeApp({
  projectId,
  apiKey: 'demo-api-key',
  storageBucket: `${projectId}.appspot.com`,
});

const auth = getAuth(app);
connectAuthEmulator(
  auth,
  `http://${EMULATOR_HOST}:${emulatorPort('FIREBASE_AUTH_EMULATOR_HOST')}`,
  {
    disableWarnings: true,
  },
);

// Settings first, then the emulator: the order firebase-setup.ts uses.
const firestore = web.initializeFirestore(app, { ignoreUndefinedProperties: true });
web.connectFirestoreEmulator(firestore, EMULATOR_HOST, emulatorPort('FIRESTORE_EMULATOR_HOST'));

const functions = getFunctions(app);
connectFunctionsEmulator(functions, EMULATOR_HOST, emulatorPort('FUNCTIONS_EMULATOR_HOST', 5001));

const storage = getStorage(app);
connectStorageEmulator(
  storage,
  EMULATOR_HOST,
  emulatorPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
);

// ─── RNFirebase-shaped Firestore errors ──────────────────────────────────────

type RnfbError = Error & { code: string };

/**
 * A Firestore error as RNFirebase raises it: code `firestore/<code>`. Matched
 * by shape, not `instanceof FirestoreError`: the rejections the SDK raises are
 * not instances of the exported class. Only Firestore operations are wrapped,
 * and only Firestore's codes come unprefixed.
 */
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
export const setDoc = withRnfbErrors(web.setDoc);
export const updateDoc = withRnfbErrors(web.updateDoc);
export const deleteDoc = withRnfbErrors(web.deleteDoc);
export const addDoc = withRnfbErrors(web.addDoc);
export const runTransaction = withRnfbErrors(web.runTransaction);

export const writeBatch = (db: web.Firestore): web.WriteBatch => {
  const batch = web.writeBatch(db);
  const commit = batch.commit.bind(batch);
  batch.commit = () => rejectAsRnfb(commit());
  return batch;
};

type SnapshotError = (error: unknown) => void;
const convertingErrors =
  (onError: SnapshotError): SnapshotError =>
  (error) =>
    onError(toRnfbError(error));

/**
 * onSnapshot with the listener's error callback receiving RNFirebase codes,
 * whichever overload the caller used: an observer object, or callbacks where
 * the error handler follows the first (next) function.
 */
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

// ─── RNFirebase storage extras ───────────────────────────────────────────────

/** RNFirebase's putFile: upload the file at a local path (`file://` or plain). */
export const putFile = (reference: StorageReference, filePath: string, metadata?: UploadMetadata) =>
  uploadBytesResumable(reference, readFileSync(filePath.replace(/^file:\/\//, '')), metadata);

// ─── firebase-setup's exports ────────────────────────────────────────────────

const messaging = messagingModule();
const emulatorConnection = Promise.resolve();

export const callHttpsFunction = <ResponseData = unknown>(name: string, payload: unknown) =>
  httpsCallable<unknown, ResponseData>(functions, name)(payload);

export { auth, emulatorConnection, firestore, functions, messaging, storage };
