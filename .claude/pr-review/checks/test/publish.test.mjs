import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeBody, failureReason } from '../publish.mjs';
import { decodeLedger } from '../lib/markers.mjs';
import { opaqueId } from '../lib/ledger.mjs';

// Built at runtime so this source holds no secret-shaped literal.
const FAKE_WHSEC = 'whsec' + '_' + 'A'.repeat(16);
const HEAD = 'c'.repeat(40);
const BASE = 'd'.repeat(40);
const SEC_FILE = 'regroup/functions/src/callable/payments.ts';

const L = [
  { id: opaqueId('c9:a.ts:x'), slug: 'c9:a.ts:x', title: 'Swallowed error', severity: 'Medium', status: 'open', security: false, runsSinceResolved: 0 },
  { id: opaqueId('c1:b.ts:y'), severity: 'High', status: 'open', security: true, runsSinceResolved: 0 },
];

function state(over = {}) {
  return {
    lastReviewedSha: 'old',
    lastBaseSha: 'oldbase',
    ledger: L,
    linkTypesSeen: ['callable'],
    inlineSlugs: [],
    tier: 'full',
    maxTurns: 60,
    headSha: HEAD,
    baseSha: BASE,
    pr: 7,
    ...over,
  };
}

const secFinding = {
  slug: `c1:${SEC_FILE}:createCharge`,
  class: 1,
  severity: 'High',
  confidence: 'high',
  security: true,
  package: 'regroup/functions',
  area: 'payments',
  title: 'Trusted client account',
  feature: 'Rent payment',
  locations: [{ file: SEC_FILE, line: 30, side: 'changed' }],
  why: 'trusts input',
  fix: 'derive server-side',
  inlinePosted: false,
};

function findingsText(findings) {
  return JSON.stringify({ reviewedSha: HEAD, findings, resolvedSlugs: [] });
}

test('publish redacts secrets and withholds security paths', () => {
  const narrative = [
    '## Features touched',
    `- Webhook config uses ${FAKE_WHSEC} in the sample`,
    `- Changed ${SEC_FILE} for rent payments`,
    '- Also touched payments.ts helper',
    '## Checked and fine',
    '- callable names match',
  ].join('\n');
  const body = composeBody({ state: state(), findingsText: findingsText([secFinding]), narrative, outcome: 'success', headSha: HEAD, baseSha: BASE });
  assert.ok(body.includes('whsec_…'));
  assert.ok(!body.includes(FAKE_WHSEC));
  assert.ok(!body.includes(SEC_FILE));
  assert.ok(!body.includes('payments.ts'));
  assert.ok(body.includes('narrative withheld'));
  assert.ok(body.includes('callable names match'));
});

test('publish keeps prior state when findings.json is invalid', () => {
  const text = findingsText([secFinding]).slice(0, 60);
  const body = composeBody({ state: state(), findingsText: text, narrative: '', outcome: 'success', headSha: HEAD, baseSha: BASE });
  assert.ok(body.includes('review did not complete (failed)'));
  const m = decodeLedger(body);
  assert.deepEqual(m.ledger, L);
  assert.equal(m.lastReviewedSha, 'old');
  assert.equal(m.lastBaseSha, 'oldbase');
  assert.deepEqual(m.linkTypesSeen, ['callable']);
  assert.ok(body.includes('Swallowed error'));
  assert.ok(body.includes('Security-relevant issue (High)'));
  assert.doesNotMatch(body, /No issues found/);
});

test('failed action keeps prior state even with valid findings', () => {
  const body = composeBody({ state: state(), findingsText: findingsText([]), narrative: '', outcome: 'failure', headSha: HEAD, baseSha: BASE });
  assert.ok(body.includes('review did not complete (failed)'));
  assert.equal(decodeLedger(body).lastReviewedSha, 'old');
});

test('rate limit in the execution log is reported as rate-limited', () => {
  assert.equal(failureReason('... "result":"Claude AI usage limit reached" ...'), 'rate-limited');
  assert.equal(failureReason('error: Rate limit exceeded'), 'rate-limited');
  assert.equal(failureReason('max turns'), 'failed');
  assert.equal(failureReason(null), 'failed');
  const body = composeBody({ state: state(), findingsText: null, narrative: '', outcome: 'failure', executionLog: 'rate_limit_error', headSha: HEAD, baseSha: BASE });
  assert.ok(body.includes('review did not complete (rate-limited)'));
});

test('success writes the new marker: current findings win over prior entries', () => {
  const reReported = { ...secFinding, slug: 'c1:b.ts:y', severity: 'Critical', locations: [{ file: 'b.ts', line: 1, side: 'changed' }] };
  const body = composeBody({ state: state(), findingsText: findingsText([reReported]), narrative: '', outcome: 'success', headSha: HEAD, baseSha: BASE });
  const m = decodeLedger(body);
  assert.equal(m.lastReviewedSha, HEAD);
  assert.equal(m.lastBaseSha, BASE);
  assert.deepEqual(m.linkTypesSeen, ['callable']);
  assert.equal(m.ledger.length, 2);
  assert.deepEqual(m.ledger.find((e) => e.id === opaqueId('c1:b.ts:y')), {
    id: opaqueId('c1:b.ts:y'), severity: 'Critical', status: 'open', security: true, runsSinceResolved: 0,
  });
  assert.ok(m.ledger.some((e) => e.slug === 'c9:a.ts:x'));
});

test('malformed prior ledger entries are dropped and security entries reshaped', () => {
  const dirty = [...L, 'junk', { id: 'nothex', severity: 'High', status: 'open', security: false }, { id: opaqueId('c1:z.ts:z'), severity: 'Low', status: 'open', security: true, runsSinceResolved: 0, slug: 'leak', title: 'leak' }];
  const body = composeBody({ state: state({ ledger: dirty }), findingsText: null, narrative: '', outcome: 'failure', headSha: HEAD, baseSha: BASE });
  const m = decodeLedger(body);
  assert.equal(m.ledger.length, 3);
  assert.ok(!JSON.stringify(m.ledger).includes('leak'));
});

test('missing state on success still produces a decodable marker', () => {
  const body = composeBody({ state: null, findingsText: findingsText([]), narrative: '', outcome: 'success', headSha: HEAD, baseSha: BASE });
  const m = decodeLedger(body);
  assert.equal(m.lastReviewedSha, HEAD);
  assert.deepEqual(m.ledger, []);
  assert.match(body, /No issues found/);
});
