// Publishes the one summary comment from OUT/{state.json,findings.json,summary.md}.
// Runs from the base-SHA checkout after the model has finished, so nothing the
// model wrote can change this code. Logs status codes only, always exits 0.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { upsertSummary } from './lib/gh.mjs';
import { nextLedger, sanitizeLedger } from './lib/ledger.mjs';
import { renderSummary, validateFindings } from './lib/render.mjs';

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

export function composeBody({ state, findingsText, narrative, outcome, executionLog, headSha, baseSha, idKey, linkTypes = knownLinkTypes() }) {
  const s = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const known = new Set(linkTypes);
  const prior = {
    lastReviewedSha: sha(s.lastReviewedSha),
    lastBaseSha: sha(s.lastBaseSha),
    linkTypesSeen: [...new Set(strings(s.linkTypesSeen).filter((t) => known.has(t)))],
    ledger: sanitizeLedger(s.ledger, idKey),
  };
  // Tier "none" (Task 9) runs no model: success with nothing new to report.
  const noModel = s.tier === 'none';
  const parsed = noModel
    ? { ok: true, value: { reviewedSha: headSha, findings: [], resolvedSlugs: [] } }
    : validateFindings(findingsText ?? '');
  const ok = (noModel || outcome === 'success') && parsed.ok;
  if (!ok) {
    return renderSummary({
      state: s,
      findings: null,
      narrative: '',
      outcome: 'failure',
      reason: failureReason(executionLog),
      ledger: prior,
    });
  }
  const findings = parsed.value;
  const reviewed = sha(findings.reviewedSha) ?? sha(headSha);
  const ledger = {
    lastReviewedSha: reviewed,
    lastBaseSha: sha(baseSha),
    linkTypesSeen: prior.linkTypesSeen,
    ledger: nextLedger(prior.ledger, findings.findings, idKey),
  };
  return renderSummary({
    state: { ...s, headSha: reviewed },
    findings: { ...findings, reviewedSha: reviewed },
    narrative: noModel ? '' : narrative,
    outcome: 'success',
    ledger,
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
