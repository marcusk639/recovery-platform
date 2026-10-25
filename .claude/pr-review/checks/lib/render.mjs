// Renders the one public summary comment. Everything model-written passes
// through redact() and loses any HTML-comment syntax, so it can neither leak a
// secret nor plant a fake marker ahead of the real ledger marker.
import { SUMMARY_MARKER, encodeLedger } from './markers.mjs';
import { redact } from './redact.mjs';
import { SEVERITIES, fitMarker, visibleEntries } from './ledger.mjs';
import { validateFindings, securityPointer } from './findings.mjs';
import { securityNeedles, mentions, touchesSecurityFile } from './needles.mjs';

export { validateFindings, securityPointer };

export const MAX_BODY = 60000;
const MAX_MARKER = 30000;
const MAX_FIELD = 1500;
const TRUNC = '(truncated)';
const WITHHELD = '(some narrative withheld: security)';
const MAX_SECTION = 50;

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

export const WITHHELD_TITLE = '(withheld: touches a security-relevant file)';

function renderFinding(f, needles, isNew) {
  const fresh = isNew ? ' (new)' : '';
  if (f.security) return `- ${redact(securityPointer(f))}${fresh}`;
  if (touchesSecurityFile(f, needles)) return `- **${WITHHELD_TITLE}** (confidence: ${f.confidence})${fresh}`;
  return [
    `- **${clean(f.title, 200)}** (confidence: ${f.confidence})${fresh}${f.inlinePosted ? ' (inline comment posted)' : ''}`,
    `  - Where: ${f.locations.map(where).join('; ')}`,
    `  - Why: ${clean(f.why)}`,
    `  - Fix: ${clean(f.fix)}`,
    `  - Feature at risk: ${clean(f.feature, 200)}`,
  ].join('\n');
}

function renderPriorEntry(e) {
  if (e.security) return `- Security-relevant issue (${e.severity}) reported earlier; details sent privately`;
  if (e.withheld) return `- **${WITHHELD_TITLE}** (${e.severity}, from an earlier review)`;
  return `- **${clean(e.title || e.slug, 200)}** (${e.severity}, from an earlier review)`;
}

function capped(lines, what) {
  const extra = lines.length - MAX_SECTION;
  return extra > 0 ? [...lines.slice(0, MAX_SECTION), `- ${TRUNC} ${extra} more ${what} not shown`] : lines;
}

// Ledger entries only: security and withheld ones are counted, never named.
function renderResolved(entries) {
  if (!entries.length) return '';
  const hidden = entries.filter((e) => e.security || e.withheld).length;
  const named = entries
    .filter((e) => !e.security && !e.withheld)
    .map((e) => {
      const when = e.runsSinceResolved === 0 ? 'this review' : `${e.runsSinceResolved} review(s) ago`;
      return `- **${clean(e.title || e.slug, 200)}** (${e.severity}, resolved ${when})`;
    });
  const lines = capped(named, 'resolved finding(s)');
  if (hidden) lines.push(`- ${hidden} security-relevant or withheld finding(s) resolved; details not shown`);
  return ['### Resolved since last review', lines.join('\n')].join('\n\n');
}

function renderCarried(entries) {
  if (!entries.length) return '';
  return ['### Still open from earlier reviews', capped(entries.map(renderPriorEntry), 'open finding(s)').join('\n')].join('\n\n');
}

// Drops every narrative line naming a security finding's file, then redacts.
export function withholdNarrative(narrative, findings, needles = securityNeedles(findings)) {
  const lines = String(narrative ?? '').split('\n');
  const kept = lines.filter((line) => !mentions(line, needles));
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

function build(head, groups, dropped, narrative, extra) {
  const out = [head];
  for (const s of SEVERITIES) {
    if (!groups[s].length && !dropped[s]) continue;
    out.push(`### ${s}`, groups[s].join('\n'));
    if (dropped[s]) out.push(`- ${TRUNC} ${dropped[s]} more ${s} finding(s) not shown`);
  }
  out.push(...extra);
  if (narrative) out.push(narrative);
  return out.filter((x) => x !== '').join('\n\n');
}

// Truncates narrative first, then Low, then Medium findings; hard-cuts last.
function assemble(head, groups, narrative, markerText, extra = []) {
  const room = MAX_BODY - markerText.length - 2;
  const g = { ...groups, Low: [...groups.Low], Medium: [...groups.Medium] };
  const dropped = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  let narr = narrative;
  let text = build(head, g, dropped, narr, extra);
  if (text.length > room && narr) {
    const budget = room - build(head, g, dropped, '', extra).length - TRUNC.length - 4;
    narr = budget > 200 ? `${narr.slice(0, budget)}\n${TRUNC}` : TRUNC;
    text = build(head, g, dropped, narr, extra);
  }
  for (const sev of ['Low', 'Medium']) {
    while (text.length > room && g[sev].length) {
      g[sev].pop();
      dropped[sev]++;
      text = build(head, g, dropped, narr, extra);
    }
  }
  if (text.length > room) text = `${text.slice(0, room - TRUNC.length - 2)}\n${TRUNC}`;
  // Whole-body pass; redaction only ever shortens text, so the cap still holds.
  return `${redact(text)}\n\n${markerText}`;
}

const ADVISORY = '_Advisory only: not a required check. Security-relevant findings show only a pointer here._';

// Failure keeps the last completed review's open findings; tier "none" (no
// model run, outcome "none") also lists what that review resolved.
function renderPrior(ledger, markerText, banner, withResolved) {
  const visible = visibleEntries(ledger.ledger ?? []);
  const open = visible.filter((e) => e.status === 'open');
  const head = [
    SUMMARY_MARKER,
    '## PR review (advisory)',
    banner,
    open.length ? 'Open findings from the last completed review:' : 'No open findings were recorded by an earlier completed review.',
  ].join('\n\n');
  const extra = withResolved ? [renderResolved(visible.filter((e) => e.status === 'resolved'))] : [];
  return assemble(head, groupBySeverity(open, renderPriorEntry), '', markerText, extra);
}

export function renderSummary({ state, findings, narrative, outcome, ledger, reason = 'failed', needles, note = '', newSlugs = new Set(), carried = [], resolved = [] }) {
  const payload = fitMarker(ledger, encodeLedger, MAX_MARKER);
  const markerText = encodeLedger(payload);
  if (outcome === 'none') return renderPrior(ledger, markerText, `${clean(note, 200)}\n\n${ADVISORY}`, true);
  const ok = outcome === 'success' && findings && Array.isArray(findings.findings);
  if (!ok) return renderPrior(ledger, markerText, `> ⚠ review did not complete (${reason}) — will retry on next push`, false);
  const list = findings.findings;
  const sha = String(findings.reviewedSha || state?.headSha || '').slice(0, 7);
  const head = [
    SUMMARY_MARKER,
    '## PR review (advisory)',
    `Reviewed commit \`${clean(sha, 7)}\`. ${countsHeadline(list)}`,
    ADVISORY,
  ].join('\n\n');
  const n = needles ?? securityNeedles(list);
  const groups = groupBySeverity(list, (f) => renderFinding(f, n, newSlugs.has(f.slug)));
  const extra = [renderCarried(carried), renderResolved(resolved)];
  return assemble(head, groups, withholdNarrative(narrative, list, n), markerText, extra);
}
