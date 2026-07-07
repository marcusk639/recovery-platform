/**
 * Shared Jest manual mock for the mobile-root `firebase-setup.ts`.
 *
 * jest.config.js maps every import ending in `/firebase-setup` (regardless
 * of how many `../` segments precede it) to this file, so:
 *  - test files with no local `jest.mock('.../firebase-setup', ...)` call
 *    (e.g. payment.test.ts) get this mock automatically.
 *  - test files with their own local jest.mock(...) factory — even ones
 *    written with an incorrect relative-path depth, a repeated real bug in
 *    this codebase — still resolve successfully; their own factory content
 *    continues to take precedence over this file, unaffected.
 */
const docRef = {
  id: "mock-doc-id",
  get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
  collection: jest.fn(() => collectionRef),
};
const collectionRef: any = {
  doc: jest.fn(() => docRef),
  get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })),
  where: jest.fn(function (this: any) {
    return this;
  }),
  orderBy: jest.fn(function (this: any) {
    return this;
  }),
  limit: jest.fn(function (this: any) {
    return this;
  }),
  add: jest.fn(() => Promise.resolve(docRef)),
  onSnapshot: jest.fn(() => () => {}),
};

export const firestore: any = {
  collection: jest.fn(() => collectionRef),
  batch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
  runTransaction: jest.fn((fn: any) =>
    fn({
      get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
      set: jest.fn(),
      update: jest.fn(),
    })
  ),
  settings: jest.fn(),
};

export const auth: any = {
  currentUser: null,
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(),
  onAuthStateChanged: jest.fn(() => () => {}),
};

export const messaging: any = {
  requestPermission: jest.fn(() => Promise.resolve(1)),
  getToken: jest.fn(() => Promise.resolve("mock-fcm-token")),
  onMessage: jest.fn(() => () => {}),
  onTokenRefresh: jest.fn(() => () => {}),
  setBackgroundMessageHandler: jest.fn(),
  onNotificationOpenedApp: jest.fn(() => () => {}),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
};

export const storage: any = {
  ref: jest.fn(() => ({
    putFile: jest.fn(() => Promise.resolve()),
    getDownloadURL: jest.fn(() => Promise.resolve("")),
  })),
};

export const functions: any = {
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
};

export const callHttpsFunction = jest.fn(() => Promise.resolve({ data: {} }));

export const FirebaseAuthTypes = {};
export const FirebaseFirestoreTypes = {};
export const FirebaseStorageTypes = {};
