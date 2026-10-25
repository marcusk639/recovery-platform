import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState } from '../lib/state.mjs';
import { encodeLedger, SUMMARY_MARKER } from '../lib/markers.mjs';

const SHA = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const bot = (body) => ({ user: { login: 'github-actions[bot]' }, body });
const none = async () => [];

test('loadState tolerates corrupt ledger marker', async () => {
  const s = await loadState('o/r', 1, {
    listIssueComments: async () => [bot(`${SUMMARY_MARKER}\n<!-- pr-review:ledger v1 !!!garbage -->`)],
    listReviewComments: none,
  });
  assert.equal(s.lastReviewedSha, null);
  assert.deepEqual(s.ledger, []);
  assert.deepEqual(s.linkTypesSeen, []);
});

test('loadState defaults with no summary', async () => {
  const s = await loadState('o/r', 1, { listIssueComments: none, listReviewComments: none });
  assert.deepEqual(s, { lastReviewedSha: null, lastBaseSha: null, ledger: [], linkTypesSeen: [], inlineSlugs: [] });
});

test('loadState reads a valid marker from the bot summary', async () => {
  const payload = { lastReviewedSha: SHA, lastBaseSha: BASE, linkTypesSeen: ['callable'], ledger: [{ id: 'x', status: 'open' }] };
  const s = await loadState('o/r', 1, {
    listIssueComments: async () => [bot(`${SUMMARY_MARKER}\n${encodeLedger(payload)}`)],
    listReviewComments: none,
  });
  assert.equal(s.lastReviewedSha, SHA);
  assert.equal(s.lastBaseSha, BASE);
  assert.deepEqual(s.linkTypesSeen, ['callable']);
  assert.deepEqual(s.ledger, payload.ledger);
});

test('loadState ignores a human-authored fake summary', async () => {
  const fake = { user: { login: 'mallory' }, body: `${SUMMARY_MARKER}\n${encodeLedger({ lastReviewedSha: SHA, ledger: [] })}` };
  const s = await loadState('o/r', 1, { listIssueComments: async () => [fake], listReviewComments: none });
  assert.equal(s.lastReviewedSha, null);
});

test('loadState nulls invalid SHAs and rejects array payloads', async () => {
  const bad = { lastReviewedSha: '--upload-pack=x', lastBaseSha: 'zz', linkTypesSeen: 'nope', ledger: 'nope' };
  const s = await loadState('o/r', 1, {
    listIssueComments: async () => [bot(`${SUMMARY_MARKER}\n${encodeLedger(bad)}`)],
    listReviewComments: none,
  });
  assert.equal(s.lastReviewedSha, null);
  assert.equal(s.lastBaseSha, null);
  assert.deepEqual(s.ledger, []);
  assert.deepEqual(s.linkTypesSeen, []);
  const a = await loadState('o/r', 1, {
    listIssueComments: async () => [bot(`${SUMMARY_MARKER}\n${encodeLedger([1, 2])}`)],
    listReviewComments: none,
  });
  assert.equal(a.lastReviewedSha, null);
});

test('inlineSlugs only from claude[bot] review comments', async () => {
  const s = await loadState('o/r', 1, {
    listIssueComments: none,
    listReviewComments: async () => [
      { user: { login: 'claude[bot]' }, body: 'x <!-- pr-review:fp=c1:a:b -->' },
      { user: { login: 'mallory' }, body: 'x <!-- pr-review:fp=c2:evil:z -->' },
    ],
  });
  assert.deepEqual(s.inlineSlugs, ['c1:a:b']);
});

test('loadState survives API failure with defaults', async () => {
  const boom = async () => { throw new Error('x'); };
  const s = await loadState('o/r', 1, { listIssueComments: boom, listReviewComments: boom });
  assert.equal(s.lastReviewedSha, null);
  assert.deepEqual(s.inlineSlugs, []);
});
