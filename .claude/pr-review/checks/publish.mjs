// Publishes the one summary comment from OUT/{state.json,findings.json,summary.md}.
// Runs from the base-SHA checkout after the model has finished, so nothing the
// model wrote can change this code. Logs status codes only, always exits 0.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

function str(v) {
  return typeof v === 'string' ? v : null;
}

export function composeBody({ state, findingsText, narrative, outcome, executionLog, headSha, baseSha }) {
  const s = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const prior = {
    lastReviewedSha: str(s.lastReviewedSha),
    lastBaseSha: str(s.lastBaseSha),
    linkTypesSeen: strings(s.linkTypesSeen),
    ledger: sanitizeLedger(s.ledger),
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
  const reviewed = SHA_RE.test(findings.reviewedSha) ? findings.reviewedSha : headSha;
  const ledger = {
    lastReviewedSha: reviewed ?? null,
    lastBaseSha: baseSha ?? null,
    linkTypesSeen: prior.linkTypesSeen,
    ledger: nextLedger(prior.ledger, findings.findings),
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

function readState(out) {
  try {
    return JSON.parse(readFileSync(join(out, 'state.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  try {
    const { REPO, PR, HEAD_SHA, BASE_SHA, ACTION_OUTCOME, EXECUTION_FILE, OUT } = process.env;
    const out = OUT || '.';
    const body = composeBody({
      state: readState(out),
      findingsText: readOptional(join(out, 'findings.json')),
      narrative: readOptional(join(out, 'summary.md')) ?? '',
      outcome: ACTION_OUTCOME,
      executionLog: EXECUTION_FILE ? readOptional(EXECUTION_FILE) : null,
      headSha: HEAD_SHA,
      baseSha: BASE_SHA,
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
