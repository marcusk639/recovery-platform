/**
 * Normalized Firebase operation log and in-memory store for characterization
 * tests (RN 0.88 upgrade plan, Task 2).
 *
 * The namespaced API (`firestore.collection(...).doc(...).get()`) and the
 * modular API (`getDoc(doc(firestore, ...))`) both write the SAME entries
 * here, so a test written against this log on the namespaced code keeps
 * passing, byte for byte, after the service moves to the modular API. Tests
 * assert outcomes and log entries, never mock call chains or snapshot shapes.
 *
 * Entry: { op, path, data?, options?, constraints? }
 *   op: get | getDocs | set | update | add | delete | listen | tx.get | tx.set
 *       | tx.update | tx.delete | batch.set | batch.update | batch.delete
 *       | batch.commit | call
 * Sentinels serialize as { __fv: 'serverTimestamp' | 'increment' (n) |
 * 'arrayUnion' (items) | 'arrayRemove' (items) | 'deleteField' }.
 */

const state = {
  log: [],
  docs: new Map(), // path -> data
  calls: new Map(), // callable name -> response data
  failures: [], // { op, path, error }
  nextId: 1,
};

const SENTINEL = Symbol.for('firebase-modular.sentinel');

const { Timestamp } = require('./timestamp');

function sentinel(kind, extra) {
  return { [SENTINEL]: true, __fv: kind, ...extra };
}

function isSentinel(value) {
  return !!value && typeof value === 'object' && value[SENTINEL] === true;
}

/** Deep copy that keeps Dates, sentinels and Timestamps; refs become { __ref }. */
function serialize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (isSentinel(value)) {
    const { [SENTINEL]: _omit, ...plain } = value;
    return plain.items ? { ...plain, items: plain.items.map(serialize) } : plain;
  }
  if (value.__isMockTimestamp) {
    return { __ts: value.toMillis() };
  }
  if (value.__isMockRef) {
    return { __ref: value.path };
  }
  if (value.__isMockSnapshot) {
    return { __snap: value.ref.path };
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  const out = {};
  Object.keys(value).forEach((k) => {
    out[k] = serialize(value[k]);
  });
  return out;
}

function record(entry) {
  const clean = { op: entry.op, path: entry.path };
  if (entry.data !== undefined) {
    clean.data = serialize(entry.data);
  }
  if (entry.options !== undefined) {
    clean.options = serialize(entry.options);
  }
  if (entry.constraints !== undefined) {
    clean.constraints = serialize(entry.constraints);
  }
  state.log.push(clean);
}

/** Throws the queued error if one matches this op (and path, when given). */
function maybeFail(op, path) {
  const i = state.failures.findIndex(
    (f) => f.op === op && (f.path === undefined || f.path === path),
  );
  if (i === -1) {
    return;
  }
  const [failure] = state.failures.splice(i, 1);
  throw failure.error;
}

function autoId() {
  const id = `auto-${state.nextId}`;
  state.nextId += 1;
  return id;
}

// ─── store writes (sentinels resolved the way Firestore resolves them) ──────

function resolveValue(current, value) {
  if (!isSentinel(value)) {
    return serializeForStore(value);
  }
  switch (value.__fv) {
    case 'increment':
      return (typeof current === 'number' ? current : 0) + value.n;
    case 'arrayUnion': {
      const base = Array.isArray(current) ? current.slice() : [];
      value.items.forEach((item) => {
        if (!base.some((b) => JSON.stringify(b) === JSON.stringify(item))) {
          base.push(item);
        }
      });
      return base;
    }
    case 'arrayRemove': {
      const base = Array.isArray(current) ? current : [];
      return base.filter(
        (b) => !value.items.some((item) => JSON.stringify(b) === JSON.stringify(item)),
      );
    }
    case 'serverTimestamp':
      return { __serverTimestamp: true };
    default:
      return value;
  }
}

function serializeForStore(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  if (value.__isMockTimestamp || value.__isMockRef) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(serializeForStore);
  }
  const out = {};
  Object.keys(value).forEach((k) => {
    out[k] = serializeForStore(value[k]);
  });
  return out;
}

function applyFields(target, data, merge) {
  const out = { ...target };
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value === undefined) {
      return;
    } // ignoreUndefinedProperties: true
    if (isSentinel(value) && value.__fv === 'deleteField') {
      delete out[key];
      return;
    }
    const isMap =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !isSentinel(value) &&
      !value.__isMockTimestamp &&
      !value.__isMockRef;
    out[key] =
      merge && isMap && out[key] && typeof out[key] === 'object'
        ? applyFields(out[key], value, true)
        : resolveValue(out[key], value);
  });
  return out;
}

function writeSet(path, data, options) {
  const merge = !!(options && (options.merge || options.mergeFields));
  const base = merge ? state.docs.get(path) || {} : {};
  state.docs.set(path, applyFields(base, data, merge));
}

/** update() takes dotted field paths and fails on a missing document. */
function writeUpdate(path, data) {
  if (!state.docs.has(path)) {
    const error = new Error(`[firestore/not-found] Some requested document was not found.`);
    error.code = 'firestore/not-found';
    throw error;
  }
  let doc = state.docs.get(path);
  Object.keys(data).forEach((key) => {
    const parts = key.split('.');
    const leaf = parts.pop();
    const nested = (obj, i) => {
      if (i === parts.length) {
        return applyFields(obj, { [leaf]: data[key] }, false);
      }
      const child = obj[parts[i]] && typeof obj[parts[i]] === 'object' ? obj[parts[i]] : {};
      return { ...obj, [parts[i]]: nested(child, i + 1) };
    };
    doc = nested(doc, 0);
  });
  state.docs.set(path, doc);
}

function writeDelete(path) {
  state.docs.delete(path);
}

// ─── helpers for tests ───────────────────────────────────────────────────────

function getOpLog() {
  return state.log.map((e) => ({ ...e }));
}

function resetOpLog() {
  state.log = [];
  state.docs = new Map();
  state.calls = new Map();
  state.failures = [];
  state.nextId = 1;
}

/** Seeds a document; `path` is 'collection/id[/sub/id...]'. */
function seedDoc(path, data) {
  state.docs.set(path, serializeForStore(data));
}

/**
 * Seeds several documents of one collection: seedQuery('payments', [{ id, ...data }]).
 * Queries evaluate their constraints against the store, so this is the same
 * store seedDoc writes to.
 */
function seedQuery(collectionPath, docs) {
  docs.forEach(({ id, ...data }) => seedDoc(`${collectionPath}/${id}`, data));
}

/** The stored document, or undefined. */
function readDoc(path) {
  const data = state.docs.get(path);
  return data === undefined ? undefined : serialize(data);
}

/** The response `data` a callable resolves with. */
function seedCall(name, data) {
  state.calls.set(name, data);
}

/** The next `op` (on `path`, when given) throws `error`. */
function failNext(op, error, path) {
  state.failures.push({ op, path, error });
}

module.exports = {
  state,
  Timestamp,
  sentinel,
  isSentinel,
  record,
  maybeFail,
  autoId,
  writeSet,
  writeUpdate,
  writeDelete,
  getOpLog,
  resetOpLog,
  seedDoc,
  seedQuery,
  readDoc,
  seedCall,
  failNext,
};
