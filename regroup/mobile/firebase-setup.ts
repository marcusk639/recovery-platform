import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getMessaging } from '@react-native-firebase/messaging';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from '@react-native-firebase/firestore';
import { getStorage } from '@react-native-firebase/storage';
import {
  assertE2EProject,
  assertE2EStripeKey,
  connectToEmulators,
  emulatorHost,
  emulatorPorts,
} from './src/config/firebase-emulator';
import { e2eVariant, stripePublishableKey } from './src/config/env';
import { logException } from './src/util/logging';

const auth = getAuth();
const messaging = getMessaging();
const storage = getStorage();
const functions = getFunctions();

// Settings first (initializeFirestore is synchronous since RNFirebase 26), then
// connectToEmulators below. A failure (e.g. Firestore already initialized) is
// logged, not thrown at import, and the default instance is used.
let firestore: Firestore;
try {
  firestore = initializeFirestore(getApp(), { ignoreUndefinedProperties: true });
} catch (error) {
  logException(error, 'firebase-setup: initializeFirestore');
  firestore = getFirestore();
}

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

// The FCM message type, for src/services/notifications/remoteMessage.ts.
export type { RemoteMessage } from '@react-native-firebase/messaging';

export {
  emulatorConnection,
  firestore,
  auth,
  messaging,
  storage,
  functions,
};
