// Findings ledger entries carried in the summary comment's hidden marker (public).
// Security entries hold only an opaque id, severity and status: never a slug,
// title, file or mechanism. Ids are keyed (HMAC with PR_REVIEW_ID_KEY, held only
// by the publish step): slugs are guessable from the public diff, so a plain hash
// of one could be brute-forced back to the security finding's file and symbol.
import { redact } from './redact.mjs';
import { mentions, touchesSecurityFile } from './needles.mjs';
import { ID_RE, opaqueId } from './ids.mjs';
import { cleanFileIds, fileIdsOf } from './fileids.mjs';

export { opaqueId };

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['open', 'resolved', 'superseded'];
const MAX_TITLE = 120;
const MAX_SLUG = 200;

// fileIds: keyed hashes of the security finding's files, so later runs can
// withhold non-security findings on those files without the path being public.
function securityEntry(id, severity, status, runsSinceResolved, fileIds = []) {
  return { id, severity, status, security: true, runsSinceResolved, fileIds: cleanFileIds(fileIds) };
}

// A non-security finding that names a security file: no slug or title in public.
function withheldEntry(id, severity, status, runsSinceResolved) {
  return { id, severity, status, security: false, runsSinceResolved, withheld: true };
}

// Without a key, security findings get no ledger entry at all (never an unkeyed id).
export function toLedgerEntry(finding, key) {
  if (finding.security) return key ? securityEntry(opaqueId(finding.slug, key), finding.severity, 'open', 0, fileIdsOf([finding], key)) : null;
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
  if (e.security === true) return securityEntry(e.id, e.severity, e.status, runs, e.fileIds);
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
    // Security and withheld ids are only safe keyed; unkeyed they are omitted.
    if (!e || seen.has(e.id) || ((e.security || e.withheld) && !key)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export const VISIBLE_RUNS = 5;

// What the summary may show: open entries, and resolved ones for VISIBLE_RUNS reviews.
export function visibleEntries(ledger) {
  return (ledger ?? []).filter((e) => e.status !== 'resolved' || e.runsSinceResolved < VISIBLE_RUNS);
}

const closed = (e) => e.status !== 'open';
const RANK = (e) => (e.status === 'open' ? 0 : 4) + SEVERITIES.indexOf(e.severity);

// Keeps the encoded marker under maxLen: first drops closed entries (oldest
// resolved first), then non-security titles, then the lowest-priority entries.
export function fitMarker(payload, encode, maxLen) {
  const fits = (ledger) => encode({ ...payload, ledger }).length <= maxLen;
  if (fits(payload.ledger)) return payload;
  let kept = [...payload.ledger];
  const byAge = kept.filter(closed).sort((a, b) => b.runsSinceResolved - a.runsSinceResolved);
  for (const e of byAge) {
    if (fits(kept)) return { ...payload, ledger: kept };
    kept = kept.filter((k) => k !== e);
  }
  if (fits(kept)) return { ...payload, ledger: kept };
  kept = kept.map((e) => ('title' in e ? { ...e, title: '' } : e)).sort((a, b) => RANK(a) - RANK(b));
  while (kept.length && !fits(kept)) kept.pop();
  return { ...payload, ledger: kept };
}

function withStatus(e, status, runsSinceResolved) {
  return { ...e, status, runsSinceResolved };
}

// An entry not re-reported this run: resolvedSlugs resolve it (age 0), an
// already-resolved one ages by a run, anything else keeps its status. Security
// and withheld entries are resolved only via the private channel, so the public
// resolved count cannot be used to test guesses at their slugs.
function age(e, resolvedIds) {
  if (e.status === 'resolved') return withStatus(e, 'resolved', e.runsSinceResolved + 1);
  const resolvable = !e.security && !e.withheld && resolvedIds.has(e.id);
  return resolvable ? withStatus(e, 'resolved', 0) : e;
}

// Prior entries plus this run's findings, matched by id (keyed opaqueId of the
// slug). Tier "none" ran no model, so the ledger is returned as it was. Findings
// are grouped by slug: if any finding in a group, or the prior entry with that
// id, is security, the entry is security (dropped when there is no key). A
// non-security entry that names a security file anywhere is written withheld,
// with no slug or title. A finding reported this run is open even if its slug is
// also listed as resolved.
export function mergeLedger(prior, findings, resolvedSlugs, tier, { key = null, needles = [] } = {}) {
  if (tier === 'none') return sanitizeLedger(prior, key);
  const groups = new Map();
  for (const f of findings) {
    const g = groups.get(f.slug) ?? { f, security: false, withheld: false, all: [] };
    g.all.push(f);
    if (f.security && !g.security) Object.assign(g, { f, security: true });
    if (touchesSecurityFile(f, needles)) g.withheld = true;
    groups.set(f.slug, g);
  }
  const old = sanitizeLedger(prior, key)
    .map((e) =>
      !e.security && !e.withheld && (mentions(e.slug, needles) || mentions(e.title, needles))
        ? key && withheldEntry(e.id, e.severity, e.status, e.runsSinceResolved)
        : e,
    )
    .filter(Boolean);
  const wasSecurity = new Map(old.filter((e) => e.security).map((e) => [e.id, e]));
  const resolvedIds = new Set((resolvedSlugs ?? []).map((s) => opaqueId(s, key)));
  const touched = new Set();
  const current = [];
  for (const { f, security, withheld, all } of groups.values()) {
    const id = opaqueId(f.slug, key);
    touched.add(id);
    if (security || wasSecurity.has(id)) {
      const fileIds = [...fileIdsOf(all, key), ...(wasSecurity.get(id)?.fileIds ?? [])];
      if (key) current.push(securityEntry(id, f.severity, 'open', 0, fileIds));
    } else if (withheld) {
      if (key) current.push(withheldEntry(id, f.severity, 'open', 0));
    } else {
      current.push(toLedgerEntry(f, key));
    }
  }
  return [...old.filter((e) => !touched.has(e.id)).map((e) => age(e, resolvedIds)), ...current];
}

// Dispositioned outside the review (an advisory closed, a maintainer's reply):
// open entries matching pred become resolved this run.
export function markResolved(ledger, pred) {
  return ledger.map((e) => (e.status === 'open' && pred(e) ? withStatus(e, 'resolved', 0) : e));
}
