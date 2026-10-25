import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeIncrement } from '../lib/increment.mjs';

let root;
const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: root, encoding: 'utf8' }).trim();
const put = (p, c) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); };
const commit = (msg) => { g('add', '-A'); g('commit', '-m', msg); return g('rev-parse', 'HEAD'); };
const SHAS = {};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'incr-'));
  g('init', '-q', '-b', 'main');
  put('seed.txt', 's');
  SHAS.base0 = commit('base0');
  g('checkout', '-q', '-b', 'pr');
  put('recovery-api/src/callable/x.ts', 'export const x = 1;\n');
  SHAS.p1 = commit('p1');
  put('README.md', 'doc\n');
  SHAS.p2 = commit('p2');
  g('checkout', '-q', 'main');
  put('homegroups/mobile/src/a.ts', 'a\n');
  SHAS.base1 = commit('base1');
  g('checkout', '-q', 'pr');
  g('merge', '-q', '--no-edit', 'main');
  SHAS.p3 = g('rev-parse', 'HEAD');
});
after(() => rmSync(root, { recursive: true, force: true }));

const args = (o) => ({ prPaths: ['recovery-api/src/callable/x.ts'], cwd: root, ...o });

test('increment lists only files after the last reviewed sha', () => {
  const r = computeIncrement(args({ lastReviewedSha: SHAS.p1, lastBaseSha: SHAS.base0, baseSha: SHAS.base0, headSha: SHAS.p2 }));
  assert.equal(r.reachable, true);
  assert.deepEqual(r.incrementFiles, ['README.md']);
  assert.deepEqual(r.incrementDiff.map((f) => f.file), ['README.md']);
  assert.deepEqual(r.incrementLinkTypes, []);
  assert.equal(r.prPatchIdUnchanged, false);
});

test('unreachable or invalid last sha is not reachable', () => {
  for (const bad of ['f'.repeat(40), '--upload-pack=x', null]) {
    const r = computeIncrement(args({ lastReviewedSha: bad, lastBaseSha: SHAS.base0, baseSha: SHAS.base0, headSha: SHAS.p2 }));
    assert.equal(r.reachable, false);
  }
});

test('base merge with same PR patch is patch-id unchanged and reports counterpart drift', () => {
  const r = computeIncrement(args({ lastReviewedSha: SHAS.p2, lastBaseSha: SHAS.base0, baseSha: SHAS.base1, headSha: SHAS.p3 }));
  assert.equal(r.reachable, true);
  assert.equal(r.prPatchIdUnchanged, true);
  assert.equal(r.baseDriftCounterpartsChanged, true);
  assert.deepEqual(r.driftFiles, ['homegroups/mobile/src/a.ts']);
});

test('missing old base degrades to changed, not unchanged', () => {
  const r = computeIncrement(args({ lastReviewedSha: SHAS.p2, lastBaseSha: 'e'.repeat(40), baseSha: SHAS.base1, headSha: SHAS.p3 }));
  assert.equal(r.reachable, true);
  assert.equal(r.prPatchIdUnchanged, false);
});
