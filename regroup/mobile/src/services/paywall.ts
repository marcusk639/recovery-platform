// Shared across Task 10 migration groups: typed for both APIs until RNFirebase 26 (Task 10f).
import type {
  DocumentReference,
  FirebaseFirestoreTypes as SharedRefTypes,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';

export const paywallConfigRef = firestore.collection('paywall').doc('config') as DocumentReference &
  SharedRefTypes.DocumentReference;
