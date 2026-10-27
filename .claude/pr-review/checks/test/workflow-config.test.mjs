// Static checks on the review workflow text: expressions GitHub rejects at the
// job level, the OUT/STATE_FILE wiring, the Dependabot skip and the model's tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW = join(dirname(fileURLToPath(import.meta.url)), '../../../../.github/workflows/claude-code-review.yml');
const wf = readFileSync(WORKFLOW, 'utf8');
const lines = wf.split('\n');
const indent = (l) => l.length - l.trimStart().length;

// The lines of every `env:` block directly under a job (4-space indent).
function jobLevelEnv() {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '    env:') continue;
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || indent(lines[j]) > 4); j++) out.push(lines[j]);
  }
  return out;
}

test('no runner.* expression in a job-level env block (GitHub rejects it there)', () => {
  assert.ok(!jobLevelEnv().some((l) => /\$\{\{\s*runner\./.test(l)), 'runner context is step-level only');
});

test('Run start sets OUT and STATE_FILE through GITHUB_ENV before any other step', () => {
  const start = wf.indexOf('- name: Run start');
  const next = wf.indexOf('- name:', start + 1);
  const step = wf.slice(start, next);
  assert.ok(start > 0 && start < wf.indexOf('- name: Facts'));
  assert.match(step, /echo "OUT=\$RUNNER_TEMP\/pr-review" >> "\$GITHUB_ENV"/);
  assert.match(step, /echo "STATE_FILE=\$RUNNER_TEMP\/prstate-snapshot\/state\.json" >> "\$GITHUB_ENV"/);
  assert.match(step, /RUN_STARTED_AT=/);
});

test('the job is skipped for Dependabot (its runs get no secrets)', () => {
  const cond = /if: >-\n([\s\S]*?)\n {4}runs-on/.exec(wf)?.[1] ?? '';
  assert.match(cond, /github\.actor != 'dependabot\[bot\]'/);
});

test('model writes and edits are allowed only under OUT; workspace writes and edits denied', () => {
  const allow = /--allowedTools "([^"]+)"/.exec(wf)?.[1].split(',') ?? [];
  const deny = /--disallowedTools "([^"]+)"/.exec(wf)?.[1].split(',') ?? [];
  assert.ok(allow.includes('Write(/${{ runner.temp }}/pr-review/**)'));
  assert.ok(allow.includes('Edit(/${{ runner.temp }}/pr-review/**)'));
  assert.ok(!deny.includes('Edit'), 'no bare Edit deny (it would override the OUT allow rule)');
  assert.ok(deny.includes('Write(/${{ github.workspace }}/**)'));
  assert.ok(deny.includes('Edit(/${{ github.workspace }}/**)'));
  assert.ok(!allow.includes('Bash'), 'Bash only as the gh pr comment/diff/view prefixes');
  assert.deepEqual(allow.filter((t) => t.startsWith('Bash')), ['Bash(gh pr comment:*)', 'Bash(gh pr diff:*)', 'Bash(gh pr view:*)']);
});

test('the model cannot write runner command files or the state snapshot', () => {
  const deny = /--disallowedTools "([^"]+)"/.exec(wf)?.[1].split(',') ?? [];
  for (const dir of ['_runner_file_commands', 'prstate-snapshot']) {
    assert.ok(deny.includes(`Write(/\${{ runner.temp }}/${dir}/**)`), `Write ${dir}`);
    assert.ok(deny.includes(`Edit(/\${{ runner.temp }}/${dir}/**)`), `Edit ${dir}`);
  }
});

test('Publish clears NODE_OPTIONS in its own env and runs node with --no-warnings only', () => {
  const start = wf.indexOf('- name: Publish');
  const step = wf.slice(start, wf.indexOf('- name:', start + 1));
  assert.match(step, /\n {10}NODE_OPTIONS: ""\n/);
  const nodes = [...step.matchAll(/^\s*node (.*)$/gm)].map((m) => m[1]);
  assert.deepEqual(nodes, ['--no-warnings .review-publish/.claude/pr-review/checks/publish.mjs']);
});

test('Publish also clears BASH_ENV in its own env', () => {
  const start = wf.indexOf('- name: Publish');
  const step = wf.slice(start, wf.indexOf('- name:', start + 1));
  assert.match(step, /\n {10}BASH_ENV: ""\n/);
});

test('without scripts on base, Facts outputs tier none so the model never runs', () => {
  const start = wf.indexOf('- name: Facts');
  const step = wf.slice(start, wf.indexOf('- name:', start + 1));
  const fallback = step.slice(step.indexOf('else'));
  assert.match(fallback, /echo "tier=none" >> "\$GITHUB_OUTPUT"/);
  assert.doesNotMatch(fallback, /tier=full/);
  assert.match(wf, /- name: Review\n\s+id: review\n\s+if: steps\.facts\.outputs\.tier != 'none'/);
});

test('the model runs with --strict-mcp-config and all hooks disabled', () => {
  assert.match(wf, /\n\s+--strict-mcp-config\n/);
  assert.match(wf, /settings: '\{"disableAllHooks": true\}'/);
});

test('the model is denied MultiEdit; NotebookEdit, WebFetch and WebSearch are not allowed', () => {
  const allow = /--allowedTools "([^"]+)"/.exec(wf)?.[1].split(',') ?? [];
  const deny = /--disallowedTools "([^"]+)"/.exec(wf)?.[1].split(',') ?? [];
  assert.ok(deny.includes('MultiEdit'));
  // Not denied explicitly any more; tools missing from --allowedTools stay unavailable in the action.
  for (const t of ['NotebookEdit', 'WebFetch', 'WebSearch', 'Bash']) assert.ok(!allow.includes(t), t);
});

test('the base checkout path is cleared before the trusted-scripts checkout', () => {
  const clear = wf.indexOf('- name: Clear base checkout path');
  assert.ok(clear > 0);
  assert.match(wf.slice(clear, wf.indexOf('- name:', clear + 1)), /run: rm -rf \.review-base\n/);
  assert.ok(clear < wf.indexOf('- name: Checkout base (trusted scripts)'));
});
