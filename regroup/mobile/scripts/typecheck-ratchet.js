#!/usr/bin/env node
/**
 * Typecheck ratchet for regroup/mobile.
 *
 * This package has never been typechecked: there was no script and no CI step,
 * so `tsc --noEmit` reports a large pre-existing error count. Making that a
 * blocking clean-run gate would mean fixing every one before anything else can
 * merge, so instead the known errors are pinned in .typecheck-baseline and this
 * script fails only when an error appears that is not in it.
 *
 * The baseline lists error IDENTITIES, one per line, not a total. A bare count
 * is masked the moment an old error is fixed: fix one, introduce one, and the
 * total still passes. An identity is `<file>: <TS code>: <message>`, with the
 * line and column left out so unrelated edits that shift a known error do not
 * look like a new one. The same identity can occur more than once in a file;
 * the baseline repeats it, and the comparison is by multiplicity.
 *
 * The point is to stop new type errors arriving, not to pretend the existing
 * ones are acceptable. When errors are fixed, the script says so and asks for
 * the baseline to be regenerated, so the list ratchets towards empty:
 *   node scripts/typecheck-ratchet.js --update
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_PATH = path.join(__dirname, '..', '.typecheck-baseline');

const PKG_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '..', '..');

/**
 * Strip machine-specific absolute paths out of an error identity.
 *
 * tsc embeds absolute paths INSIDE some messages, e.g.
 *   Argument of type 'import("/home/runner/work/.../navigation/types").Routes'
 * The prefix differs between a developer machine and CI, so an identity
 * carrying one can never match across them: the count agrees while five
 * entries look simultaneously added and removed. Both sides are normalised
 * here, at parse time, so a baseline written anywhere compares anywhere.
 * Longest root first — PKG_ROOT is inside REPO_ROOT.
 */
function normalisePaths(text) {
  return text.split(PKG_ROOT).join('<pkg>').split(REPO_ROOT).join('<repo>');
}

/** `src/a.ts(12,5): error TS2322: msg` -> `src/a.ts: TS2322: msg`. */
function parseErrors(output) {
  const identities = [];
  for (const line of output.split('\n')) {
    const match = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line.trim());
    if (match) {
      identities.push(
        normalisePaths(`${match[1]}: ${match[2]}: ${match[3].trim()}`),
      );
    }
  }
  return identities.sort();
}

function parseBaseline(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort();
}

/** Multiset difference: entries of `a` left over after removing those in `b`. */
function subtract(a, b) {
  const remaining = new Map();
  for (const id of b) {
    remaining.set(id, (remaining.get(id) || 0) + 1);
  }
  const extra = [];
  for (const id of a) {
    const n = remaining.get(id) || 0;
    if (n > 0) {
      remaining.set(id, n - 1);
    } else {
      extra.push(id);
    }
  }
  return extra;
}

function runTsc() {
  try {
    execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (err) {
    // tsc exits non-zero when it finds errors; that is the normal path here.
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

function main() {
  const current = parseErrors(runTsc());

  if (process.argv.includes('--update')) {
    fs.writeFileSync(BASELINE_PATH, current.map((l) => `${l}\n`).join(''));
    console.log(`Wrote ${current.length} error(s) to ${BASELINE_PATH}`);
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `No baseline at ${BASELINE_PATH}. Create it with: node scripts/typecheck-ratchet.js --update`,
    );
    process.exit(2);
  }
  const baseline = parseBaseline(fs.readFileSync(BASELINE_PATH, 'utf8'));

  const added = subtract(current, baseline);
  const fixed = subtract(baseline, current);

  console.log(`typecheck errors: ${current.length} (baseline ${baseline.length})`);

  if (added.length > 0) {
    console.error(
      `\nFAIL: ${added.length} type error(s) not in the baseline. Fix them, or justify\n` +
        `adding them to regroup/mobile/.typecheck-baseline:\n`,
    );
    console.error(added.join('\n'));
    process.exit(1);
  }

  if (fixed.length > 0) {
    console.log(
      `\n${fixed.length} baseline error(s) no longer occur. Regenerate the baseline:\n` +
        `  cd regroup/mobile && node scripts/typecheck-ratchet.js --update\n` +
        `Leaving them listed lets those errors come back unnoticed.`,
    );
  }
  process.exit(0);
}

module.exports = { parseErrors, parseBaseline, subtract, normalisePaths };

if (require.main === module) {
  main();
}
