// Delivers security findings privately, as draft repository security advisories.
// Model-free; called by publish before the summary is rendered so the public
// pointer reflects whether delivery worked. The advisory token is used only for
// these requests and is never logged. Logs carry status codes and counts only.
import { ghRequest } from './lib/gh.mjs';
import { opaqueId, SEVERITIES } from './lib/ledger.mjs';
import { redact } from './lib/redact.mjs';
import { safeArea, safePackage } from './lib/findings.mjs';

const MAX_PAGES = 10;
const GHSA_RE = /^GHSA(-[0-9a-z]{4}){3}$/;
// Draft first: the only state an advisory may be PATCHed in.
const STATES = ['draft', 'published', 'closed', 'withdrawn'];
const DISPOSITIONED = new Set(['published', 'closed', 'withdrawn']);
const FOOTER_RE = /^(?:pr-review-id:|pull request:|also touched by\b)/i;

const idLine = (id) => `pr-review-id: ${id}`;
const lines = (text) => String(text ?? '').split('\n').map((l) => l.trim());

// Every advisory in each state, following the cursor `next` link (see gh.mjs)
// up to MAX_PAGES per state. Only links back to this repo's advisories path
// are followed. Each item is tagged with the state it was listed under.
async function listAll(repo, token, request) {
  const base = `/repos/${repo}/security-advisories`;
  const all = [];
  for (const state of STATES) {
    let path = `${base}?state=${state}&per_page=100`;
    for (let page = 0; path && page < MAX_PAGES; page++) {
      const items = await request('GET', path, undefined, token);
      if (!Array.isArray(items)) break;
      for (const a of items) if (a && typeof a === 'object') all.push({ ...a, state });
      const next = typeof items.next === 'string' ? items.next : null;
      path = items.length >= 100 && next?.startsWith(`${base}?`) ? next : null;
    }
  }
  return all;
}

// The code-written footer only: the last "Pull request: #N" + "pr-review-id: <id>"
// pair, followed by nothing but "Also touched by #N" notes. Model text can hold
// neither line (advisoryBody strips them), so an id quoted there never matches.
export function footerOf(description) {
  const ls = lines(description).filter(Boolean);
  const prs = new Set();
  let i = ls.length - 1;
  for (let m; i >= 0 && (m = /^Also touched by #(\d+)$/.exec(ls[i])); i--) prs.add(Number(m[1]));
  const id = /^pr-review-id: ([0-9a-f]{16})$/.exec(ls[i] ?? '');
  const pr = /^Pull request: #(\d+)$/.exec(ls[i - 1] ?? '');
  if (!id || !pr) return { id: null, prs: new Set() };
  prs.add(Number(pr[1]));
  return { id: id[1], prs };
}

// Model text minus any line that could pose as footer.
const scrub = (t) => String(t ?? '').split('\n').filter((l) => !FOOTER_RE.test(l.trim())).join('\n');

function where(l) {
  return `- ${scrub(l.file)}${l.line > 0 ? `:${l.line}` : ''} (${l.side})`;
}

// Private detail (still redacted: no secret value lands even in a draft advisory).
export function advisoryBody(f, pr, id) {
  const body = [
    'Reported by the pr-review agent. Private draft: do not copy into public channels.',
    `Title: ${scrub(f.title)}`,
    `Class: ${f.class}`,
    `Severity: ${f.severity} (confidence: ${f.confidence})`,
    `Package / area: ${scrub(f.package)} ${scrub(f.area)}`,
    `Feature at risk: ${scrub(f.feature)}`,
    ['Locations:', ...f.locations.map(where)].join('\n'),
    `Why: ${scrub(f.why)}`,
    `Fix: ${scrub(f.fix)}`,
  ].join('\n\n');
  return `${redact(body)}\n\n${[`Pull request: #${pr}`, idLine(id)].join('\n')}`;
}

function createBody(f, pr, id) {
  const severity = SEVERITIES.includes(f.severity) ? f.severity : 'High';
  const pkg = safePackage(f.package) ?? 'unknown';
  return {
    summary: `[pr-review] ${pkg} ${safeArea(f.area)} (${severity})`,
    description: advisoryBody(f, pr, id),
    severity: severity.toLowerCase(),
    vulnerabilities: [{ package: { ecosystem: 'other', name: `recovery-platform/${pkg}` } }],
  };
}

// priorIds: open security ledger ids from earlier runs. Those whose advisory
// was published, closed or withdrawn come back as resolvedIds (dispositioned).
export async function deliverAdvisories(repo, pr, securityFindings, token, request = ghRequest, key = process.env.PR_REVIEW_ID_KEY || null, priorIds = []) {
  const findings = Array.isArray(securityFindings) ? securityFindings : [];
  const prior = Array.isArray(priorIds) ? priorIds : [];
  if (!findings.length && !prior.length) return { delivered: true, resolvedIds: [] };
  if (!token) return { delivered: false, reason: 'no-token' };
  // An unkeyed id would break repo-wide dedupe and the public/private id link.
  if (!key) return { delivered: false, reason: 'no-key' };
  let created = 0;
  let updated = 0;
  let resolvedIds;
  try {
    const known = (await listAll(repo, token, request)).map((a) => ({ ...a, footer: footerOf(a.description) }));
    const wanted = new Set(prior);
    resolvedIds = [...new Set(known.filter((a) => DISPOSITIONED.has(a.state) && wanted.has(a.footer.id)).map((a) => a.footer.id))];
    const done = new Set();
    for (const f of findings) {
      const id = opaqueId(f.slug, key);
      if (done.has(id)) continue;
      done.add(id);
      const existing = known.find((a) => a.footer.id === id);
      if (!existing) {
        const res = await request('POST', `/repos/${repo}/security-advisories`, createBody(f, pr, id), token);
        known.push({ ...(res ?? {}), state: 'draft', footer: { id, prs: new Set([Number(pr)]) } });
        created++;
      } else if (existing.state === 'draft' && !existing.footer.prs.has(Number(pr))) {
        if (!GHSA_RE.test(String(existing.ghsa_id))) throw Object.assign(new Error('bad advisory id'), { status: 'bad-id' });
        const description = `${existing.description}\n\nAlso touched by #${pr}`;
        await request('PATCH', `/repos/${repo}/security-advisories/${existing.ghsa_id}`, { description }, token);
        existing.footer.prs.add(Number(pr));
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
  return { delivered: true, resolvedIds };
}
