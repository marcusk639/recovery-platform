import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSkeleton } from '../publish.mjs';
import { SUMMARY_MARKER } from '../lib/markers.mjs';

test('skeleton success', () => {
  const s = renderSkeleton({ headSha: 'abc1234', outcome: 'success' });
  assert.ok(s.startsWith(SUMMARY_MARKER));
  assert.ok(s.includes('reviewer online'));
  assert.ok(s.includes('abc1234'));
});

test('skeleton failure', () => {
  const s = renderSkeleton({ headSha: 'abc1234', outcome: 'failure' });
  assert.ok(s.startsWith(SUMMARY_MARKER));
  assert.ok(s.includes('review did not complete'));
});
