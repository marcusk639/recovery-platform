/**
 * Dual-shape @react-native-firebase/firestore mock backed by the operation log
 * in log.js. Every ref and query carries `path` (modular) AND the namespaced
 * methods (.doc, .collection, .where, .get, .set, ...), so a ref built with
 * either API works with the other: shared refs such as `guestCollection` keep
 * working while services migrate one group at a time.
 *
 * Opt in from a test with:
 *   jest.mock('@react-native-firebase/firestore', () => require('<rel>/__mocks__/firebase-modular/firestore'));
 *   jest.mock('<rel>/firebase-setup', () => require('<rel>/__mocks__/firebase-modular/setup'));
 */
const log = require('./log');
const { runQuery, DOCUMENT_ID } = require('./firestore-query');
const writes = require('./firestore-writes');

const { Timestamp, record, maybeFail, autoId } = log;
const {
  pairsToObject,
  writeBatch,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
  documentId,
  FieldValue,
  FieldPath,
} = writes;

const { docSnapshot, querySnapshot: toQuerySnapshot } = require('./firestore-snapshots');

const querySnapshot = (results) => toQuerySnapshot(results, docRef);

/** onSnapshot(onNext, onError) | (observer) | (options, onNext, onError) */
function listen(target, args) {
  const handlers = args.filter((a) => typeof a === 'function');
  const observer = args.find((a) => a && typeof a === 'object' && (a.next || a.error));
  const onNext = handlers[0] || (observer && observer.next);
  const onError = handlers[1] || (observer && observer.error);
  record(
    target.type === 'document'
      ? { op: 'listen', path: target.path }
      : { op: 'listen', path: target.path, constraints: target.constraints },
  );
  let active = true;
  let failure = null;
  try {
    maybeFail('listen', target.path);
  } catch (error) {
    failure = error;
  }
  Promise.resolve().then(() => {
    if (!active) {
      return;
    }
    if (failure) {
      if (onError) {
        onError(failure);
      }
      return;
    }
    if (onNext) {
      onNext(target.type === 'document' ? docSnapshot(target) : querySnapshot(target.run()));
    }
  });
  return () => {
    active = false;
  };
}

function docRef(path) {
  const parts = path.split('/');
  const ref = {
    __isMockRef: true,
    type: 'document',
    path,
    id: parts[parts.length - 1],
    get parent() {
      return collectionRef(parts.slice(0, -1).join('/'));
    },
    collection: (sub) => collectionRef(`${path}/${sub}`),
    get: () => getDoc(ref),
    set: (data, options) => setDoc(ref, data, options),
    update: (...args) => updateDoc(ref, ...args),
    delete: () => deleteDoc(ref),
    onSnapshot: (...args) => listen(ref, args),
    isEqual: (other) => !!other && other.path === path,
  };
  return ref;
}

function queryRef(path, constraints, group) {
  const q = {
    __isMockRef: true,
    type: group ? 'collectionGroup' : 'query',
    path,
    constraints,
    run: () => runQuery(path, group, constraints),
    get: () => getDocs(q),
    onSnapshot: (...args) => listen(q, args),
  };
  [
    'where',
    'orderBy',
    'limit',
    'limitToLast',
    'startAfter',
    'startAt',
    'endBefore',
    'endAt',
  ].forEach((kind) => {
    q[kind] = (...args) => queryRef(path, [...constraints, constraint(kind, args)], group);
  });
  return q;
}

function collectionRef(path) {
  const ref = queryRef(path, [], false);
  ref.type = 'collection';
  ref.id = path.split('/').pop();
  ref.doc = (id) => docRef(`${path}/${id === undefined ? autoId() : id}`);
  ref.add = (data) => addDoc(ref, data);
  return ref;
}

// Constraints are logged as [kind, ...args]; a FieldPath.documentId() is '__name__'.
function constraint(kind, args) {
  const clean = args.map((a) => (a && a.__isDocumentIdPath ? DOCUMENT_ID : a));
  return [kind, ...clean];
}

// ─── modular API ─────────────────────────────────────────────────────────────

const instance = {};

function joinPath(parent, segments) {
  const tail = segments.filter((s) => s !== undefined).join('/');
  return parent && parent.__isMockRef ? `${parent.path}/${tail}` : tail;
}

function collection(parent, ...segments) {
  return collectionRef(joinPath(parent, segments));
}

function doc(parent, ...segments) {
  if (parent && parent.type === 'collection' && segments[0] === undefined) {
    return parent.doc();
  }
  return docRef(joinPath(parent, segments));
}

function collectionGroup(_firestore, id) {
  return queryRef(id, [], true);
}

function query(base, ...constraints) {
  return queryRef(
    base.path,
    [...base.constraints, ...constraints.map((c) => c.tuple)],
    base.type === 'collectionGroup',
  );
}

const constraintFactory =
  (kind) =>
  (...args) => ({ __isConstraint: true, tuple: constraint(kind, args) });

async function getDoc(ref) {
  record({ op: 'get', path: ref.path });
  maybeFail('get', ref.path);
  return docSnapshot(ref);
}

async function getDocs(q) {
  record({ op: 'getDocs', path: q.path, constraints: q.constraints });
  maybeFail('getDocs', q.path);
  return querySnapshot(q.run());
}

async function setDoc(ref, data, options) {
  record({ op: 'set', path: ref.path, data, options });
  maybeFail('set', ref.path);
  log.writeSet(ref.path, data, options);
}

async function updateDoc(ref, ...args) {
  const data = typeof args[0] === 'string' ? pairsToObject(args) : args[0];
  record({ op: 'update', path: ref.path, data });
  maybeFail('update', ref.path);
  log.writeUpdate(ref.path, data);
}

async function addDoc(ref, data) {
  record({ op: 'add', path: ref.path, data });
  maybeFail('add', ref.path);
  const created = ref.doc();
  log.writeSet(created.path, data);
  return created;
}

async function deleteDoc(ref) {
  record({ op: 'delete', path: ref.path });
  maybeFail('delete', ref.path);
  log.writeDelete(ref.path);
}

function onSnapshot(target, ...args) {
  return listen(target, args);
}

const runTransaction = writes.makeRunTransaction(docSnapshot);

Object.assign(instance, {
  app: { name: '[DEFAULT]', options: {} },
  collection: (path) => collectionRef(path),
  collectionGroup: (id) => collectionGroup(instance, id),
  doc: (path) => docRef(path),
  batch: () => writeBatch(instance),
  runTransaction: (fn) => runTransaction(fn),
  settings: () => Promise.resolve(),
  useEmulator: () => {},
});

// Namespaced default export: firestore() returns the instance; statics on it.
function firestore() {
  return instance;
}
Object.assign(firestore, { FieldValue, FieldPath, Timestamp });

module.exports = {
  __esModule: true,
  default: firestore,
  instance,
  getFirestore: () => instance,
  initializeFirestore: jest.fn(() => Promise.resolve(instance)),
  connectFirestoreEmulator: jest.fn(),
  collection,
  collectionGroup,
  doc,
  query,
  where: constraintFactory('where'),
  orderBy: constraintFactory('orderBy'),
  limit: constraintFactory('limit'),
  limitToLast: constraintFactory('limitToLast'),
  startAfter: constraintFactory('startAfter'),
  startAt: constraintFactory('startAt'),
  endBefore: constraintFactory('endBefore'),
  endAt: constraintFactory('endAt'),
  getDoc,
  getDocs,
  getDocFromServer: getDoc,
  getDocsFromServer: getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
  documentId,
  FieldValue,
  FieldPath,
  Timestamp,
  FirebaseFirestoreTypes: {},
};
