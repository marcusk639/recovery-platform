// Publishes the one summary comment from OUT/{state.json,findings.json,summary.md}.
// Runs from the base-SHA checkout after the model has finished, so nothing the
// model wrote can change this code. Logs status codes only, always exits 0.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listIssueComments, upsertSummary } from './lib/gh.mjs';
import { findSummary } from './lib/state.mjs';
import { decodeLedger, rawLedgerMarker } from './lib/markers.mjs';
import { mergeLedger, opaqueId, sanitizeLedger, visibleEntries } from './lib/ledger.mjs';
import { renderSummary, validateFindings } from './lib/render.mjs';
import { securityNeedles, touchesSecurityFile } from './lib/needles.mjs';

const SHA_RE = /^[0-9a-f]{40}$/i;
const RATE_RE = /rate.?limit|usage limit/i;
// Only the tail holds the final result; earlier turns may quote PR code about rate limiting.
const LOG_TAIL = 4000;

export function failureReason(executionLog) {
  const tail = String(executionLog ?? '').slice(-LOG_TAIL);
  return RATE_RE.test(tail) ? 'rate-limited' : 'failed';
}

function strings(list) {
  return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
}

function sha(v) {
  return typeof v === 'string' && SHA_RE.test(v) ? v : null;
}

// Link types publish will carry forward: only those routing.json defines.
export function knownLinkTypes() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../routing.json');
    return JSON.parse(readFileSync(path, 'utf8')).map((r) => r.linkType).filter((t) => typeof t === 'string');
  } catch {
    return [];
  }
}

// Tier "none" (facts found nothing new; the review step was skipped): only the
// SHAs move. The ledger and linkTypesSeen stay as they were.
function noChangeBody(prior, headSha, baseSha) {
  const head = sha(headSha) ?? prior.lastReviewedSha;
  const base = sha(baseSha) ?? prior.lastBaseSha;
  const since = String(prior.lastReviewedSha ?? head ?? '').slice(0, 7);
  const baseMoved = Boolean(prior.lastBaseSha && base && base !== prior.lastBaseSha);
  const note = baseMoved ? `Base updated; no counterpart changes since \`${since}\`.` : `No new changes since \`${since}\`.`;
  const ledger = { ...prior, lastReviewedSha: head, lastBaseSha: base };
  return renderSummary({ state: {}, findings: null, narrative: '', outcome: 'none', note, ledger });
}

// Findings to mark "(new)": none on a first review. Without the id key,
// security and withheld findings have no prior entry to compare against.
function newSlugs(findings, prior, idKey, needles) {
  if (!prior.lastReviewedSha) return new Set();
  const ids = new Set(prior.ledger.map((e) => e.id));
  const comparable = (f) => idKey || (!f.security && !touchesSecurityFile(f, needles));
  return new Set(findings.filter((f) => comparable(f) && !ids.has(opaqueId(f.slug, idKey))).map((f) => f.slug));
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Without a trusted snapshot: always the failure banner, with prior state from
// the existing summary comment (fallback.state, sanitized as usual) or, if its
// marker does not decode, that marker re-emitted verbatim (fallback.rawMarker).
function untrustedBody(fallback, idKey, linkTypes) {
  const p = isObject(fallback?.state) ? fallback.state : {};
  const known = new Set(linkTypes);
  const ledger = {
    lastReviewedSha: sha(p.lastReviewedSha),
    lastBaseSha: sha(p.lastBaseSha),
    linkTypesSeen: [...new Set(strings(p.linkTypesSeen).filter((t) => known.has(t)))],
    ledger: sanitizeLedger(p.ledger, idKey),
  };
  return renderSummary({ state: {}, findings: null, narrative: '', outcome: 'failure', reason: 'failed', ledger, rawMarker: fallback?.rawMarker ?? null });
}

export function composeBody({ state, findingsText, narrative, outcome, executionLog, headSha, baseSha, idKey, linkTypes = knownLinkTypes(), fallback }) {
  // A missing or invalid snapshot fails closed, whatever the action outcome.
  if (!isObject(state)) return untrustedBody(fallback, idKey, linkTypes);
  const s = state;
  const known = new Set(linkTypes);
  const types = (list) => strings(list).filter((t) => known.has(t));
  const prior = {
    lastReviewedSha: sha(s.lastReviewedSha),
    lastBaseSha: sha(s.lastBaseSha),
    linkTypesSeen: [...new Set(types(s.linkTypesSeen))],
    ledger: sanitizeLedger(s.ledger, idKey),
  };
  if (s.tier === 'none' && outcome === 'skipped') return noChangeBody(prior, headSha, baseSha);
  const parsed = validateFindings(findingsText ?? '');
  // Tier "none" never runs the model, so a "success" alongside it is not trusted.
  if (outcome !== 'success' || s.tier === 'none' || !parsed.ok) {
    return renderSummary({ state: s, findings: null, narrative: '', outcome: 'failure', reason: failureReason(executionLog), ledger: prior });
  }
  const findings = parsed.value;
  // Built once; prior security entries carry no files, so current findings only.
  const needles = securityNeedles(findings.findings);
  const reviewed = sha(findings.reviewedSha) ?? sha(headSha);
  const merged = mergeLedger(prior.ledger, findings.findings, findings.resolvedSlugs, s.tier, { key: idKey, needles });
  const ledger = {
    lastReviewedSha: reviewed,
    lastBaseSha: sha(baseSha),
    linkTypesSeen: [...new Set([...prior.linkTypesSeen, ...types(s.runLinkTypes)])],
    ledger: merged,
  };
  const touched = new Set(findings.findings.map((f) => opaqueId(f.slug, idKey)));
  const visible = visibleEntries(merged);
  return renderSummary({
    state: { ...s, headSha: reviewed },
    findings: { ...findings, reviewedSha: reviewed },
    narrative,
    outcome: 'success',
    ledger,
    needles,
    newSlugs: newSlugs(findings.findings, prior, idKey, needles),
    carried: visible.filter((e) => e.status === 'open' && !touched.has(e.id)),
    resolved: visible.filter((e) => e.status === 'resolved'),
  });
}

function readOptional(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// Reads facts' snapshot (STATE_FILE, outside the model's --add-dir), never
// OUT/state.json, which the model can overwrite.
function readState(path) {
  try {
    return path ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
}

// Prior state from the existing summary comment (same author and marker rule
// as loadState). null when the comments cannot be read.
export async function priorFromComment(repo, pr, list = listIssueComments) {
  let comments;
  try {
    comments = await list(repo, pr);
  } catch {
    return null;
  }
  const summary = findSummary(comments);
  if (!summary) return { state: {} };
  const payload = decodeLedger(summary.body);
  return isObject(payload) ? { state: payload } : { state: {}, rawMarker: rawLedgerMarker(summary.body) };
}

// Without a trusted snapshot and without the comment, nothing is posted: the
// old comment (and its marker) stays as it was.
export async function publish({ repo, pr, snapshot, ...rest }, deps = { listIssueComments, upsertSummary }) {
  let fallback;
  if (!isObject(snapshot)) {
    fallback = await priorFromComment(repo, pr, deps.listIssueComments);
    if (!fallback) {
      console.log('publish skipped: no trusted state');
      return;
    }
  }
  await deps.upsertSummary(repo, pr, composeBody({ ...rest, state: snapshot, fallback }));
}

async function main() {
  try {
    const { REPO, PR, HEAD_SHA, BASE_SHA, ACTION_OUTCOME, EXECUTION_FILE, OUT, STATE_FILE, PR_REVIEW_ID_KEY } = process.env;
    const out = OUT || '.';
    await publish({
      repo: REPO,
      pr: PR,
      snapshot: readState(STATE_FILE),
      findingsText: readOptional(join(out, 'findings.json')),
      narrative: readOptional(join(out, 'summary.md')) ?? '',
      outcome: ACTION_OUTCOME,
      executionLog: EXECUTION_FILE ? readOptional(EXECUTION_FILE) : null,
      headSha: HEAD_SHA,
      baseSha: BASE_SHA,
      idKey: PR_REVIEW_ID_KEY || null,
    });
  } catch (err) {
    // Never log bodies, tokens or messages; status only.
    console.log(`publish failed: ${err?.status ?? 'unknown'}`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
