import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, MAX_TURNS } from '../lib/tier.mjs';

const base = {
  lastReviewedSha: 'a'.repeat(40),
  reachable: true,
  incrementFiles: ['src/a.ts'],
  incrementLinkTypes: [],
  linkTypesSeen: [],
  prDiffUnchanged: false,
  prFileCount: 10,
  baseDriftCounterpartsChanged: false,
};

test('no last sha gives full', () => assert.equal(classify({ ...base, lastReviewedSha: null }), 'full'));
test('unreachable gives full', () => assert.equal(classify({ ...base, reachable: false }), 'full'));
test('empty increment gives none', () => assert.equal(classify({ ...base, incrementFiles: [] }), 'none'));
test('PR diff unchanged, no counterpart change gives none', () =>
  assert.equal(classify({ ...base, prDiffUnchanged: true }), 'none'));
test('PR diff unchanged with counterpart change gives base-drift', () =>
  assert.equal(classify({ ...base, prDiffUnchanged: true, baseDriftCounterpartsChanged: true }), 'base-drift'));
test('empty own increment after base merge with counterpart drift gives base-drift', () =>
  assert.equal(classify({ ...base, incrementFiles: [], prDiffUnchanged: true, baseDriftCounterpartsChanged: true }), 'base-drift'));
test('docs-only increment gives light', () => assert.equal(classify({ ...base, incrementFiles: ['README.md'] }), 'light'));
test('lockfile-only increment gives light', () =>
  assert.equal(classify({ ...base, incrementFiles: ['pkg/pnpm-lock.yaml', 'package-lock.json'] }), 'light'));
test('docs with link types is not light', () =>
  assert.notEqual(classify({ ...base, incrementFiles: ['README.md'], incrementLinkTypes: ['callable'], linkTypesSeen: ['callable'] }), 'light'));
test('new link type gives incremental-new-links', () =>
  assert.equal(classify({ ...base, incrementLinkTypes: ['callable'], linkTypesSeen: ['storage'] }), 'incremental-new-links'));
test('half the PR files gives incremental-new-links', () =>
  assert.equal(classify({ ...base, incrementFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'] }), 'incremental-new-links'));
test('known link type, 1 of 10 files gives incremental', () =>
  assert.equal(classify({ ...base, incrementLinkTypes: ['callable'], linkTypesSeen: ['callable'] }), 'incremental'));
test('MAX_TURNS matches contract', () =>
  assert.deepEqual(MAX_TURNS, { none: 0, 'base-drift': 15, light: 15, incremental: 40, 'incremental-new-links': 60, full: 60 }));
// prFileCount 0 (facts could not list the PR's files) makes any non-empty
// increment count as "half the PR": the widest incremental tier, never light.
test('prFileCount 0 with a code increment gives incremental-new-links', () => {
  assert.equal(classify({ ...base, prFileCount: 0 }), 'incremental-new-links');
  const { prFileCount, ...noCount } = base;
  assert.equal(classify({ ...noCount, incrementLinkTypes: ['callable'], linkTypesSeen: ['callable'] }), 'incremental-new-links');
  assert.equal(classify({ ...base, prFileCount: 0, incrementFiles: ['README.md'] }), 'light');
});
