// Findings ledger entries carried in the summary comment's hidden marker (public).
// Security entries hold only an opaque id, severity and status: never a slug,
// title, file or mechanism. Ids are keyed (HMAC with PR_REVIEW_ID_KEY, held only
// by the publish step): slugs are guessable from the public diff, so a plain hash
// of one could be brute-forced back to the security finding's file and symbol.
import { createHash, createHmac } from 'node:crypto';
import { redact } from './redact.mjs';
import { mentions, touchesSecurityFile } from './needles.mjs';

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

// A non-security finding that names a security file: no slug or title in public.
function withheldEntry(id, severity, status, runsSinceResolved) {
  return { id, severity, status, security: false, runsSinceResolved, withheld: true };
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
  if (e.security === false && e.withheld === true) return withheldEntry(e.id, e.severity, e.status, runs);
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
  p = { ...p, ledger: p.ledger.map((e) => ('title' in e ? { ...e, title: '' } : e)) };
  if (encode(p).length <= maxLen) return p;
  const kept = [...p.ledger].sort((a, b) => RANK(a) - RANK(b));
  while (kept.length && encode({ ...p, ledger: kept }).length > maxLen) kept.pop();
  return { ...p, ledger: kept };
}

// Prior entries not re-reported this run, then the current findings (current
// wins). Findings are grouped by slug: if any finding in a group, or the prior
// entry with that id, is security, the entry is security (dropped when there is
// no key). A non-security entry that names a security file anywhere is
// written withheld, with no slug or title.
export function nextLedger(prior, findings, key, needles = []) {
  const groups = new Map();
  for (const f of findings) {
    const g = groups.get(f.slug) ?? { f, security: false, withheld: false };
    if (f.security && !g.security) Object.assign(g, { f, security: true });
    if (touchesSecurityFile(f, needles)) g.withheld = true;
    groups.set(f.slug, g);
  }
  const old = sanitizeLedger(prior, key).map((e) =>
    !e.security && !e.withheld && (mentions(e.slug, needles) || mentions(e.title, needles))
      ? withheldEntry(e.id, e.severity, e.status, e.runsSinceResolved)
      : e,
  );
  const wasSecurity = new Set(old.filter((e) => e.security).map((e) => e.id));
  const touched = new Set();
  const current = [];
  for (const { f, security, withheld } of groups.values()) {
    const id = opaqueId(f.slug, key);
    touched.add(id);
    if (security || wasSecurity.has(id)) {
      if (key) current.push(securityEntry(id, f.severity, 'open', 0));
    } else if (withheld) {
      current.push(withheldEntry(id, f.severity, 'open', 0));
    } else {
      current.push(toLedgerEntry(f, key));
    }
  }
  return [...old.filter((e) => !touched.has(e.id)), ...current];
}
