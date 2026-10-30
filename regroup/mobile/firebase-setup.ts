import { getApp } from '@react-native-firebase/app';
import { getAuth, type Auth, type FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  getMessaging,
  type FirebaseMessagingTypes,
  type Messaging,
} from '@react-native-firebase/messaging';
import {
  getFunctions,
  httpsCallable,
  type FirebaseFunctionsTypes,
  type Functions,
} from '@react-native-firebase/functions';
import {
  getFirestore,
  initializeFirestore,
  type FirebaseFirestoreTypes,
  type Firestore,
} from '@react-native-firebase/firestore';
import {
  getStorage,
  type FirebaseStorage,
  type FirebaseStorageTypes,
} from '@react-native-firebase/storage';
import {
  assertE2EProject,
  assertE2EStripeKey,
  connectToEmulators,
  emulatorHost,
  emulatorPorts,
} from './src/config/firebase-emulator';
import { e2eVariant, stripePublishableKey } from './src/config/env';
import { logException } from './src/util/logging';

// Transitional intersection types (RNFirebase 25.1.0 serves both APIs on the
// same objects): code still on the namespaced API and code already moved to the
// modular API share these instances until the namespaced types go with 26.x.
const auth = getAuth() as Auth & FirebaseAuthTypes.Module;
const messaging = getMessaging() as Messaging & FirebaseMessagingTypes.Module;
const storage = getStorage() as FirebaseStorage & FirebaseStorageTypes.Module;
const functions = getFunctions() as Functions & FirebaseFunctionsTypes.Module;

// 25.1.0's initializeFirestore is async, but it records ignoreUndefinedProperties
// before its first await, and writes read the flag when they serialize. Both
// calls return the same instance, so it is settled before connectToEmulators.
initializeFirestore(getApp(), { ignoreUndefinedProperties: true }).catch((error) =>
  logException(error, 'firebase-setup: initializeFirestore'),
);
const firestore = getFirestore() as Firestore & FirebaseFirestoreTypes.Module;

// E2E emulator builds only: route Auth, Firestore, Storage and Functions to the
// local emulators. The gate is the bundle-time E2E_VARIANT, not __DEV__ or a
// launch argument, so no other build reaches connectToEmulators. It wires the
// SDKs synchronously, onto the instances built above (settings first, then connect).
//
// Deliberately no catch and no fallback: if an emulator is unreachable this
// promise rejects, and index.js reports that as fatal. It must never carry on
// against the project in the native Firebase config.
//
// An e2e variant must also be running against its own project, with a test
// Stripe key. E2E_VARIANT is inlined from the bundler's environment: the Gradle
// e2e build types and Xcode E2E* configurations set it, and babel.config.js
// refuses it from .env. The remaining way in is a shell that exported it, or a
// Metro started with it (which serves it to any build, Debug included). Throwing
// here, while index.js imports this module, stops the app at startup.
const variant = e2eVariant();
if (variant !== null) {
  assertE2EProject(variant, getApp().options.projectId);
  assertE2EStripeKey(variant, stripePublishableKey());
}

const emulatorConnection: Promise<void> =
  variant === 'emulator'
    ? connectToEmulators({
        host: emulatorHost(),
        ports: emulatorPorts(),
        instances: { auth, firestore, storage, functions },
      })
    : Promise.resolve();

export const callHttpsFunction = <ResponseData = unknown>(name: string, payload: unknown) =>
  httpsCallable<unknown, ResponseData>(functions, name)(payload);

export {
  emulatorConnection,
  firestore,
  auth,
  messaging,
  storage,
  functions,
};
export type { FirebaseAuthTypes, FirebaseFirestoreTypes, FirebaseStorageTypes };
