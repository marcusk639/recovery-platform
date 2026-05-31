// src/integration/firebase-admin-setup.ts
// Provides firebase-admin-backed Firebase services for integration tests.
// Uses the Firestore emulator via FIRESTORE_EMULATOR_HOST (set in setup.ts).

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'rats-v2-test' });
}

const firestoreInstance = admin.firestore();
firestoreInstance.settings({ ignoreUndefinedProperties: true });

export const firestore = firestoreInstance;

// Stubs — integration tests only need Firestore
export const auth = {
  currentUser: null,
  signInWithEmailAndPassword: () => Promise.resolve({ user: {} }),
  signOut: () => Promise.resolve(),
  onAuthStateChanged: () => () => {},
} as any;

export const messaging = {} as any;
export const storage = {} as any;
export const functions = {
  httpsCallable: () => () => Promise.resolve({ data: {} }),
} as any;
export const callHttpsFunction = () => Promise.resolve({ data: {} });

export const FirebaseAuthTypes = {};
export const FirebaseFirestoreTypes = {};
export const FirebaseStorageTypes = {};
