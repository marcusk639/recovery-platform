/**
 * Replacement for the mobile-root firebase-setup.ts, backed by the dual-shape
 * mocks. The instances are the same objects the package mocks return, so a
 * service that takes `firestore` from firebase-setup and `doc`/`getDoc` from
 * the package reads and writes one store and one operation log.
 *
 *   jest.mock('<rel>/firebase-setup', () => require('<rel>/__mocks__/firebase-modular/setup'));
 */
const firestoreMock = require('./firestore');
const authMock = require('./auth');
const functionsMock = require('./functions');
const messagingMock = require('./messaging');
const storageMock = require('./storage');

module.exports = {
  __esModule: true,
  firestore: firestoreMock.instance,
  auth: authMock.instance,
  functions: functionsMock.instance,
  messaging: messagingMock.instance,
  storage: storageMock.instance,
  callHttpsFunction: (name, payload) => functionsMock.instance.httpsCallable(name)(payload),
  emulatorConnection: Promise.resolve(),
  FirebaseAuthTypes: {},
  FirebaseFirestoreTypes: {},
  FirebaseStorageTypes: {},
};
