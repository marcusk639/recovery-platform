import { SUMMARY_MARKER, decodeLedger, extractInlineSlugs } from './markers.mjs';

const SUMMARY_AUTHOR = 'github-actions[bot]';
const INLINE_AUTHOR = 'claude[bot]';
const SHA_RE = /^[0-9a-f]{40}$/;

const EMPTY = () => ({ lastReviewedSha: null, lastBaseSha: null, ledger: [], linkTypesSeen: [], inlineSlugs: [] });
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

// The prior ledger passes through in shape; publish re-sanitizes it with the key.
export async function loadState(repo, pr, { listIssueComments, listReviewComments }) {
  const state = EMPTY();
  try {
    const comments = await listIssueComments(repo, pr);
    const summary = comments.find(
      (c) => c.user?.login === SUMMARY_AUTHOR && typeof c.body === 'string' && c.body.startsWith(SUMMARY_MARKER),
    );
    if (summary) Object.assign(state, fromPayload(decodeLedger(summary.body)));
  } catch {
    // keep defaults
  }
  try {
    const reviews = await listReviewComments(repo, pr);
    state.inlineSlugs = extractInlineSlugs(reviews.filter((c) => c.user?.login === INLINE_AUTHOR).map((c) => c.body));
  } catch {
    // keep defaults
  }
  return state;
}
