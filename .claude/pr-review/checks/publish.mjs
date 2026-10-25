// Publishes the one summary comment from OUT/{state.json,findings.json,summary.md}.
// Runs from the base-SHA checkout after the model has finished, so nothing the
// model wrote can change this code. Logs status codes only, always exits 0.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { upsertSummary } from './lib/gh.mjs';
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

export function composeBody({ state, findingsText, narrative, outcome, executionLog, headSha, baseSha, idKey, linkTypes = knownLinkTypes() }) {
  const valid = Boolean(state) && typeof state === 'object' && !Array.isArray(state);
  const s = valid ? state : {};
  const known = new Set(linkTypes);
  const types = (list) => strings(list).filter((t) => known.has(t));
  const prior = {
    lastReviewedSha: sha(s.lastReviewedSha),
    lastBaseSha: sha(s.lastBaseSha),
    linkTypesSeen: [...new Set(types(s.linkTypesSeen))],
    ledger: sanitizeLedger(s.ledger, idKey),
  };
  // A missing snapshot is never the no-change path.
  if (valid && s.tier === 'none' && outcome === 'skipped') return noChangeBody(prior, headSha, baseSha);
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

async function main() {
  try {
    const { REPO, PR, HEAD_SHA, BASE_SHA, ACTION_OUTCOME, EXECUTION_FILE, OUT, STATE_FILE, PR_REVIEW_ID_KEY } = process.env;
    const out = OUT || '.';
    const body = composeBody({
      state: readState(STATE_FILE),
      findingsText: readOptional(join(out, 'findings.json')),
      narrative: readOptional(join(out, 'summary.md')) ?? '',
      outcome: ACTION_OUTCOME,
      executionLog: EXECUTION_FILE ? readOptional(EXECUTION_FILE) : null,
      headSha: HEAD_SHA,
      baseSha: BASE_SHA,
      idKey: PR_REVIEW_ID_KEY || null,
    });
    await upsertSummary(REPO, PR, body);
  } catch (err) {
    // Never log bodies, tokens or messages; status only.
    console.log(`publish failed: ${err?.status ?? 'unknown'}`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
