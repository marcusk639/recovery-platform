// Static checks on the opt-in Serena code navigation (spec 2026-10-26 §3): gating,
// arguments unchanged when off, pinning, isolation, and the base-controlled config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const wf = readFileSync(join(ROOT, '.github/workflows/claude-code-review.yml'), 'utf8');
const projectYml = readFileSync(join(ROOT, '.claude/pr-review/serena/project.yml'), 'utf8');
const serenaConfig = readFileSync(join(ROOT, '.claude/pr-review/serena/serena_config.yml'), 'utf8');

const stepText = (name) => {
  const start = wf.indexOf(`- name: ${name}\n`);
  assert.ok(start > 0, `step ${name}`);
  const next = wf.indexOf('\n      - name:', start + 1);
  return wf.slice(start, next < 0 ? undefined : next);
};
const setup = stepText('Serena setup');
const review = stepText('Review');
const GATE = "if: steps.facts.outputs.tier != 'none' && vars.PR_REVIEW_SERENA == 'on'";
const TOOLS = ['find_symbol', 'find_referencing_symbols', 'get_symbols_overview', 'search_for_pattern'];
const at = (needle, text = setup) => {
  const i = text.indexOf(needle);
  assert.ok(i >= 0, `missing: ${needle}`);
  return i;
};

test('both Serena steps are gated on the repo variable and a model run, and never fail the job', () => {
  for (const name of ['Set up uv for Serena', 'Serena setup']) {
    const s = stepText(name);
    assert.ok(s.includes(`\n        ${GATE}\n`), `${name} gate`);
    assert.match(s, /\n {8}continue-on-error: true\n/, `${name} continue-on-error`);
  }
  assert.ok(wf.indexOf('- name: Serena setup') < wf.indexOf('- name: Review\n'));
  assert.ok(wf.indexOf('- name: Restore reviewer knowledge from base') < wf.indexOf('- name: Set up uv for Serena'));
});

test('with Serena off, the model arguments and prompt are exactly the pre-Serena ones', () => {
  const allow = /--allowedTools "([^"]+)"/.exec(review)[1];
  assert.equal(
    allow.replace('${{ steps.serena.outputs.tools }}', ''),
    'Read,Grep,Glob,Write(/${{ runner.temp }}/pr-review/**),Edit(/${{ runner.temp }}/pr-review/**)',
  );
  assert.ok(allow.startsWith('${{ steps.serena.outputs.tools }}Read,'), 'Serena tools are only a prefix');
  const serenaRefs = [...review.matchAll(/\$\{\{\s*steps\.serena\.outputs\.(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(serenaRefs, ['mcp_args', 'prompt', 'tools']);
  assert.match(review, /\n {12}\$\{\{ steps\.serena\.outputs\.mcp_args \}\}\n/, 'mcp_args on its own line');
  assert.match(review, /\n {12}--strict-mcp-config\n/);
  const deny = /--disallowedTools "([^"]+)"/.exec(review)[1];
  assert.doesNotMatch(deny, /serena/, 'deny list untouched');
});

test('the step outputs exactly the four allowed Serena tools, matching fixed_tools', () => {
  const tools = /echo "tools=([^"]+)"/.exec(setup)[1];
  assert.equal(tools, TOOLS.map((t) => `mcp__serena__${t},`).join(''));
});

test('setup-uv is pinned to a commit SHA and serena-agent to an exact version', () => {
  assert.match(stepText('Set up uv for Serena'), /uses: astral-sh\/setup-uv@[0-9a-f]{40}\n/);
  assert.match(setup, /SERENA_VERSION: "\d+\.\d+\.\d+"\n/);
  assert.match(setup, /uv tool install --python 3\.13 "serena-agent==\$SERENA_VERSION"/);
});

test("Serena gets a copy of tracked files without .git or the PR's .serena/, then the base project.yml", () => {
  const copy = at('git ls-files -z');
  assert.match(setup.slice(copy, at('sudo rsync')), /\\\.serena\|/);
  const base = at('sudo install -o "$SR_USER" -m 600 "$cfg/project.yml" "$SR_HOME/src/.serena/project.yml"');
  assert.ok(copy < base, 'base project.yml written after the copy');
  assert.match(setup, /\n\s+cfg=\.review-base\/\.claude\/pr-review\/serena\n/, 'config comes from the base checkout');
  assert.match(setup, /--project "\$SR_HOME\/src"/, 'Serena indexes the copy, not the workspace');
  assert.doesNotMatch(setup, /--project "?\$\{?GITHUB_WORKSPACE/);
});

test('the MCP server runs as serena-runner with an empty environment', () => {
  assert.match(setup, /SR_USER: serena-runner\n/);
  assert.match(setup, /"command": "sudo", "args": sys\.argv\[2:\]/);
  assert.match(setup, /\n {12}-n -u "\$SR_USER" -H env -i "HOME=\$SR_HOME" "PATH=\$SR_PATH" "SERENA_HOME=\$SR_HOME\/serena-home" \\\n/);
  assert.match(setup, /--mode no-onboarding --mode no-memories/);
});

test('language servers install against a throwaway project; PR code is indexed only offline', () => {
  const warmup = at('project index "$SR_HOME/ls-warmup"');
  const chmod = at('chmod 700 "$GITHUB_WORKSPACE/.git" "$RUNNER_TEMP"');
  const v4 = at('sudo iptables -A OUTPUT -m owner --uid-owner "$SR_USER" ! -o lo -j REJECT');
  const v6 = at('sudo ip6tables -A OUTPUT -m owner --uid-owner "$SR_USER" ! -o lo -j REJECT');
  const probes = at('curl -sS --max-time 5');
  const prIndex = at('project index "$SR_HOME/src"');
  const outputs = at('>> "$GITHUB_OUTPUT"');
  assert.ok(warmup < chmod && chmod < v4 && v4 < v6 && v6 < probes && probes < prIndex && prIndex < outputs);
  assert.equal(setup.split('project index').length, 3, 'exactly two index runs: warmup, then the PR copy');
  for (const probe of ['serena-runner reached the network', 'can read the workspace .git/config', 'can list RUNNER_TEMP', 'can write the source copy', 'environment is not empty']) {
    assert.ok(at(probe) < prIndex, probe);
  }
  assert.equal(setup.split('>> "$GITHUB_OUTPUT"').length, 2, 'outputs are written once, at the end');
});

test('the source copy is root-owned; serena-runner may write only its .serena index dir', () => {
  const copy = at('sudo rsync');
  const chown = at('sudo chown -R root:root "$SR_HOME/src"');
  const serenaDir = at('sudo install -d -o "$SR_USER" -m 700 "$SR_HOME/src/.serena"');
  assert.ok(copy < chown && chown < serenaDir);
  assert.match(setup, /if ! run_as test -r "\$SR_HOME\/src\/package\.json"; then\n.*\n\s+exit 0\n/, 'unreadable copy means no Serena, not a failed job');
  assert.doesNotMatch(setup, /chmod [^\n]*\/home\/runner|setfacl/, '/home/runner is never opened up');
});

test('Stop Serena kills every serena-runner process before the publish checkout, and Publish waits for it', () => {
  const stop = stepText('Stop Serena');
  assert.match(stop, /\n {8}if: always\(\)\n/);
  assert.match(stop, /sudo pkill -KILL -u serena-runner/);
  assert.match(stop, /pgrep -u serena-runner/);
  assert.match(stop, /\n {10}exit 1\n/, 'fails if a process survives');
  assert.ok(wf.indexOf('- name: Review\n') < wf.indexOf('- name: Stop Serena'));
  assert.ok(wf.indexOf('- name: Stop Serena') < wf.indexOf('- name: Clear publish checkout path'));
  assert.match(stepText('Publish'), /\n {8}if: always\(\) && steps\.stop-serena\.outcome != 'failure'\n/);
});

test('the base project.yml is read-only with exactly the four tools and nothing that runs code', () => {
  assert.match(projectYml, /\nread_only: true\n/);
  const fixed = /\nfixed_tools:\n((?: {2}- .+\n)+)/.exec(projectYml)[1].trim().split('\n').map((l) => l.trim().replace(/^- /, ''));
  assert.deepEqual(fixed, TOOLS);
  assert.match(projectYml, /\nlanguage_servers: \["typescript"\]\n/);
  for (const key of ['activation_command', 'excluded_tools', 'included_optional_tools', 'ls_specific_settings']) {
    assert.doesNotMatch(projectYml, new RegExp(`\\n${key}:`), key);
  }
  for (const p of ['**/public/**', '**/lib/**', '**/node_modules/**', '**/_legacy/**']) assert.ok(projectYml.includes(`"${p}"`), p);
});

test('the global Serena config has no dashboard or GUI, no trusted projects, and pinned language servers', () => {
  for (const line of ['web_dashboard: false', 'web_dashboard_open_on_launch: false', 'gui_log_window: false', 'trusted_project_path_patterns: []']) {
    assert.ok(serenaConfig.includes(`\n${line}\n`), line);
  }
  assert.match(serenaConfig, /typescript_version: "\d+\.\d+\.\d+"/);
  assert.match(serenaConfig, /typescript_language_server_version: "\d+\.\d+\.\d+"/);
});
