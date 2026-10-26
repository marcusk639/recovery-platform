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
  assert.ok(deny.includes('Bash'));
});
