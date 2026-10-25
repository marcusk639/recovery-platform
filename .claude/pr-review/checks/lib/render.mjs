// Renders the one public summary comment. Everything model-written passes
// through redact() and loses any HTML-comment syntax, so it can neither leak a
// secret nor plant a fake marker ahead of the real ledger marker.
import { SUMMARY_MARKER, encodeLedger } from './markers.mjs';
import { redact } from './redact.mjs';
import { SEVERITIES, fitMarker } from './ledger.mjs';
import { validateFindings, securityPointer } from './findings.mjs';

export { validateFindings, securityPointer };

export const MAX_BODY = 60000;
const MAX_MARKER = 30000;
const MAX_FIELD = 1500;
const TRUNC = '(truncated)';
const WITHHELD = '(some narrative withheld: security)';

function neutralise(s) {
  return s.replace(/<!--/g, '&lt;!--').replace(/-->/g, '--&gt;');
}

function clean(text, max = MAX_FIELD) {
  const s = neutralise(redact(String(text ?? '')).replace(/\s+/g, ' ').trim());
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function where(l) {
  const file = String(l.file).replace(/`/g, '');
  return `\`${clean(file, 300)}${l.line > 0 ? `:${l.line}` : ''}\` (${l.side})`;
}

function renderFinding(f) {
  if (f.security) return `- ${redact(securityPointer(f))}`;
  return [
    `- **${clean(f.title, 200)}** (confidence: ${f.confidence})${f.inlinePosted ? ' (inline comment posted)' : ''}`,
    `  - Where: ${f.locations.map(where).join('; ')}`,
    `  - Why: ${clean(f.why)}`,
    `  - Fix: ${clean(f.fix)}`,
    `  - Feature at risk: ${clean(f.feature, 200)}`,
  ].join('\n');
}

function renderPriorEntry(e) {
  if (e.security) return `- Security-relevant issue (${e.severity}) reported earlier; details sent privately`;
  return `- **${clean(e.title || e.slug, 200)}** (${e.severity}, from an earlier review)`;
}

function securityNeedles(findings) {
  const out = new Set();
  for (const f of findings.filter((x) => x.security)) {
    for (const l of f.locations) {
      const file = String(l.file);
      out.add(file);
      const base = file.split('/').pop();
      if (base) out.add(base);
    }
  }
  return [...out].filter(Boolean);
}

// Drops every narrative line naming a security finding's file, then redacts.
export function withholdNarrative(narrative, findings) {
  const needles = securityNeedles(findings);
  const lines = String(narrative ?? '').split('\n');
  const kept = lines.filter((line) => !needles.some((n) => line.includes(n)));
  let text = kept.join('\n').trim();
  if (kept.length < lines.length) text = `${text}\n\n${WITHHELD}`.trim();
  return neutralise(redact(text));
}

function countsHeadline(findings) {
  const parts = SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`);
  return parts.length ? `${parts.join(', ')}.` : 'No issues found.';
}

function groupBySeverity(items, render) {
  return Object.fromEntries(SEVERITIES.map((s) => [s, items.filter((i) => i.severity === s).map(render)]));
}

function build(head, groups, dropped, narrative) {
  const out = [head];
  for (const s of SEVERITIES) {
    if (!groups[s].length && !dropped[s]) continue;
    out.push(`### ${s}`, groups[s].join('\n'));
    if (dropped[s]) out.push(`- ${TRUNC} ${dropped[s]} more ${s} finding(s) not shown`);
  }
  if (narrative) out.push(narrative);
  return out.filter((x) => x !== '').join('\n\n');
}

// Truncates narrative first, then Low, then Medium findings; hard-cuts last.
function assemble(head, groups, narrative, markerText) {
  const room = MAX_BODY - markerText.length - 2;
  const g = { ...groups, Low: [...groups.Low], Medium: [...groups.Medium] };
  const dropped = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  let narr = narrative;
  let text = build(head, g, dropped, narr);
  if (text.length > room && narr) {
    const budget = room - build(head, g, dropped, '').length - TRUNC.length - 4;
    narr = budget > 200 ? `${narr.slice(0, budget)}\n${TRUNC}` : TRUNC;
    text = build(head, g, dropped, narr);
  }
  for (const sev of ['Low', 'Medium']) {
    while (text.length > room && g[sev].length) {
      g[sev].pop();
      dropped[sev]++;
      text = build(head, g, dropped, narr);
    }
  }
  if (text.length > room) text = `${text.slice(0, room - TRUNC.length - 2)}\n${TRUNC}`;
  // Whole-body pass; redaction only ever shortens text, so the cap still holds.
  return `${redact(text)}\n\n${markerText}`;
}

export function renderSummary({ state, findings, narrative, outcome, ledger, reason = 'failed' }) {
  const payload = fitMarker(ledger, encodeLedger, MAX_MARKER);
  const markerText = encodeLedger(payload);
  const ok = outcome === 'success' && findings && Array.isArray(findings.findings);
  if (!ok) {
    const open = (ledger.ledger ?? []).filter((e) => e.status === 'open');
    const head = [
      SUMMARY_MARKER,
      '## PR review (advisory)',
      `> ⚠ review did not complete (${reason}) — will retry on next push`,
      open.length
        ? 'Open findings from the last completed review:'
        : 'No open findings were recorded by an earlier completed review.',
    ].join('\n\n');
    return assemble(head, groupBySeverity(open, renderPriorEntry), '', markerText);
  }
  const list = findings.findings;
  const sha = String(findings.reviewedSha || state?.headSha || '').slice(0, 7);
  const head = [
    SUMMARY_MARKER,
    '## PR review (advisory)',
    `Reviewed commit \`${clean(sha, 7)}\`. ${countsHeadline(list)}`,
    '_Advisory only: not a required check. Security-relevant findings show only a pointer here._',
  ].join('\n\n');
  return assemble(head, groupBySeverity(list, renderFinding), withholdNarrative(narrative, list), markerText);
}
