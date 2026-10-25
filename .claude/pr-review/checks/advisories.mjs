// Delivers security findings privately, as draft repository security advisories.
// Model-free; called by publish before the summary is rendered so the public
// pointer reflects whether delivery worked. The advisory token is used only for
// these requests and is never logged. Logs carry status codes and counts only.
import { ghRequest } from './lib/gh.mjs';
import { opaqueId, SEVERITIES } from './lib/ledger.mjs';
import { redact } from './lib/redact.mjs';

const MAX_PAGES = 10;
const GHSA_RE = /^GHSA(-[0-9a-z]{4}){3}$/;

const idLine = (id) => `pr-review-id: ${id}`;
const lines = (text) => String(text ?? '').split('\n').map((l) => l.trim());

// All draft advisories, following the cursor `next` link (see gh.mjs) up to
// MAX_PAGES. Only links back to this repo's advisories path are followed.
async function listDrafts(repo, token, request) {
  const base = `/repos/${repo}/security-advisories`;
  const all = [];
  let path = `${base}?state=draft&per_page=100`;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const items = await request('GET', path, undefined, token);
    if (!Array.isArray(items)) break;
    all.push(...items);
    const next = typeof items.next === 'string' ? items.next : null;
    path = items.length >= 100 && next?.startsWith(`${base}?`) ? next : null;
  }
  return all;
}

function where(l) {
  return `- ${l.file}${l.line > 0 ? `:${l.line}` : ''} (${l.side})`;
}

// Private detail (still redacted: no secret value lands even in a draft advisory).
export function advisoryBody(f, pr, id) {
  return redact(
    [
      'Reported by the pr-review agent. Private draft: do not copy into public channels.',
      `Title: ${f.title}`,
      `Class: ${f.class}`,
      `Severity: ${f.severity} (confidence: ${f.confidence})`,
      `Package / area: ${f.package} ${f.area}`,
      `Feature at risk: ${f.feature}`,
      ['Locations:', ...f.locations.map(where)].join('\n'),
      `Why: ${f.why}`,
      `Fix: ${f.fix}`,
      [`Pull request: #${pr}`, idLine(id)].join('\n'),
    ].join('\n\n'),
  );
}

function createBody(f, pr, id) {
  const severity = SEVERITIES.includes(f.severity) ? f.severity : 'High';
  return {
    summary: redact(`[pr-review] ${f.package} ${f.area} (${severity})`),
    description: advisoryBody(f, pr, id),
    severity: severity.toLowerCase(),
    vulnerabilities: [{ package: { ecosystem: 'other', name: redact(`recovery-platform/${f.package}`) } }],
  };
}

// True when this PR is already recorded on the advisory (as origin or as a note).
function mentionsPr(description, pr) {
  const own = new Set([`Pull request: #${pr}`, `Also touched by #${pr}`]);
  return lines(description).some((l) => own.has(l));
}

export async function deliverAdvisories(repo, pr, securityFindings, token, request = ghRequest, key = process.env.PR_REVIEW_ID_KEY || null) {
  const findings = Array.isArray(securityFindings) ? securityFindings : [];
  if (!findings.length) return { delivered: true };
  if (!token) return { delivered: false, reason: 'no-token' };
  // An unkeyed id would break repo-wide dedupe and the public/private id link.
  if (!key) return { delivered: false, reason: 'no-key' };
  let created = 0;
  let updated = 0;
  try {
    const drafts = await listDrafts(repo, token, request);
    const done = new Set();
    for (const f of findings) {
      const id = opaqueId(f.slug, key);
      if (done.has(id)) continue;
      done.add(id);
      const existing = drafts.find((a) => lines(a?.description).includes(idLine(id)));
      if (!existing) {
        const res = await request('POST', `/repos/${repo}/security-advisories`, createBody(f, pr, id), token);
        drafts.push(res ?? {});
        created++;
      } else if (!mentionsPr(existing.description, pr)) {
        if (!GHSA_RE.test(String(existing.ghsa_id))) throw Object.assign(new Error('bad advisory id'), { status: 'bad-id' });
        const description = `${existing.description}\n\nAlso touched by #${pr}`;
        await request('PATCH', `/repos/${repo}/security-advisories/${existing.ghsa_id}`, { description }, token);
        existing.description = description;
        updated++;
      }
    }
  } catch (err) {
    // Status only: never the token, path, body or message.
    const status = Number.isInteger(err?.status) || err?.status === 'bad-id' ? err.status : 'unknown';
    console.log(`advisories failed: ${status}`);
    return { delivered: false, reason: 'api-error' };
  }
  console.log(`advisories: created ${created}, updated ${updated}`);
  return { delivered: true };
}
