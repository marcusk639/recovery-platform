import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prDiff } from './lib/diff.mjs';
import { route } from './lib/routing.mjs';
import { redact } from './lib/redact.mjs';
import { ghRequest, listIssueComments, listReviewComments } from './lib/gh.mjs';
import { loadState } from './lib/state.mjs';
import { classify, MAX_TURNS } from './lib/tier.mjs';
import { computeIncrement } from './lib/increment.mjs';
import { writeMaterial } from './lib/material.mjs';
import { SUMMARY_MARKER } from './lib/markers.mjs';
import { runPaths } from './lib/paths.mjs';
import { checkExports, checkRegion, checkQueriesVsIndexes, checkStoragePaths, checkCollectionsVsRules, checkTwins } from './contracts.mjs';
import { checkSecrets, checkPiiLogs, checkNewFileSize, checkTitleScope, checkSelfEdit, runVerifyDiff } from './hygiene.mjs';

const MAX_BYTES = 40000;
const MAX_PER_CHECK = 30;
const MAX_LINE = 500;
const MAX_CONTEXT = 12000;
const MAX_COMMENT = 2000;
const MAX_TITLE = 300;
const MAX_CHANGED = 3000;
const bytes = (s) => Buffer.byteLength(s);
const list = (xs) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- none');

function clip(text, max) {
  if (bytes(text) <= max) return text;
  return Buffer.from(text).subarray(0, max).toString('utf8').replace(/�+$/, '') + '\n[truncated]';
}

function renderFact(f) {
  const where = f.line != null ? `${f.file}:${f.line}` : f.file;
  return clip(`- [${f.check}] ${where}: ${f.note}`, MAX_LINE).replace(/\n\[truncated\]$/, '...');
}

function renderResult(r) {
  if (r.error) return `- pre-check unavailable: ${r.check}`;
  const facts = r.facts ?? [];
  const lines = facts.slice(0, MAX_PER_CHECK).map(renderFact);
  if (facts.length > MAX_PER_CHECK) lines.push(`- [${r.check}] ... ${facts.length - MAX_PER_CHECK} more omitted`);
  return lines.join('\n');
}

function tierSection(tier, driftFiles) {
  if (!tier) return [];
  const out = ['## Review tier', tier];
  if (tier === 'none') out.push('', 'No review ran: nothing in the PR changed since the last reviewed commit.');
  else if (tier !== 'full') out.push('', 'Incremental: the files and checks below cover only changes since the last reviewed commit.');
  if (tier === 'base-drift') out.push('', 'Counterpart files changed on the base branch:', list(driftFiles.slice(0, MAX_PER_CHECK)));
  return [...out, ''];
}

export function buildFacts({ files = [], routeResult, results = [], prContext = '', title, tier, driftFiles = [] }) {
  const head = [
    '# Pre-check facts',
    '',
    ...tierSection(tier, driftFiles),
    `Changed files: ${files.length}`,
    '',
    '## Packages',
    list(routeResult.packages),
    '',
    '## Link types',
    list(routeResult.linkTypes),
    '',
    '## Checklist classes',
    list(routeResult.classes),
    '',
  ].join('\n');
  const titleLine = `PR title: ${clip(redact(String(title ?? '')).replace(/\s+/g, ' ').trim() || 'unavailable', MAX_TITLE)}`;
  const context = `\n\n## PR context\n${titleLine}\n\n${clip(prContext || 'PR context unavailable', MAX_CONTEXT)}\n`;
  const budget = MAX_BYTES - bytes(head) - bytes(context) - bytes('## Facts\n') - 100;
  const body = results.map(renderResult).filter(Boolean).join('\n') || '- none';
  let facts = body;
  if (bytes(facts) > budget) {
    const kept = [];
    let used = 0;
    const note = '- ... more omitted (output cap)';
    for (const line of body.split('\n')) {
      if (used + bytes(line) + 1 + bytes(note) > budget) break;
      kept.push(line);
      used += bytes(line) + 1;
    }
    facts = [...kept, note].join('\n');
  }
  return `${head}\n## Facts\n${facts}${context}`;
}

// Only maintainers' words reach the model: the repo is public, so any other
// commenter could otherwise plant instructions in the PR context.
export const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const trusted = (x) => TRUSTED_ASSOCIATIONS.has(x?.author_association);

export async function gatherContext(repo, pr, pull, list = listIssueComments) {
  try {
    const body = trusted(pull)
      ? `PR description:\n${redact(String(pull?.body ?? ''))}`
      : 'PR description withheld: the PR author is not a repository maintainer.';
    const comments = (await list(repo, pr)).filter((c) => trusted(c) && !String(c.body ?? '').startsWith(SUMMARY_MARKER));
    const parts = [body];
    for (const c of comments) parts.push(`Comment:\n${redact(String(c.body ?? '')).slice(0, MAX_COMMENT)}`);
    return parts.join('\n\n');
  } catch {
    return 'PR context unavailable';
  }
}

function runChecks({ files, repoRoot, baseSha, headSha, title, verifyScript }) {
  const checks = [
    ['checkExports', () => checkExports(files, repoRoot)],
    ['checkRegion', () => checkRegion(files, repoRoot)],
    ['checkQueriesVsIndexes', () => checkQueriesVsIndexes(files, repoRoot)],
    ['checkStoragePaths', () => checkStoragePaths(files, repoRoot)],
    ['checkCollectionsVsRules', () => checkCollectionsVsRules(files, repoRoot)],
    ['checkTwins', () => checkTwins(files, repoRoot)],
    ['checkSecrets', () => checkSecrets(files)],
    ['checkPiiLogs', () => checkPiiLogs(files)],
    ['checkNewFileSize', () => checkNewFileSize(files, repoRoot)],
    ['checkTitleScope', () => checkTitleScope(title)],
    ['checkSelfEdit', () => checkSelfEdit(files)],
    ['runVerifyDiff', () => runVerifyDiff(baseSha, repoRoot, verifyScript, headSha)],
  ];
  return checks.map(([check, fn]) => {
    try {
      return { check, facts: fn() };
    } catch (error) {
      return { check, error };
    }
  });
}

function tierOutput(tier, maxTurns) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\nmax_turns=${maxTurns}\n`);
}

// The snapshot (STATE_FILE) is a copy outside the model's --add-dir: publish
// trusts only this one, since the model can Write OUT/state.json.
function writeOutputs({ out, stateFile }, text, state) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'facts.md'), text);
  writeFileSync(join(out, 'state.json'), JSON.stringify(state, null, 2));
  try {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state));
    // Read-only from here on; the workflow's cleanup restores write before rm.
    chmodSync(stateFile, 0o444);
    chmodSync(dirname(stateFile), 0o555);
  } catch {
    process.stdout.write('facts: state snapshot unavailable\n');
  }
  tierOutput(state.tier, state.maxTurns);
}

// This run's routed link types (the files it considered) ride in both
// OUT/state.json and the snapshot; publish adds them to linkTypesSeen on success.
export function recordRun(state, tier, routeResult) {
  return Object.assign(state, { tier, maxTurns: MAX_TURNS[tier], runLinkTypes: [...(routeResult?.linkTypes ?? [])] });
}

async function main() {
  const { REPO, PR, BASE_SHA, HEAD_SHA, PR_TITLE } = process.env;
  const run = runPaths();
  if (!run) {
    // Fail closed: no material, no snapshot, and the review step is skipped.
    process.stdout.write('facts failed: OUT or STATE_FILE unset\n');
    tierOutput('none', 0);
    return;
  }
  const { out } = run;
  const state = {
    lastReviewedSha: null,
    lastBaseSha: null,
    ledger: [],
    linkTypesSeen: [],
    runLinkTypes: [],
    inlineSlugs: [],
    // The PR's changed paths: publish posts inline comments only on these.
    changedFiles: [],
    tier: 'full',
    maxTurns: MAX_TURNS.full,
    headSha: HEAD_SHA,
    baseSha: BASE_SHA,
    pr: Number(PR),
    // The inline guard's fallback run start when the workflow's is missing.
    runStartedAt: new Date().toISOString(),
  };
  try {
    Object.assign(state, await loadState(REPO, PR, { listIssueComments, listReviewComments }));
    const repoRoot = process.cwd();
    const prFiles = prDiff(BASE_SHA, HEAD_SHA, repoRoot);
    const paths = [...new Set(prFiles.flatMap((f) => [f.oldFile, f.file]).filter(Boolean))];
    state.changedFiles = paths.slice(0, MAX_CHANGED);
    const inc = computeIncrement({ ...state, baseSha: BASE_SHA, headSha: HEAD_SHA, prPaths: paths, cwd: repoRoot });
    const tier = classify({ ...state, ...inc, prFileCount: paths.length });
    const files = tier === 'full' ? prFiles : inc.incrementDiff;
    const factPaths = [...new Set(files.flatMap((f) => [f.oldFile, f.file]).filter(Boolean))];
    const verifyScript = join(dirname(fileURLToPath(import.meta.url)), '../../agent-gates/verify-diff.sh');
    const results = tier === 'none' ? [] : runChecks({ files, repoRoot, baseSha: BASE_SHA, headSha: HEAD_SHA, title: PR_TITLE, verifyScript });
    let pull = null;
    try {
      pull = await ghRequest('GET', `/repos/${REPO}/pulls/${PR}`);
    } catch {
      pull = null;
    }
    const prContext = pull ? await gatherContext(REPO, PR, pull) : 'PR context unavailable';
    mkdirSync(out, { recursive: true });
    if (tier !== 'none') writeMaterial(out, { baseSha: BASE_SHA, headSha: HEAD_SHA, tier, incrementText: inc.incrementText, cwd: repoRoot });
    const routeResult = route(factPaths);
    recordRun(state, tier, routeResult);
    const text = buildFacts({ files, routeResult, results, prContext, title: PR_TITLE, tier, driftFiles: inc.driftFiles });
    writeOutputs(run, text, state);
  } catch (err) {
    process.stdout.write(`facts failed: ${err?.name ?? 'Error'}\n`);
    const empty = { packages: [], linkTypes: [], classes: [] };
    recordRun(state, 'full', empty);
    try {
      mkdirSync(out, { recursive: true });
      writeMaterial(out, { baseSha: BASE_SHA, headSha: HEAD_SHA, tier: 'full', cwd: process.cwd() });
    } catch {
      // the model reports the missing material
    }
    writeOutputs(run, buildFacts({ routeResult: empty, results: [{ check: 'facts', error: err }], prContext: 'PR context unavailable', title: PR_TITLE, tier: 'full' }), state);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => process.stdout.write('facts failed: Error\n')).finally(() => { process.exitCode = 0; });
}
