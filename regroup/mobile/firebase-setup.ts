import firebase from '@react-native-firebase/app';
import FirebaseAuth from '@react-native-firebase/auth';
import FirebaseMessaging from '@react-native-firebase/messaging';
import FirebaseFunctions from '@react-native-firebase/functions';
import FirebaseFirestore from '@react-native-firebase/firestore';
import FirebaseStorage from '@react-native-firebase/storage';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { FirebaseStorageTypes } from '@react-native-firebase/storage';
import {
  assertE2EProject,
  assertE2EStripeKey,
  connectToEmulators,
  emulatorHost,
  emulatorPorts,
} from './src/config/firebase-emulator';
import { e2eVariant, stripePublishableKey } from './src/config/env';

// const app = firebase.app();
const auth = FirebaseAuth();
const messaging = FirebaseMessaging();
const storage = FirebaseStorage();
const functions = FirebaseFunctions();

// E2E emulator builds only: route Auth, Firestore, Storage and Functions to the
// local emulators. The gate is the bundle-time E2E_VARIANT, not __DEV__ or a
// launch argument, so no other build reaches connectToEmulators. It wires the
// SDKs synchronously, before the Firestore settings call below.
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
  assertE2EProject(variant, firebase.app().options.projectId);
  assertE2EStripeKey(variant, stripePublishableKey());
}

const emulatorConnection: Promise<void> =
  variant === 'emulator'
    ? connectToEmulators({ host: emulatorHost(), ports: emulatorPorts() })
    : Promise.resolve();

export const callHttpsFunction = (name: string, payload: any) => {
  return FirebaseFunctions().httpsCallable(name)(payload);
};

// auth.signOut();
const firestore = FirebaseFirestore();
firestore.settings({ ignoreUndefinedProperties: true });
// firebase.enablePersistence(true);
// const channelId = 'notification-channel';
// const channel = new firebase.notifications.Android.Channel(channelId, 'Notification Channel', firebase.notifications.Android.Importance.Max);
// // firebase.notifications().android.createChannel(channel);
// notifications.android.createChannel(channel);

export {
  emulatorConnection,
  firestore,
  auth,
  messaging,
  storage,
  functions,
  FirebaseAuthTypes,
  FirebaseFirestoreTypes,
  FirebaseStorageTypes,
};
