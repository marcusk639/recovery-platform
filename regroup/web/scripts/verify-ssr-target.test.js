/**
 * Tests for the staging bundle check. Fixture trees live in a temp dir, so
 * nothing here reads the real build output.
 *
 * Run: node --test scripts/verify-ssr-target.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkTree } = require('./verify-ssr-target');

const EXPECT = ['regroup-e2e', 'AIzaStagingKey'];

function tree(files, label = 'root') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ssr-target-${label}-`));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

test('a staging tree passes when every root carries the staging identifiers', () => {
  // Production identifiers may appear: e2e-staging-guard.ts embeds them as its deny-list.
  const browser = tree({
    'main.js': "projectId:'regroup-e2e',apiKey:'AIzaStagingKey',deny:'phoenix-cleanhouse'",
  });
  const server = tree({ 'main.js': 'regroup-e2e', 'lazy/3.js': 'AIzaStagingKey' });
  assert.deepStrictEqual(checkTree([browser, server], { expect: EXPECT }), {
    ok: true,
    problems: [],
  });
});

test('a server half that fell back to another environment fails', () => {
  const browser = tree({ 'main.js': 'regroup-e2e AIzaStagingKey' });
  const server = tree({ 'main.js': "projectId:'phoenix-cleanhouse',apiKey:'AIzaProdKey'" }, 'server');
  const r = checkTree([browser, server], { expect: EXPECT });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems.join('\n'), /server.*doesn't contain regroup-e2e/s);
  assert.match(r.problems.join('\n'), /doesn't contain AIzaStagingKey/);
});

test('an empty or missing root fails', () => {
  const browser = tree({ 'main.js': 'regroup-e2e AIzaStagingKey' });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-target-empty-'));
  const r = checkTree([browser, empty, path.join(empty, 'nope')], { expect: EXPECT });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.filter((p) => /no \.js files/.test(p)).length, 2);
});
