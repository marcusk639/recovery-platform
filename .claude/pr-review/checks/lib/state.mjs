import { SUMMARY_MARKER, decodeLedger, extractInlineSlugs } from './markers.mjs';

const SUMMARY_AUTHOR = 'github-actions[bot]';
const INLINE_AUTHOR = 'claude[bot]';
const SHA_RE = /^[0-9a-f]{40}$/;

const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const FP_RE = /<!-- pr-review:fp=([^ >]+) -->/;
const MAX_ACK = 200;

const EMPTY = () => ({ lastReviewedSha: null, lastBaseSha: null, ledger: [], linkTypesSeen: [], inlineSlugs: [], acknowledgedSlugs: [] });
const sha = (v) => (typeof v === 'string' && SHA_RE.test(v) ? v : null);

function fromPayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  return {
    lastReviewedSha: sha(p.lastReviewedSha),
    lastBaseSha: sha(p.lastBaseSha),
    ledger: Array.isArray(p.ledger) ? p.ledger.filter((e) => e && typeof e === 'object' && !Array.isArray(e)) : [],
    linkTypesSeen: Array.isArray(p.linkTypesSeen) ? p.linkTypesSeen.filter((t) => typeof t === 'string') : [],
  };
}

// The one summary comment: posted by the workflow bot, first line the marker.
export function findSummary(comments) {
  return (comments ?? []).find(
    (c) => c?.user?.login === SUMMARY_AUTHOR && typeof c.body === 'string' && c.body.startsWith(SUMMARY_MARKER),
  );
}

// Slugs of claude[bot] inline comments a maintainer replied to in-thread: the
// finding is dispositioned (REVIEW.md: do not re-raise; publish resolves it).
export function acknowledgedSlugs(reviewComments) {
  const all = reviewComments ?? [];
  const replied = new Set(
    all.filter((c) => c?.user?.login !== INLINE_AUTHOR && TRUSTED.has(c?.author_association) && c.in_reply_to_id != null).map((c) => c.in_reply_to_id),
  );
  const out = [];
  for (const c of all) {
    const m = c?.user?.login === INLINE_AUTHOR && replied.has(c.id) ? FP_RE.exec(String(c.body ?? '')) : null;
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out.slice(0, MAX_ACK);
}

// The prior ledger passes through in shape; publish re-sanitizes it with the key.
export async function loadState(repo, pr, { listIssueComments, listReviewComments }) {
  const state = EMPTY();
  try {
    const comments = await listIssueComments(repo, pr);
    const summary = findSummary(comments);
    if (summary) Object.assign(state, fromPayload(decodeLedger(summary.body)));
  } catch {
    // keep defaults
  }
  try {
    const reviews = await listReviewComments(repo, pr);
    state.inlineSlugs = extractInlineSlugs(reviews.filter((c) => c.user?.login === INLINE_AUTHOR).map((c) => c.body));
    state.acknowledgedSlugs = acknowledgedSlugs(reviews);
  } catch {
    // keep defaults
  }
  return state;
}
