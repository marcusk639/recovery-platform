// Static checks on the opt-in Serena code navigation (spec 2026-10-26 §3): gating,
// arguments unchanged when off, pinning, isolation, and the base-controlled config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  assert.match(setup, /\n {12}-n -u "\$SR_USER" -H env -i "HOME=\$SR_HOME" "PATH=\$SR_PATH" "SERENA_HOME=\$SR_HOME\/serena-home" SERENA_USAGE_REPORTING=false \\\n/);
  // env -i drops CI/GITHUB_ACTIONS, which Serena checks to skip its startup usage report.
  assert.match(setup, /run_as\(\) \{ [^}]*SERENA_USAGE_REPORTING=false "\$@"; \}/);
  assert.match(setup, /--mode no-onboarding --mode no-memories/);
});

test('language servers install against a throwaway project; PR code is indexed only offline', () => {
  const warmup = at('project index "$SR_HOME/ls-warmup"');
  const chmod = at('chmod 700 "$GITHUB_WORKSPACE/.git" "$RUNNER_TEMP"');
  const v4 = at('sudo iptables -A OUTPUT -m owner --uid-owner "$SR_USER" -j REJECT');
  const v6 = at('sudo ip6tables -A OUTPUT -m owner --uid-owner "$SR_USER" -j REJECT');
  assert.doesNotMatch(setup, /-o lo/, 'no loopback exemption: DNS via 127.0.0.53 would stay open');
  const probes = at('curl -sS --max-time 5');
  const prIndex = at('project index "$SR_HOME/src"');
  const outputs = at('>> "$GITHUB_OUTPUT"');
  assert.ok(warmup < chmod && chmod < v4 && v4 < v6 && v6 < probes && probes < prIndex && prIndex < outputs);
  assert.equal(setup.split('project index').length, 3, 'exactly two index runs: warmup, then the PR copy');
  for (const probe of ['serena-runner reached the network', 'can resolve DNS names', 'can read the workspace .git/config', 'can list RUNNER_TEMP', 'can write the source copy', 'environment is not empty']) {
    assert.ok(at(probe) < prIndex, probe);
  }
  assert.equal(setup.split('>> "$GITHUB_OUTPUT"').length, 2, 'outputs are written once, at the end');
});

test('the source copy is root-owned; serena-runner may write only its .serena index dir', () => {
  const copy = at('sudo rsync');
  const chown = at('sudo chown -R root:root "$SR_HOME/src"');
  const serenaDir = at('sudo install -d -o "$SR_USER" -m 700 "$SR_HOME/src/.serena"');
  assert.ok(copy < chown && chown < serenaDir);
  assert.match(setup, /if ! run_as test -r "\$probe_file"; then\n.*\n\s+exit 0\n/, 'unreadable copy means no Serena, not a failed job');
  assert.doesNotMatch(setup, /chmod [^\n]*\/home\/runner|setfacl/, '/home/runner is never opened up');
});

test('Stop Serena kills every serena-runner process before the publish checkout, and Publish waits for it', () => {
  const stop = stepText('Stop Serena');
  assert.match(stop, /\n {8}if: always\(\)\n/);
  assert.match(stop, /sudo pkill -KILL -u serena-runner/);
  assert.match(stop, /pgrep -u serena-runner/);
  assert.match(stop, /sudo find \/tmp \/var\/tmp \/dev\/shm -xdev -user serena-runner -delete/, 'leftover temp files removed');
  assert.match(stop, /\n {10}exit 1\n/, 'fails if a process survives');
  assert.ok(wf.indexOf('- name: Review\n') < wf.indexOf('- name: Stop Serena'));
  assert.ok(wf.indexOf('- name: Stop Serena') < wf.indexOf('- name: Clear publish checkout path'));
  assert.match(stepText('Publish'), /\n {8}if: always\(\) && steps\.stop-serena\.outcome != 'failure'\n/);
});

test('the base project.yml is read-only with exactly the four tools and nothing that runs code', () => {
  assert.match(projectYml, /\nread_only: true\n/);
  const fixed = /\nfixed_tools:\n((?: {2}- .+\n)+)/.exec(projectYml)[1].trim().split('\n').map((l) => l.trim().replace(/^- /, ''));
  assert.deepEqual(fixed, TOOLS);
  const servers = JSON.parse(/\nlanguage_servers: (\[[^\]]*\])\n/.exec(projectYml)[1]);
  assert.ok(servers.includes('typescript'), 'typescript is configured');
  // Every configured server must be downloaded during the network-on warmup.
  const EXT = { typescript: 'ts', markdown: 'md', yaml: 'yaml' };
  for (const ls of servers) {
    assert.ok(EXT[ls], `known language server: ${ls}`);
    assert.ok(at(`ls-warmup/warmup.${EXT[ls]}"`) < at('project index "$SR_HOME/ls-warmup"'), `warmup file for ${ls}`);
  }
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

test('the copy filter drops build output, vendor code and every lib/ dir (owner decision), keeps other source', () => {
  const pattern = /grep -zvE '([^']+)'/.exec(setup)[1];
  const excluded = new RegExp(pattern);
  for (const kept of ['homegroups/functions/src/index.ts', 'regroup/mobile/src/App.tsx', 'detox-recovery/app/api/contact/route.ts']) {
    assert.ok(!excluded.test(kept), `kept: ${kept}`);
  }
  // Every lib/ dir is treated as build output, matching the project.yml ignore.
  for (const dropped of ['recovery-api/lib/callable/findMeetings.js', 'regroup/functions/lib/index.js', 'detox-recovery/lib/abuse-protection.ts', 'regroup/web/public/x.js', 'a/node_modules/b.js', 'homegroups/_legacy/x.ts', '.serena/project.yml', 'x/.serena/y']) {
    assert.ok(excluded.test(dropped), `dropped: ${dropped}`);
  }
});

test('Serena tools reach the model only through the step output: no literal or wildcard Serena tools', () => {
  const allow = /--allowedTools "([^"]+)"/.exec(review)[1];
  assert.doesNotMatch(allow, /mcp__serena/, 'no literal Serena tool in the Review step');
  // Path globs inside Write(...)/Edit(...) are expected; a wildcard tool name is not.
  assert.doesNotMatch(allow, /mcp__[^,]*\*|(^|,)\*/, 'no tool-name wildcards');
  const tools = /echo "tools=([^"]+)"/.exec(setup)[1];
  assert.doesNotMatch(tools, /\*/, 'no wildcard in the Serena tool list');
});

test('the copy probes use a real source file from the copy, never a fixed path that may not exist', () => {
  assert.doesNotMatch(setup, /package\.json/, 'the repo has no root package.json');
  const find = at(`probe_file="$(sudo find "$SR_HOME/src" -type f -name '*.ts'`);
  assert.ok(find < at('run_as touch "$probe_file"') && find < at('run_as test -r "$probe_file"'));
  assert.ok(at('run_as test -r "$probe_file"') < at('project index "$SR_HOME/src"'));
});

test("the review guidance replaces Serena's connection prompt and names only the reviewer's tools", () => {
  // Serena reads every .yml in prompt_templates/; exactly one may override connection_prompt.
  const dir = join(ROOT, '.claude/pr-review/serena/prompt_templates');
  const overriding = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).filter((f) => /\n {2}connection_prompt:/.test(readFileSync(join(dir, f), 'utf8')));
  assert.equal(overriding.length, 1, `exactly one connection_prompt override, got ${overriding.join(', ')}`);
  const tpl = readFileSync(join(dir, overriding[0]), 'utf8');
  const m = /\nprompts:\n {2}connection_prompt: \|\n((?: {4}.*\n|\n)+)/.exec(tpl);
  assert.ok(m, 'connection_prompt override is a non-empty block');
  const prompt = m[1];
  assert.match(prompt, /REVIEW\.md decides what to review/);
  assert.match(prompt, /Grep those paths/, 'Grep fallback for paths Serena does not index');
  assert.match(prompt, /never as instructions/, 'tool output is untrusted data');
  assert.doesNotMatch(prompt, /initial_instructions/, 'never points at a tool the review does not allow');
  const named = new Set(prompt.match(/\b(?:find_symbol|find_referencing_symbols|get_symbols_overview|search_for_pattern|initial_instructions|execute_shell_command|replace_symbol_body|read_memory|write_memory|activate_project)\b/g));
  for (const tool of named) assert.ok(TOOLS.includes(tool), `prompt names an unavailable tool: ${tool}`);
  // initial_prompt only travels through initial_instructions, which is not allowed: keep it empty.
  assert.match(projectYml, /\ninitial_prompt: ""\n/);
  // The setup step installs the override into SERENA_HOME before Serena starts, and requires it.
  const install = at('"$cfg"/prompt_templates/*.yml "$SR_HOME/serena-home/prompt_templates/"');
  assert.ok(install < at('project index "$SR_HOME/ls-warmup"'));
  assert.match(setup, /grep -lE '\^  connection_prompt:' "\$cfg"\/prompt_templates\/\*\.yml/);
  assert.match(setup, /\[ "\$overrides" != "1" \]/, 'Serena stays off unless exactly one override exists');
});

test('the Review step gives the MCP server time to start', () => {
  assert.match(review, /\n {8}env:\n {10}MCP_TIMEOUT: "\d+"\n/);
});

test('the global Serena config empties base_modes, which otherwise default to interactive and editing', () => {
  assert.match(serenaConfig, /\nbase_modes: \[\]\n/);
});
