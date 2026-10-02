#!/usr/bin/env node
/**
 * Regenerates regroup/FUNCTION_AUDIT.md from source.
 *
 * The hand-maintained version of that file rotted twice: by 2026-09-28 it listed
 * eight functions that no longer existed, described three implemented ones as
 * "missing", and omitted ~30 others — roughly 45% coverage. This script exists so
 * the inventory is derived rather than remembered.
 *
 * Usage:  node regroup/scripts/generate-function-inventory.js [--check]
 *   --check  exit 1 if the committed file is out of date (for CI / pre-push)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'regroup/functions/src');
const OUT = path.join(REPO, 'regroup/FUNCTION_AUDIT.md');

const TRIGGERS = [
  'onCall', 'onRequest', 'onDocumentCreated', 'onDocumentUpdated',
  'onDocumentWritten', 'onDocumentDeleted', 'onSchedule',
];

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

const re = new RegExp(
  `export const (\\w+)\\s*=\\s*(${TRIGGERS.join('|')})\\s*[(<]`,
  'g',
);

const fns = [];
for (const file of walk(SRC)) {
  const txt = fs.readFileSync(file, 'utf8');
  const rel = path.relative(SRC, file);
  let m;
  while ((m = re.exec(txt)) !== null) {
    const line = txt.slice(0, m.index).split('\n').length;
    const tail = txt.slice(m.index, m.index + 600);
    const schedule = /schedule:\s*["'`]([^"'`]+)["'`]/.exec(tail);
    const tz = /timeZone:\s*["'`]([^"'`]+)["'`]/.exec(tail);
    const docPath = /document:\s*["'`]([^"'`]+)["'`]/.exec(tail)
      || /\(\s*["'`]([\w\-/{}]+\/\{[\w]+\}[\w/{}]*)["'`]/.exec(tail);
    const secrets = /secrets:\s*\[([^\]]+)\]/.exec(tail);
    fns.push({
      name: m[1],
      trigger: m[2],
      file: rel,
      line,
      schedule: schedule ? schedule[1] + (tz ? ` (${tz[1]})` : '') : '',
      doc: docPath ? docPath[1] : '',
      secrets: secrets
        ? secrets[1].replace(/\s+/g, ' ').replace(/,\s*/g, ', ').trim()
        : '',
    });
  }
}

fns.sort((a, b) => a.trigger.localeCompare(b.trigger) || a.name.localeCompare(b.name));

// Deployment surface: a function ships only if index.ts re-exports it, possibly
// transitively (index.ts -> ./scheduled -> ./scheduledRentCollection).
const modulePath = (f) => f.replace(/\.ts$/, '').replace(/\/index$/, '');

// Resolve a module specifier to an actual file under SRC, honouring both
// `foo.ts` and `foo/index.ts` layouts. Returns a path relative to SRC, or null.
function resolveModule(relNoExt) {
  for (const cand of [`${relNoExt}.ts`, `${relNoExt}/index.ts`]) {
    if (fs.existsSync(path.join(SRC, cand))) return cand;
  }
  return null;
}

function collectExports(relFile, seenModules, namedOut) {
  if (!relFile) return;
  const key = modulePath(relFile);
  if (seenModules.has(key)) return;
  seenModules.add(key);

  const txt = fs.readFileSync(path.join(SRC, relFile), 'utf8');
  const dir = path.posix.dirname(relFile); // dir of the RESOLVED file

  for (const m of txt.matchAll(/export \* from ['"]\.\/([^'"]+)['"]/g)) {
    collectExports(resolveModule(path.posix.join(dir, m[1])), seenModules, namedOut);
  }
  for (const m of txt.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) namedOut.add(name);
    }
    collectExports(resolveModule(path.posix.join(dir, m[2])), seenModules, namedOut);
  }
}

const reachableModules = new Set();
const reachableNames = new Set();
collectExports('index.ts', reachableModules, reachableNames);

const isExported = (f) =>
  reachableNames.has(f.name) || reachableModules.has(modulePath(f.file));

const sha = execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim();
const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO }).toString().trim();
const today = new Date().toISOString().slice(0, 10);

const groups = {
  onCall: 'Callable functions (`onCall`)',
  onRequest: 'HTTP endpoints (`onRequest`)',
  onDocumentCreated: 'Firestore triggers — document created',
  onDocumentUpdated: 'Firestore triggers — document updated',
  onDocumentWritten: 'Firestore triggers — document written',
  onDocumentDeleted: 'Firestore triggers — document deleted',
  onSchedule: 'Scheduled functions (`onSchedule`)',
};

let md = `# Regroup Cloud Functions — Inventory

<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Regenerate with: node regroup/scripts/generate-function-inventory.js
     Verify in CI with: node regroup/scripts/generate-function-inventory.js --check -->

**Generated:** ${today}
**Source commit:** \`${sha}\` on \`${branch}\`
**Total functions:** ${fns.length}

All functions run in the default region (us-central1); none sets \`region:\`.
\`regroup/functions/src/init.ts\` applies \`setGlobalOptions({ cpu: 0.167, maxInstances: 2 })\`
as a quota stopgap — see that file's comment for the constraint.

`;

for (const [trig, heading] of Object.entries(groups)) {
  const rows = fns.filter((f) => f.trigger === trig);
  if (!rows.length) continue;
  md += `## ${heading}\n\n`;
  const schedCol = trig === 'onSchedule';
  const docCol = trig.startsWith('onDocument');
  md += `| Function | Source | ${schedCol ? 'Schedule' : docCol ? 'Path' : 'Deployed'} | Secrets |\n`;
  md += `| --- | --- | --- | --- |\n`;
  for (const f of rows) {
    const third = schedCol
      ? (f.schedule ? `\`${f.schedule}\`` : '—')
      : docCol
        ? (f.doc ? `\`${f.doc}\`` : '—')
        : (isExported(f) ? 'yes' : '**not exported**');
    md += `| \`${f.name}\` | \`regroup/functions/src/${f.file}:${f.line}\` | ${third} | ${f.secrets ? `\`${f.secrets}\`` : '—'} |\n`;
  }
  md += '\n';
}

const notExported = fns.filter((f) => !isExported(f));
md += `## Deployment surface\n\n`;
md += notExported.length
  ? `${notExported.length} function(s) are defined but not re-exported from \`index.ts\`, so they are **not deployed**:\n\n${notExported.map((f) => `- \`${f.name}\` — \`regroup/functions/src/${f.file}:${f.line}\``).join('\n')}\n`
  : `All ${fns.length} functions are re-exported from \`regroup/functions/src/index.ts\` and deploy.\n`;
md += `\nNote: \`stripeWebhook\` is deployed under the name \`stripeEvents\` (aliased in \`index.ts\`).\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const strip = (s) => s.replace(/\*\*Generated:\*\* \d{4}-\d{2}-\d{2}/, '')
                        .replace(/\*\*Source commit:\*\*[^\n]*/, '');
  if (strip(current) !== strip(md)) {
    console.error('✗ FUNCTION_AUDIT.md is out of date. Run:');
    console.error('    node regroup/scripts/generate-function-inventory.js');
    process.exit(1);
  }
  console.log('✓ FUNCTION_AUDIT.md is current');
  process.exit(0);
}

fs.writeFileSync(OUT, md);
console.log(`✓ wrote ${path.relative(REPO, OUT)} — ${fns.length} functions`);
