// import {initializeApp} from '@react-native-firebase/app';
import FirebaseAuth from '@react-native-firebase/auth';
import FirebaseFunctions from '@react-native-firebase/functions';
import FirebaseMessaging from '@react-native-firebase/messaging';
// import FirebaseDynamicLinks from '@react-native-firebase/dynamic-links';
import FirebaseFirestore from '@react-native-firebase/firestore';
// import FirebaseStorage from '@react-native-firebase/storage';

const functions = FirebaseFunctions();
const auth = FirebaseAuth();
const messaging = FirebaseMessaging();
const firestore = FirebaseFirestore();

// Configure Firestore settings
// Note: In React Native Firebase, offline persistence is enabled by default
// We configure it explicitly here for clarity and to set unlimited cache size
firestore.settings({
  ignoreUndefinedProperties: true,
  // Enable offline persistence with unlimited cache size
  // This ensures meeting info, group data, and messages are available offline
  cacheSizeBytes: FirebaseFirestore.CACHE_SIZE_UNLIMITED,
});

export {firestore, auth, functions, messaging};
