/**
 * Modular @react-native-firebase/firestore functions over namespaced-shaped
 * mock refs (RN 0.88 upgrade, Tasks 9–10).
 *
 * Many suites hand services a hand-rolled namespaced ref ({ doc, where, get,
 * set, ... }) and assert on its jest.fn calls. When a service moves to the
 * modular API, `getDoc(doc(col, id))` reaches these adapters, which call the
 * same methods on the ref the namespaced code called, so those suites keep
 * their cases and assertions. The global jest.setup.js mock spreads these in;
 * tests that need the real store use ./firestore instead. Removed with the
 * namespaced mock surface in Task 10f.
 */
const doc = (parent, ...segments) =>
  segments.length ? parent.doc(segments.join('/')) : parent.doc();
const collection = (parent, ...segments) => parent.collection(segments.join('/'));
const collectionGroup = (firestore, id) => firestore.collectionGroup(id);

const constraint =
  (method) =>
  (...args) =>
  (ref) =>
    ref[method](...args);

const query = (ref, ...constraints) => constraints.reduce((q, apply) => apply(q), ref);

module.exports = {
  doc,
  collection,
  collectionGroup,
  query,
  where: constraint('where'),
  orderBy: constraint('orderBy'),
  limit: constraint('limit'),
  startAfter: constraint('startAfter'),
  getDoc: (ref) => ref.get(),
  getDocs: (ref) => ref.get(),
  getDocFromServer: (ref) => ref.get(),
  getDocsFromServer: (ref) => ref.get(),
  setDoc: (ref, data, options) => (options === undefined ? ref.set(data) : ref.set(data, options)),
  updateDoc: (ref, data) => ref.update(data),
  deleteDoc: (ref) => ref.delete(),
  addDoc: (ref, data) => ref.add(data),
  onSnapshot: (ref, ...handlers) => ref.onSnapshot(...handlers),
  runTransaction: (db, updateFunction) => db.runTransaction(updateFunction),
  writeBatch: (db) => db.batch(),
};
