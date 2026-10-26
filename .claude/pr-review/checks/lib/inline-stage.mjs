// Publish's inline stage: post the survivors of OUT/inline.json (completed
// reviews only), then run the post-hoc guard over this run's github-actions[bot]
// review comments (whatever the outcome). Returns the posted slugs and any
// fixed notices for the summary. Logs status codes and counts only.
import { mentions } from './needles.mjs';
import { sanitizeLedger } from './ledger.mjs';
import { BOT_AUTHOR, extractInlineSlugs } from './markers.mjs';
import { candidatePaths, isPriorSecurityPath, priorFileIds, runNeedles } from './fileids.mjs';
import { guardInlineComments } from './inline-guard.mjs';
import { parseInline, postInlineReview, selectInline } from './inline-post.mjs';

export const INLINE_NOTICE = '> an inline comment could not be removed automatically; please review';
export const INLINE_POST_NOTICE = '> some inline comments could not be posted';

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const status = (err) => (Number.isInteger(err?.status) ? err.status : 'unknown');
const strings = (l) => (Array.isArray(l) ? l.filter((s) => typeof s === 'string') : []);

// Current security findings' files, plus any path (or path-like token of a
// body) hashing to a prior security fileId (keyed only).
function securityPathTest(findings, snapshot, key) {
  const ids = priorFileIds(sanitizeLedger(isObject(snapshot) ? snapshot.ledger : [], key));
  const needles = runNeedles(findings, [], ids, key);
  const namesPrior = (t) => candidatePaths([], [t]).some((p) => isPriorSecurityPath(p, ids, key));
  return (t) => mentions(t, needles) || isPriorSecurityPath(t, ids, key) || namesPrior(t);
}

async function list(deps, repo, pr) {
  try {
    return await deps.listReviewComments(repo, pr);
  } catch (err) {
    console.log(`inline: listing failed: ${status(err)}`);
    return null;
  }
}

// findings: this run's validated findings, or null when the review did not complete.
export async function runInline({ repo, pr, snapshot, findings, inlineText, idKey, headSha, runStartedAt }, deps) {
  const posted = new Set();
  if (!deps.listReviewComments) return { posted, notices: [] };
  const notices = [];
  const key = idKey || null;
  const isSecurityPath = securityPathTest(findings ?? [], snapshot, key);
  const before = findings ? await list(deps, repo, pr) : null;
  if (findings && before) {
    const ours = before.filter((c) => c?.user?.login === BOT_AUTHOR).map((c) => c.body);
    const comments = selectInline({
      entries: parseInline(inlineText),
      findings,
      changedFiles: strings(snapshot?.changedFiles),
      postedSlugs: extractInlineSlugs(ours),
      isSecurityPath,
    });
    const res = await postInlineReview({ repo, pr, headSha, comments, request: deps.request });
    for (const s of res.posted) posted.add(s);
    if (res.failed) notices.push(INLINE_POST_NOTICE);
    console.log(`inline post: posted ${res.posted.length}, failed ${res.failed}`);
  } else if (findings && parseInline(inlineText).length) {
    notices.push(INLINE_POST_NOTICE);
  }
  const after = await list(deps, repo, pr);
  if (!after) return { posted, notices: [...notices, INLINE_NOTICE] };
  // The workflow's run start (captured before the review step), else facts'.
  const start = runStartedAt || (isObject(snapshot) ? snapshot.runStartedAt : null);
  const res = await guardInlineComments({ repo, comments: after, findings: findings ?? [], headSha, runStartedAt: start, isSecurityPath, request: deps.request });
  console.log(`inline guard: removed ${res.removed}, failed ${res.failed}`);
  return { posted, notices: res.failed ? [...notices, INLINE_NOTICE] : notices };
}
