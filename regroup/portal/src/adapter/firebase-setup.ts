// Replaces regroup/mobile/firebase-setup.ts, with the same export names.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { inert } from './deferred';
import { assertEmulatorProject, EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT } from './firebase/emulator-config';

assertEmulatorProject(EMULATOR_PROJECT);

const app = initializeApp({
  projectId: EMULATOR_PROJECT,
  apiKey: 'demo-api-key',
  storageBucket: `${EMULATOR_PROJECT}.appspot.com`,
});

const auth = getAuth(app);
connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });

// Settings first, then the emulator: the order the phone's setup uses.
const firestore = initializeFirestore(app, { ignoreUndefinedProperties: true });
connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORTS.firestore);

const functions = getFunctions(app);
connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);

const storage = getStorage(app);
connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORTS.storage);

const messaging = inert('messaging');
const emulatorConnection: Promise<void> = Promise.resolve();

const callHttpsFunction = <ResponseData = unknown>(name: string, payload: unknown) =>
  httpsCallable<unknown, ResponseData>(functions, name)(payload);

export { auth, callHttpsFunction, emulatorConnection, firestore, functions, messaging, storage };
