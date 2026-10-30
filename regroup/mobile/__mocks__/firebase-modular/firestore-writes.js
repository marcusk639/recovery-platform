/**
 * Batches, transactions and field-value sentinels for the firebase-modular
 * Firestore mock (see firestore.js). Writes are logged when called and
 * applied to the store on commit, as Firestore applies them.
 */
const log = require('./log');

const { sentinel, record, maybeFail } = log;

function pairsToObject(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    out[args[i]] = args[i + 1];
  }
  return out;
}

function writeBatch() {
  const writes = [];
  const batch = {
    set(ref, data, options) {
      record({ op: 'batch.set', path: ref.path, data, options });
      writes.push(() => log.writeSet(ref.path, data, options));
      return batch;
    },
    update(ref, ...args) {
      const data = typeof args[0] === 'string' ? pairsToObject(args) : args[0];
      record({ op: 'batch.update', path: ref.path, data });
      writes.push(() => log.writeUpdate(ref.path, data));
      return batch;
    },
    delete(ref) {
      record({ op: 'batch.delete', path: ref.path });
      writes.push(() => log.writeDelete(ref.path));
      return batch;
    },
    async commit() {
      record({ op: 'batch.commit', path: '' });
      maybeFail('batch.commit', '');
      writes.forEach((w) => w());
    },
  };
  return batch;
}

/**
 * runTransaction(fn) (namespaced) or runTransaction(firestore, fn) (modular).
 * `docSnapshot` builds what tx.get returns (it lives with the refs).
 */
function makeRunTransaction(docSnapshot) {
  return async function runTransaction(...args) {
    const fn = args.find((a) => typeof a === 'function');
    const writes = [];
    const tx = {
      async get(ref) {
        if (writes.length) {
          throw new Error(
            'Firestore transactions require all reads to be executed before all writes.',
          );
        }
        record({ op: 'tx.get', path: ref.path });
        maybeFail('tx.get', ref.path);
        return docSnapshot(ref);
      },
      set(ref, data, options) {
        record({ op: 'tx.set', path: ref.path, data, options });
        writes.push(() => log.writeSet(ref.path, data, options));
        return tx;
      },
      update(ref, ...rest) {
        const data = typeof rest[0] === 'string' ? pairsToObject(rest) : rest[0];
        record({ op: 'tx.update', path: ref.path, data });
        writes.push(() => log.writeUpdate(ref.path, data));
        return tx;
      },
      delete(ref) {
        record({ op: 'tx.delete', path: ref.path });
        writes.push(() => log.writeDelete(ref.path));
        return tx;
      },
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  };
}

const serverTimestamp = () => sentinel('serverTimestamp');
const increment = (n) => sentinel('increment', { n });
const arrayUnion = (...items) => sentinel('arrayUnion', { items });
const arrayRemove = (...items) => sentinel('arrayRemove', { items });
const deleteField = () => sentinel('deleteField');
const documentId = () => ({ __isDocumentIdPath: true });

const FieldValue = { serverTimestamp, increment, arrayUnion, arrayRemove, delete: deleteField };
const FieldPath = { documentId };

module.exports = {
  pairsToObject,
  writeBatch,
  makeRunTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
  documentId,
  FieldValue,
  FieldPath,
};
