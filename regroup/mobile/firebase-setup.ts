import firebase from '@react-native-firebase/app';
import FirebaseAuth from '@react-native-firebase/auth';
import FirebaseMessaging from '@react-native-firebase/messaging';
import FirebaseFunctions from '@react-native-firebase/functions';
import FirebaseFirestore from '@react-native-firebase/firestore';
import FirebaseStorage from '@react-native-firebase/storage';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { FirebaseStorageTypes } from '@react-native-firebase/storage';

// const app = firebase.app();
const auth = FirebaseAuth();
const messaging = FirebaseMessaging();
const storage = FirebaseStorage();
const functions = FirebaseFunctions();

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
  firestore,
  auth,
  messaging,
  storage,
  functions,
  FirebaseAuthTypes,
  FirebaseFirestoreTypes,
  FirebaseStorageTypes,
};
