// Shared across Task 10 migration groups: typed for both APIs until RNFirebase 26 (Task 10f).
import {
  collection,
  doc,
  type DocumentReference,
  type FirebaseFirestoreTypes as SharedRefTypes,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';

export const paywallConfigRef = doc(collection(firestore, 'paywall'), 'config') as DocumentReference &
  SharedRefTypes.DocumentReference;
