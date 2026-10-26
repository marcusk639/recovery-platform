// Technical guard for the model's inline comments (REVIEW.md rules are only
// instructions). This run's top-level claude[bot] review comments are deleted
// when they carry a security fingerprint (by findings.json or by checklist
// class), carry no fingerprint at all, match a secret pattern, or sit on / name
// a security file. Logs counts only; never a path, body or id.
import { ghRequest } from './gh.mjs';
import { SECRET_PATTERNS } from './redact.mjs';
import { isForcedSecurity } from './findings.mjs';

const INLINE_AUTHOR = 'claude[bot]';
const FP_RE = /<!-- pr-review:fp=([^ >]+) -->/;

// "This run" needs both: created at or after the run start (captured before
// the review step) AND first posted on this head. GitHub moves an older
// comment's commit_id to the new head when its line is unchanged, so only
// original_commit_id counts. Replies (in_reply_to_id) are never ours: the
// review model's tool posts top-level comments only, while the same app's
// @claude workflow replies in threads without a fingerprint.
function thisRun(c, headSha, runStartedAt) {
  if (c?.user?.login !== INLINE_AUTHOR || c.in_reply_to_id != null) return false;
  if (!headSha || c.original_commit_id !== headSha) return false;
  const start = Date.parse(runStartedAt ?? '');
  const created = Date.parse(c.created_at ?? '');
  return Number.isFinite(start) && Number.isFinite(created) && created >= start;
}

function mustDelete(c, securitySlugs, isSecurityPath) {
  const body = String(c.body ?? '');
  const m = FP_RE.exec(body);
  if (!m) return true;
  const slug = m[1];
  if (securitySlugs.has(slug) || isForcedSecurity(undefined, slug)) return true;
  if (SECRET_PATTERNS.some((re) => new RegExp(re.source).test(body))) return true;
  return Boolean(isSecurityPath(String(c.path ?? '')) || isSecurityPath(String(slug.split(':')[1] ?? '')) || isSecurityPath(body));
}

export async function guardInlineComments({ repo, comments, findings = [], headSha, runStartedAt, isSecurityPath = () => false, request = ghRequest }) {
  const securitySlugs = new Set((findings ?? []).filter((f) => f?.security).map((f) => f.slug));
  let removed = 0;
  let failed = 0;
  for (const c of comments ?? []) {
    if (!thisRun(c, headSha, runStartedAt) || !mustDelete(c, securitySlugs, isSecurityPath)) continue;
    if (!Number.isInteger(c.id)) {
      failed++;
      continue;
    }
    try {
      await request('DELETE', `/repos/${repo}/pulls/comments/${c.id}`);
      removed++;
    } catch (err) {
      failed++;
      console.log(`inline guard: delete failed: ${Number.isInteger(err?.status) ? err.status : 'unknown'}`);
    }
  }
  return { removed, failed };
}
