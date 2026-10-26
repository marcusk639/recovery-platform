// Publishes the PR review: the inline comments from OUT/inline.json (as one PR
// review), private advisories for security findings, then the one summary
// comment from OUT/{findings.json,summary.md} and the trusted STATE_FILE
// snapshot (never OUT/state.json). Runs from a fresh base-SHA checkout after
// the model has finished, so nothing the model wrote can change this code.
// Logs status codes only, always exits 0.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ghRequest, listIssueComments, listReviewComments, upsertSummary } from './lib/gh.mjs';
import { encodeLedger } from './lib/markers.mjs';
import { fitMarker, markResolved, mergeLedger, opaqueId, sanitizeLedger, visibleEntries } from './lib/ledger.mjs';
import { MAX_MARKER, renderSummary, validateFindings } from './lib/render.mjs';
import { isObject, priorFromComment, priorPayload, resolvePrior, sha, strings } from './lib/prior.mjs';
import { postSummary } from './lib/summary-post.mjs';
import { touchesSecurityFile } from './lib/needles.mjs';
import { priorFileIds, runNeedles } from './lib/fileids.mjs';
import { runInline, INLINE_NOTICE } from './lib/inline-stage.mjs';
import { deliverAdvisories } from './advisories.mjs';
import { runPaths } from './lib/paths.mjs';

export { INLINE_NOTICE, priorFromComment };

const RATE_RE = /rate.?limit|usage limit/i;
// Only the tail holds the final result; earlier turns may quote PR code about rate limiting.
const LOG_TAIL = 4000;

export function failureReason(executionLog) {
  const tail = String(executionLog ?? '').slice(-LOG_TAIL);
  return RATE_RE.test(tail) ? 'rate-limited' : 'failed';
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
function noChangeBody(prior, headSha, baseSha, notices) {
  const head = sha(headSha) ?? prior.lastReviewedSha;
  const base = sha(baseSha) ?? prior.lastBaseSha;
  const since = String(prior.lastReviewedSha ?? head ?? '').slice(0, 7);
  const baseMoved = Boolean(prior.lastBaseSha && base && base !== prior.lastBaseSha);
  const note = baseMoved ? `Base updated; no counterpart changes since \`${since}\`.` : `No new changes since \`${since}\`.`;
  const ledger = { ...prior, lastReviewedSha: head, lastBaseSha: base };
  return renderSummary({ state: {}, findings: null, narrative: '', outcome: 'none', note, ledger, notices });
}

// Findings to mark "(new)": none on a first review. Without the id key,
// security and withheld findings have no prior entry to compare against.
function newSlugs(findings, prior, idKey, needles) {
  if (!prior.lastReviewedSha) return new Set();
  const ids = new Set(prior.ledger.map((e) => e.id));
  const comparable = (f) => idKey || (!f.security && !touchesSecurityFile(f, needles));
  return new Set(findings.filter((f) => comparable(f) && !ids.has(opaqueId(f.slug, idKey))).map((f) => f.slug));
}

export const DELIVERED = 'details sent privately';
export const NOT_DELIVERED = 'details could not be delivered privately; re-run after fixing the advisory token';
export const NO_KEY = 'details could not be delivered privately; id key unavailable';

// The validated findings of a completed review, or null when publish will show
// the failure banner instead. Shared by composeBody and advisory delivery.
function completedFindings(state, findingsText, outcome) {
  if (!isObject(state) || outcome !== 'success' || state.tier === 'none') return null;
  const parsed = validateFindings(findingsText ?? '');
  return parsed.ok ? parsed.value : null;
}

// Without a trusted snapshot: always the failure banner, with prior state from
// the existing summary comment (fallback.state, sanitized as usual) or, if its
// marker does not decode, that marker re-emitted verbatim (fallback.rawMarker).
function untrustedBody(fallback, idKey, linkTypes, notices) {
  const ledger = priorPayload(fallback?.state, idKey, linkTypes);
  return renderSummary({ state: {}, findings: null, narrative: '', outcome: 'failure', reason: 'failed', ledger, rawMarker: fallback?.rawMarker ?? null, notices });
}

export const FROZEN_NOTICE = '> ledger frozen for security entries: id key unavailable';

// Without the key: no security or withheld entry can be created (or matched),
// so existing ones are carried unchanged and the summary says so.
function frozenNotice(idKey, ledger, findings, needles) {
  if (idKey) return [];
  const priorOpaque = ledger.some((e) => e.security || e.withheld);
  const current = (findings ?? []).some((f) => f.security || touchesSecurityFile(f, needles));
  return priorOpaque || current ? [FROZEN_NOTICE] : [];
}

// resolvedIds: security ids whose advisory was dispositioned (advisories.mjs).
// notices: fixed lines from publish itself (e.g. the inline guard).
// rawMarker: the old marker, re-emitted verbatim when the prior state could not be read.
export function composeBody({ state, findingsText, narrative, outcome, executionLog, headSha, baseSha, idKey, linkTypes = knownLinkTypes(), fallback, securityClause = DELIVERED, resolvedIds = [], notices = [], inlinePosted = new Set(), rawMarker = null }) {
  // A missing or invalid snapshot fails closed, whatever the action outcome.
  if (!isObject(state)) return untrustedBody(fallback, idKey, linkTypes, notices);
  const s = state;
  const known = new Set(linkTypes);
  const types = (list) => strings(list).filter((t) => known.has(t));
  const prior = priorPayload(s, idKey, linkTypes);
  if (s.tier === 'none' && outcome === 'skipped') return noChangeBody(prior, headSha, baseSha, notices);
  // Tier "none" never runs the model, so a "success" alongside it is not trusted.
  const completed = completedFindings(s, findingsText, outcome);
  if (!completed) {
    const lines = [...notices, ...frozenNotice(idKey, prior.ledger, [], [])];
    return renderSummary({ state: s, findings: null, narrative: '', outcome: 'failure', reason: failureReason(executionLog), ledger: prior, notices: lines, rawMarker });
  }
  // Only what publish itself posted counts; the model's own flag is ignored.
  const findings = { ...completed, findings: completed.findings.map((f) => ({ ...f, inlinePosted: inlinePosted.has(f.slug) })) };
  // Built once: current security files plus paths hashing to prior security fileIds.
  const needles = runNeedles(findings.findings, [narrative], priorFileIds(prior.ledger), idKey);
  // The trusted head (workflow env, then snapshot); the model's reviewedSha is ignored.
  const reviewed = sha(headSha) ?? sha(s.headSha) ?? prior.lastReviewedSha;
  const touched = new Set(findings.findings.map((f) => opaqueId(f.slug, idKey)));
  // Dispositioned outside the review: a closed/withdrawn/published advisory
  // (security), or a maintainer's reply to the inline comment (non-security).
  // An id reported again in this run stays open.
  const dispositioned = new Set(resolvedIds.filter((id) => !touched.has(id)));
  const acked = new Set(strings(s.acknowledgedSlugs));
  const merged = markResolved(
    mergeLedger(prior.ledger, findings.findings, findings.resolvedSlugs, s.tier, { key: idKey, needles }),
    (e) => (e.security ? dispositioned.has(e.id) : !e.withheld && acked.has(e.slug) && !touched.has(e.id)),
  );
  const ledger = {
    lastReviewedSha: reviewed,
    lastBaseSha: sha(baseSha),
    linkTypesSeen: [...new Set([...prior.linkTypesSeen, ...types(s.runLinkTypes)])],
    ledger: merged,
  };
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
    securityClause: idKey ? securityClause : NO_KEY,
    notices: [...notices, ...frozenNotice(idKey, prior.ledger, findings.findings, needles)],
    rawMarker,
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
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Security findings go to draft advisories first (advisoryToken only there,
// never to the comment calls), so the public pointer says whether that worked.
// Prior open security ids are looked up too, so a dispositioned advisory
// resolves its ledger entry (needs the key and the token, like delivery).
async function deliver(repo, pr, snapshot, rest, deliverFn) {
  const findings = completedFindings(snapshot, rest.findingsText, rest.outcome);
  if (!findings) return { clause: DELIVERED, resolvedIds: [] };
  const security = findings.findings.filter((f) => f.security);
  const priorIds = rest.idKey ? sanitizeLedger(snapshot.ledger, rest.idKey).filter((e) => e.security && e.status === 'open').map((e) => e.id) : [];
  if (!security.length && !priorIds.length) return { clause: DELIVERED, resolvedIds: [] };
  try {
    const res = await deliverFn(repo, pr, security, rest.advisoryToken || null, undefined, rest.idKey || null, priorIds);
    const resolvedIds = Array.isArray(res?.resolvedIds) ? res.resolvedIds : [];
    return { clause: res?.delivered === true ? DELIVERED : NOT_DELIVERED, resolvedIds };
  } catch (err) {
    console.log(`advisories failed: ${Number.isInteger(err?.status) ? err.status : 'unknown'}`);
    return { clause: NOT_DELIVERED, resolvedIds: [] };
  }
}

// The marker the summary carried before this run, for the minimal retry body.
function previousMarker(snapshot, fallback, rawMarker, idKey) {
  if (rawMarker) return rawMarker;
  if (!isObject(snapshot) && fallback?.rawMarker) return fallback.rawMarker;
  const p = priorPayload(isObject(snapshot) ? snapshot : fallback?.state, idKey, knownLinkTypes());
  return encodeLedger(fitMarker(p, encodeLedger, MAX_MARKER));
}

// Without a trusted snapshot and without the comment, nothing is posted: the
// old comment (and its marker) stays as it was. The same holds when facts could
// not read the prior state and publish cannot either.
export async function publish({ repo, pr, snapshot: trusted, advisoryToken, ...rest }, deps = { listIssueComments, upsertSummary }) {
  let fallback;
  if (!isObject(trusted)) {
    fallback = await priorFromComment(repo, pr, deps.listIssueComments);
    if (!fallback) {
      console.log('publish skipped: no trusted state');
      return;
    }
  }
  const prior = await resolvePrior(repo, pr, trusted, deps.listIssueComments);
  const snapshot = prior.snapshot;
  const findings = completedFindings(snapshot, rest.findingsText, rest.outcome)?.findings ?? null;
  const inline = await runInline({ repo, pr, snapshot, findings, inlineText: rest.inlineText, idKey: rest.idKey, headSha: sha(rest.headSha), runStartedAt: rest.runStartedAt }, deps);
  const { clause, resolvedIds } = await deliver(repo, pr, snapshot, { ...rest, advisoryToken }, deps.deliverAdvisories ?? deliverAdvisories);
  if (prior.skip) {
    console.log('publish skipped: prior state unavailable');
    return;
  }
  const notices = [...(prior.notice ? [prior.notice] : []), ...inline.notices];
  const body = composeBody({ ...rest, state: snapshot, fallback, securityClause: clause, resolvedIds, notices, inlinePosted: inline.posted, rawMarker: prior.rawMarker ?? null });
  const headSha = sha(rest.headSha) ?? sha(snapshot?.headSha);
  await postSummary(repo, pr, body, deps.upsertSummary, { headSha, previousMarker: previousMarker(snapshot, fallback, prior.rawMarker, rest.idKey || null) });
}

async function main() {
  try {
    const { REPO, PR, HEAD_SHA, BASE_SHA, ACTION_OUTCOME, EXECUTION_FILE, PR_REVIEW_ID_KEY, ADVISORY_TOKEN, RUN_STARTED_AT } = process.env;
    // Fail closed without OUT and STATE_FILE: no snapshot, no model output, so
    // the failure banner (prior state from the comment) or nothing at all.
    const run = runPaths();
    if (!run) console.log('publish: OUT or STATE_FILE unset');
    const fromOut = (name) => (run ? readOptional(join(run.out, name)) : null);
    const deps = { listIssueComments, upsertSummary, listReviewComments, request: ghRequest };
    await publish({
      repo: REPO,
      pr: PR,
      snapshot: run ? readState(run.stateFile) : null,
      findingsText: fromOut('findings.json'),
      inlineText: fromOut('inline.json'),
      narrative: fromOut('summary.md') ?? '',
      outcome: ACTION_OUTCOME,
      executionLog: EXECUTION_FILE ? readOptional(EXECUTION_FILE) : null,
      headSha: HEAD_SHA,
      baseSha: BASE_SHA,
      runStartedAt: RUN_STARTED_AT || null,
      idKey: PR_REVIEW_ID_KEY || null,
      // Advisory requests only; never passed to the summary comment calls.
      advisoryToken: ADVISORY_TOKEN || null,
    }, deps);
  } catch (err) {
    // Never log bodies, tokens or messages; status only.
    console.log(`publish failed: ${err?.status ?? 'unknown'}`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
