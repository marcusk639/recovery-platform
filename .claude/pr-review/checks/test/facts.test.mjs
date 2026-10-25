import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts, snapshotPath } from '../facts.mjs';

const base = {
  files: [{ file: 'a.ts', status: 'M' }],
  routeResult: { packages: ['recovery-api'], linkTypes: ['callable'], classes: [13, 14] },
  results: [],
  prContext: 'ctx',
};

test('facts output is capped', () => {
  const facts = Array.from({ length: 500 }, (_, i) => ({ check: 'big', file: `f${i}.ts`, note: 'x'.repeat(300) }));
  const out = buildFacts({ ...base, results: [{ check: 'big', facts }] });
  assert.ok(Buffer.byteLength(out) <= 40000);
  assert.match(out, /more omitted/);
});

test('total output stays under cap across many checks', () => {
  const results = Array.from({ length: 10 }, (_, c) => ({
    check: `c${c}`,
    facts: Array.from({ length: 30 }, (_, i) => ({ check: `c${c}`, file: `f${i}.ts`, note: 'y'.repeat(400) })),
  }));
  const out = buildFacts({ ...base, results });
  assert.ok(Buffer.byteLength(out) <= 40000);
});

test('thrown check yields pre-check unavailable', () => {
  const out = buildFacts({ ...base, results: [{ check: 'checkRegion', error: new Error('x') }] });
  assert.match(out, /pre-check unavailable: checkRegion/);
  assert.doesNotMatch(out, /Error: x/);
});

test('contains all headings', () => {
  const out = buildFacts(base);
  for (const h of ['## Packages', '## Link types', '## Checklist classes', '## Facts', '## PR context']) {
    assert.ok(out.includes(h), h);
  }
});

test('renders facts with file and line', () => {
  const out = buildFacts({ ...base, results: [{ check: 'k', facts: [{ check: 'k', file: 'a.ts', line: 7, note: 'hello' }] }] });
  assert.match(out, /a\.ts:7/);
  assert.match(out, /hello/);
});

test('PR context carries the redacted PR title', () => {
  const secret = 'whsec' + '_' + 'B'.repeat(16);
  const out = buildFacts({ ...base, title: `ci: add ${secret}\nsecond line` });
  assert.match(out, /## PR context\nPR title: ci: add whsec_… second line/);
  assert.ok(!out.includes(secret));
});

test('state snapshot lives outside OUT', () => {
  assert.equal(snapshotPath({ STATE_FILE: '/x/s.json', RUNNER_TEMP: '/t' }), '/x/s.json');
  assert.equal(snapshotPath({ RUNNER_TEMP: '/t' }), '/t/prstate-snapshot/state.json');
  assert.equal(snapshotPath({}), null);
});
