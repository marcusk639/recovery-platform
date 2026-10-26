// Round 4 (PR #119 follow-ups): a prior security file (known only by its keyed
// fileId) stays withheld when public text names it by an encoded form or by
// its basename alone; a partly failed inline post is announced; the job
// summary's status line names the tier; the model's prompt points at OUT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish } from '../publish.mjs';
import { opaqueId } from '../lib/ledger.mjs';
import { fileId } from '../lib/fileids.mjs';

const HEAD = 'c'.repeat(40);
const BASE = 'd'.repeat(40);
const OLD = 'e'.repeat(40);
const RUN = '2026-10-25T10:00:00Z';
const KEY = 'test-id-key';
const A = 'regroup/mobile/src/a.ts';
const B = 'regroup/mobile/src/b.ts';
const SEC_FILE = 'regroup/functions/src/callable/payments.ts';
const WORKFLOW = join(dirname(fileURLToPath(import.meta.url)), '../../../../.github/workflows/claude-code-review.yml');

const finding = (slug, over = {}) => ({
  slug, class: 9, severity: 'High', confidence: 'high', security: false, package: 'regroup/mobile', area: 'data',
  title: `Breaks ${slug}`, feature: 'Feed', locations: [{ file: A, line: 3, side: 'changed' }], why: 'w', fix: 'x', ...over,
});
const HIGH = finding(`c9:${A}:load`);
const HIGH_B = finding(`c9:${B}:save`, { locations: [{ file: B, line: 2, side: 'changed' }] });
const entry = (slug, over = {}) => ({ slug, path: A, line: 3, side: 'RIGHT', body: 'This breaks the feed.', ...over });
const priorSec = { id: opaqueId(`c1:${SEC_FILE}:charge`, KEY), severity: 'High', status: 'open', security: true, runsSinceResolved: 0, fileIds: [fileId(SEC_FILE, KEY)] };
const snap = (over = {}) => ({ lastReviewedSha: OLD, lastBaseSha: BASE, ledger: [priorSec], linkTypesSeen: [], runLinkTypes: [], inlineSlugs: [], tier: 'full', maxTurns: 60, headSha: HEAD, baseSha: BASE, pr: 7, changedFiles: [A, B, SEC_FILE], prDiffAvailable: true, ...over });

// Posted comments become visible to the later listing, as on GitHub.
async function run({ findings = [HIGH], inline = [entry(HIGH.slug)], narrative = '## Features touched\n- feed', snapshot = snap(), fail } = {}) {
  const live = [];
  const calls = [];
  const reports = [];
  let summary = null;
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    const code = fail?.(method, path, body);
    if (code) throw Object.assign(new Error('x'), { status: code });
    if (method === 'GET') return { head: { sha: HEAD } };
    for (const c of body?.comments ?? []) {
      live.push({ id: 100 + live.length, user: { login: 'github-actions[bot]' }, body: c.body, path: c.path, commit_id: HEAD, original_commit_id: HEAD, created_at: '2026-10-25T10:06:00Z' });
    }
    return null;
  };
  const deps = {
    listIssueComments: async () => [],
    upsertSummary: async (repo, pr, b) => { summary = b; },
    deliverAdvisories: async () => ({ delivered: true, resolvedIds: [] }),
    listReviewComments: async () => [...live],
    request,
    report: (line) => reports.push(line),
  };
  const findingsText = JSON.stringify({ reviewedSha: HEAD, findings, resolvedSlugs: [], complete: true });
  const orig = console.log;
  console.log = () => {};
  try {
    await publish({ repo: 'o/r', pr: 7, snapshot, findingsText, inlineText: JSON.stringify(inline), narrative, outcome: 'success', headSha: HEAD, baseSha: BASE, idKey: KEY, runStartedAt: RUN }, deps);
  } finally {
    console.log = orig;
  }
  return { summary, reports, posts: calls.filter((c) => c.method === 'POST') };
}

const ENCODED = {
  'percent-escaped slashes': 'regroup%2Ffunctions%2Fsrc%2Fcallable%2Fpayments.ts',
  'HTML-entity dots and slashes': 'regroup&#47;functions&#47;src&#47;callable&#47;payments&#46;ts',
  'zero-width characters': 'regroup/func​tions/src/callable/pay‍ments.ts',
  'the basename alone': 'payments.ts',
};

for (const [name, form] of Object.entries(ENCODED)) {
  test(`inline pre-filter: a body naming a prior security file by ${name} is never posted`, async () => {
    const { posts } = await run({ inline: [entry(HIGH.slug, { body: `Same bug as in ${form} here.` })] });
    assert.equal(posts.length, 0);
  });
}

test('control: an unrelated body still posts with a prior security entry in the ledger', async () => {
  const { posts } = await run();
  assert.equal(posts.length, 1);
});

test('summary: a narrative line naming a prior security file by its basename alone is withheld', async () => {
  const { summary } = await run({ inline: [], narrative: '## Checked and fine\n- payments.ts looks fine\n- feed ok' });
  assert.doesNotMatch(summary, /payments\.ts/);
  assert.match(summary, /feed ok/);
});

test('summary: a finding whose title names a prior security file by basename is withheld', async () => {
  const f = finding(`c9:${A}:pay`, { title: 'Calls payments.ts with the wrong shape' });
  const { summary } = await run({ findings: [f], inline: [] });
  assert.doesNotMatch(summary, /payments\.ts/);
});

test('a partly failed inline post (422, then one single post fails) is announced; only the posted one is marked', async () => {
  const fail = (m, p, b) => (m === 'POST' && (b.comments.length > 1 || b.comments[0].path === B) ? 422 : null);
  const { summary, posts } = await run({ findings: [HIGH, HIGH_B], inline: [entry(HIGH.slug), entry(HIGH_B.slug, { path: B })], fail });
  assert.equal(posts.length, 3, 'batch, then one per comment');
  assert.match(summary, /> some inline comments could not be posted/);
  assert.equal((summary.match(/\(inline comment posted\)/g) ?? []).length, 1);
});

test('the job-summary status line names the tier', async () => {
  const { reports } = await run({ snapshot: snap({ tier: 'incremental' }) });
  assert.equal(reports.length, 1);
  assert.match(reports[0], /tier incremental/);
});

test('the review prompt points the model at REVIEW.md and the same OUT the model may write', () => {
  const wf = readFileSync(WORKFLOW, 'utf8');
  const start = wf.indexOf('- name: Review');
  const step = wf.slice(start, wf.indexOf('- name:', start + 1));
  assert.match(step, /prompt: \|\n\s+Follow \.claude\/pr-review\/REVIEW\.md\. OUT=\$\{\{ runner\.temp \}\}\/pr-review\./);
  assert.match(step, /--add-dir \$\{\{ runner\.temp \}\}\/pr-review\n/);
  assert.match(step, /Write\(\/\$\{\{ runner\.temp \}\}\/pr-review\/\*\*\)/);
});
