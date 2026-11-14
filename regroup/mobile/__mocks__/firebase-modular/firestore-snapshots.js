/**
 * Document and query snapshots for the firebase-modular Firestore mock (see
 * firestore.js), read from the in-memory store in log.js.
 */
const { state } = require('./log');

// Snapshot shape follows the installed RNFirebase: before v22, `exists` is a
// boolean property; from v22 it is a method, on both API shapes, as on device.
const RNFB_MAJOR = Number(
  require('@react-native-firebase/firestore/package.json').version.split('.')[0],
);
const EXISTS_IS_METHOD = RNFB_MAJOR >= 22;

function copy(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value.__isMockTimestamp || value.__isMockRef) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(copy);
  }
  const out = {};
  Object.keys(value).forEach((k) => {
    out[k] = copy(value[k]);
  });
  return out;
}

function docSnapshot(ref) {
  const stored = state.docs.get(ref.path);
  const has = stored !== undefined;
  return {
    __isMockSnapshot: true,
    id: ref.id,
    ref,
    exists: EXISTS_IS_METHOD ? () => has : has,
    data: () => (has ? copy(stored) : undefined),
    get: (field) => (has ? copy(stored)[field] : undefined),
  };
}

/** `results` are [{ path }] from runQuery; `docRef` builds the ref for each. */
function querySnapshot(results, docRef) {
  const docs = results.map((r) => docSnapshot(docRef(r.path)));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb) => docs.forEach(cb),
    docChanges: () =>
      docs.map((snap, newIndex) => ({ type: 'added', doc: snap, newIndex, oldIndex: -1 })),
  };
}

module.exports = { EXISTS_IS_METHOD, docSnapshot, querySnapshot };
