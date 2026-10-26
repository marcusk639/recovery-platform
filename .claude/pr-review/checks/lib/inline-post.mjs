// Inline comments, posted by publish (the model has no inline tool). The model
// writes OUT/inline.json: [{slug, path, line, side: "RIGHT"|"LEFT", body}].
// Publish keeps an entry only when its slug is a non-security Critical/High
// finding in findings.json, its path is one of the PR's changed files (facts'
// trusted list), the slug has no fp comment yet, and the guard's predicate
// passes on the exact body to be posted. It appends the fp marker itself.
import { ghRequest } from './gh.mjs';
import { redact } from './redact.mjs';
import { fpMarker } from './markers.mjs';
import { securitySlugsOf, unsafeInline } from './inline-guard.mjs';

export const MAX_INLINE = 10;
const MAX_BODY = 4000;
const MAX_PATH = 300;
const SIDES = new Set(['RIGHT', 'LEFT']);
const SLUG_RE = /^c([1-9]|1[0-4]):[^\s>]+:[^\s>]+$/;
const INLINE_SEVERITIES = new Set(['Critical', 'High']);
const REVIEW_BODY = 'pr-review (advisory): inline comments for this commit. The summary comment has the full review.';

const isStr = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

function valid(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  if (!isStr(e.slug, 300) || !SLUG_RE.test(e.slug) || !isStr(e.path, MAX_PATH)) return false;
  return Number.isInteger(e.line) && e.line > 0 && SIDES.has(e.side) && typeof e.body === 'string' && e.body.trim() !== '';
}

// Malformed file or entries are dropped, never fatal: at worst nothing is posted.
export function parseInline(text) {
  let v;
  try {
    v = JSON.parse(String(text ?? ''));
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_INLINE).filter(valid).map(({ slug, path, line, side, body }) => ({ slug, path, line, side, body }));
}

// HTML comments are neutralised so model text cannot plant another fp marker.
const neutralise = (s) => s.replace(/<!--/g, '&lt;!--').replace(/-->/g, '--&gt;');

export function selectInline({ entries, findings, changedFiles, postedSlugs, isSecurityPath = () => false }) {
  const bySlug = new Map((findings ?? []).map((f) => [f.slug, f]));
  const files = new Set(changedFiles ?? []);
  const seen = new Set(postedSlugs ?? []);
  const securitySlugs = securitySlugsOf(findings);
  const out = [];
  for (const e of entries ?? []) {
    const f = bySlug.get(e.slug);
    if (!f || f.security || !INLINE_SEVERITIES.has(f.severity)) continue;
    if (!files.has(e.path) || seen.has(e.slug)) continue;
    const body = `${neutralise(e.body.trim()).slice(0, MAX_BODY)}\n\n${fpMarker(e.slug)}`;
    const c = { slug: e.slug, path: e.path, line: e.line, side: e.side, body };
    if (unsafeInline(c, securitySlugs, isSecurityPath)) continue;
    seen.add(e.slug);
    out.push({ ...c, body: redact(body) });
    if (out.length >= MAX_INLINE) break;
  }
  return out;
}

const status = (err) => (Number.isInteger(err?.status) ? err.status : 'unknown');

// One COMMENT review on the head (GH_TOKEN, as github-actions[bot]). GitHub
// rejects the whole review when one line is outside the diff (422), so a
// failed batch is retried one comment per review.
export async function postInlineReview({ repo, pr, headSha, comments, request = ghRequest }) {
  if (!headSha || !comments?.length) return { posted: [], failed: 0 };
  const path = `/repos/${repo}/pulls/${pr}/reviews`;
  const payload = (cs) => ({ commit_id: headSha, event: 'COMMENT', body: REVIEW_BODY, comments: cs.map(({ path: p, line, side, body }) => ({ path: p, line, side, body })) });
  try {
    await request('POST', path, payload(comments));
    return { posted: comments.map((c) => c.slug), failed: 0 };
  } catch (err) {
    console.log(`inline post: review failed: ${status(err)}`);
  }
  const posted = [];
  let failed = 0;
  for (const c of comments) {
    try {
      await request('POST', path, payload([c]));
      posted.push(c.slug);
    } catch (err) {
      failed++;
      console.log(`inline post: comment failed: ${status(err)}`);
    }
  }
  return { posted, failed };
}
