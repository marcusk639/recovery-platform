// Findings ledger entries carried in the summary comment's hidden marker (public).
// Security entries hold only an opaque id, severity and status: never a slug,
// title, file or mechanism. Ids are keyed (HMAC with PR_REVIEW_ID_KEY, held only
// by the publish step): slugs are guessable from the public diff, so a plain hash
// of one could be brute-forced back to the security finding's file and symbol.
import { createHash, createHmac } from 'node:crypto';
import { redact } from './redact.mjs';

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['open', 'resolved', 'superseded'];
const ID_RE = /^[0-9a-f]{16}$/;
const MAX_TITLE = 120;
const MAX_SLUG = 200;

export function opaqueId(slug, key) {
  const h = key ? createHmac('sha256', String(key)) : createHash('sha256');
  return h.update(String(slug), 'utf8').digest('hex').slice(0, 16);
}

function securityEntry(id, severity, status, runsSinceResolved) {
  return { id, severity, status, security: true, runsSinceResolved };
}

// Without a key, security findings get no ledger entry at all (never an unkeyed id).
export function toLedgerEntry(finding, key) {
  if (finding.security) return key ? securityEntry(opaqueId(finding.slug, key), finding.severity, 'open', 0) : null;
  const id = opaqueId(finding.slug, key);
  return {
    id,
    slug: redact(finding.slug).slice(0, MAX_SLUG),
    title: redact(finding.title).slice(0, MAX_TITLE),
    severity: finding.severity,
    status: 'open',
    security: false,
    runsSinceResolved: 0,
  };
}

// Normalises one prior entry read from state.json (which came from a public,
// editable comment). Returns null for anything that does not fit the contract.
export function sanitizeEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return null;
  if (!SEVERITIES.includes(e.severity) || !STATUSES.includes(e.status)) return null;
  const runs = Number.isInteger(e.runsSinceResolved) && e.runsSinceResolved >= 0 ? e.runsSinceResolved : 0;
  if (e.security === true) return securityEntry(e.id, e.severity, e.status, runs);
  if (e.security !== false || typeof e.slug !== 'string' || typeof e.title !== 'string') return null;
  return {
    id: e.id,
    slug: redact(e.slug).slice(0, MAX_SLUG),
    title: redact(e.title).slice(0, MAX_TITLE),
    severity: e.severity,
    status: e.status,
    security: false,
    runsSinceResolved: runs,
  };
}

export function sanitizeLedger(list, key) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = sanitizeEntry(raw);
    if (!e || seen.has(e.id) || (e.security && !key)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

const RANK = (e) => (e.status === 'open' ? 0 : 4) + SEVERITIES.indexOf(e.severity);

// Keeps the encoded marker under maxLen: first drops non-security titles, then
// the lowest-priority entries (closed before open, Low before Critical).
export function fitMarker(payload, encode, maxLen) {
  let p = payload;
  if (encode(p).length <= maxLen) return p;
  p = { ...p, ledger: p.ledger.map((e) => (e.security ? e : { ...e, title: '' })) };
  if (encode(p).length <= maxLen) return p;
  const kept = [...p.ledger].sort((a, b) => RANK(a) - RANK(b));
  while (kept.length && encode({ ...p, ledger: kept }).length > maxLen) kept.pop();
  return { ...p, ledger: kept };
}

// Prior entries not re-reported this run, then the current findings (current
// wins). An id that was security stays security, so a later non-security
// re-report cannot publish its slug or title.
export function nextLedger(prior, findings, key) {
  const old = sanitizeLedger(prior, key);
  const wasSecurity = new Set(old.filter((e) => e.security).map((e) => e.id));
  const byId = new Map();
  for (const f of findings) {
    let e = toLedgerEntry(f, key);
    if (!e || byId.has(e.id)) continue;
    if (!e.security && wasSecurity.has(e.id)) e = securityEntry(e.id, e.severity, e.status, e.runsSinceResolved);
    byId.set(e.id, e);
  }
  return [...old.filter((e) => !byId.has(e.id)), ...byId.values()];
}
