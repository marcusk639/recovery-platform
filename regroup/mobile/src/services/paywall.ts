import { firestore } from '../../firebase-setup';

export const paywallConfigRef = firestore.collection('paywall').doc('config');
