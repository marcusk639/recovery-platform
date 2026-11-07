/**
 * Query evaluation for the firebase-modular Firestore mock: where, orderBy,
 * limit and cursors, applied to the in-memory store in log.js the way
 * Firestore applies them.
 */
const { state } = require('./log');

const DOCUMENT_ID = '__name__';

function comparable(value) {
  if (value && typeof value === 'object') {
    if (value.__isMockTimestamp) {
      return value.toMillis();
    }
    if (value instanceof Date) {
      return value.getTime();
    }
  }
  return value;
}

function fieldOf(path, data, field) {
  if (field === DOCUMENT_ID) {
    return path.split('/').pop();
  }
  return String(field)
    .split('.')
    .reduce((obj, key) => (obj && typeof obj === 'object' ? obj[key] : undefined), data);
}

function same(a, b) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

function matches(path, data, [field, op, value]) {
  const actual = fieldOf(path, data, field);
  const a = comparable(actual);
  const v = comparable(value);
  switch (op) {
    case '==':
      return same(actual, value);
    case '!=':
      return actual !== undefined && !same(actual, value);
    case '<':
      return a !== undefined && a < v;
    case '<=':
      return a !== undefined && a <= v;
    case '>':
      return a !== undefined && a > v;
    case '>=':
      return a !== undefined && a >= v;
    case 'in':
      return value.some((item) => same(actual, item));
    case 'not-in':
      return actual !== undefined && !value.some((item) => same(actual, item));
    case 'array-contains':
      return Array.isArray(actual) && actual.some((item) => same(item, value));
    case 'array-contains-any':
      return Array.isArray(actual) && actual.some((item) => value.some((v2) => same(item, v2)));
    default:
      throw new Error(`firebase-modular mock: unsupported where operator ${op}`);
  }
}

/** Documents in the collection (or, for a group, every collection with that id). */
function candidates(path, group) {
  const out = [];
  state.docs.forEach((data, docPath) => {
    const parts = docPath.split('/');
    const parent = parts.slice(0, -1).join('/');
    const inScope = group ? parts[parts.length - 2] === path : parent === path;
    if (inScope) {
      out.push({ path: docPath, data });
    }
  });
  return out;
}

function compareBy(orders) {
  return (x, y) => {
    for (const [field, dir] of orders) {
      const a = comparable(fieldOf(x.path, x.data, field));
      const b = comparable(fieldOf(y.path, y.data, field));
      if (a < b) {
        return dir === 'desc' ? 1 : -1;
      }
      if (a > b) {
        return dir === 'desc' ? -1 : 1;
      }
    }
    return x.path < y.path ? -1 : x.path > y.path ? 1 : 0;
  };
}

/** Index of the first result after (or at) the cursor. */
function cursorIndex(results, orders, args, inclusive) {
  const [first] = args;
  if (first && first.__isMockSnapshot) {
    const i = results.findIndex((r) => r.path === first.ref.path);
    return inclusive ? i : i + 1;
  }
  const [field, dir] = orders[0] || [DOCUMENT_ID, 'asc'];
  const v = comparable(first);
  const i = results.findIndex((r) => {
    const a = comparable(fieldOf(r.path, r.data, field));
    if (inclusive) {
      return dir === 'desc' ? a <= v : a >= v;
    }
    return dir === 'desc' ? a < v : a > v;
  });
  return i === -1 ? results.length : i;
}

/** Runs the constraints, in order, against the store. Returns [{ path, data }]. */
function runQuery(path, group, constraints) {
  let results = candidates(path, group);
  const orders = constraints
    .filter(([kind]) => kind === 'orderBy')
    .map(([, f, d]) => [f, d || 'asc']);
  constraints
    .filter(([kind]) => kind === 'where')
    .forEach(([, ...clause]) => {
      results = results.filter((r) => matches(r.path, r.data, clause));
    });
  // Firestore drops documents that lack an ordered field.
  orders.forEach(([field]) => {
    results = results.filter((r) => fieldOf(r.path, r.data, field) !== undefined);
  });
  results.sort(compareBy(orders));
  constraints.forEach(([kind, ...args]) => {
    if (kind === 'startAfter') {
      results = results.slice(cursorIndex(results, orders, args, false));
    }
    if (kind === 'startAt') {
      results = results.slice(cursorIndex(results, orders, args, true));
    }
    if (kind === 'endBefore') {
      results = results.slice(0, cursorIndex(results, orders, args, true));
    }
    if (kind === 'endAt') {
      results = results.slice(0, cursorIndex(results, orders, args, false));
    }
  });
  constraints.forEach(([kind, n]) => {
    if (kind === 'limit') {
      results = results.slice(0, n);
    }
    if (kind === 'limitToLast') {
      results = results.slice(-n);
    }
  });
  return results;
}

module.exports = { runQuery, DOCUMENT_ID };
