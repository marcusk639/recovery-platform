import firebase from '@react-native-firebase/app';
import FirebaseAuth from '@react-native-firebase/auth';
import FirebaseMessaging from '@react-native-firebase/messaging';
import FirebaseFunctions from '@react-native-firebase/functions';
import FirebaseFirestore from '@react-native-firebase/firestore';
import FirebaseStorage from '@react-native-firebase/storage';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { FirebaseStorageTypes } from '@react-native-firebase/storage';
import { connectToEmulators, emulatorHost, emulatorPorts } from './src/config/firebase-emulator';
import { e2eVariant } from './src/config/env';

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
const emulatorConnection: Promise<void> =
  e2eVariant() === 'emulator'
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
