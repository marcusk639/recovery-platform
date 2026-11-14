import {
  collection,
  doc,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';

export const paywallConfigRef = doc(collection(firestore, 'paywall'), 'config');
