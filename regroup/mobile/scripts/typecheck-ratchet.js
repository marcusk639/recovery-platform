#!/usr/bin/env node
/**
 * Typecheck ratchet for regroup/mobile.
 *
 * This package has never been typechecked: there was no script and no CI step,
 * so `tsc --noEmit` reports a large pre-existing error count. Making that a
 * blocking clean-run gate would mean fixing every one before anything else can
 * merge, so instead the count is pinned in .typecheck-baseline and this script
 * fails only when it goes UP.
 *
 * The point is to stop new type errors arriving, not to pretend the existing
 * ones are acceptable. When the count drops, the script says so and asks for
 * the baseline to be lowered — the number is meant to ratchet towards zero.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_PATH = path.join(__dirname, '..', '.typecheck-baseline');

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
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`No baseline at ${BASELINE_PATH}. Create it with the current error count.`);
    process.exit(2);
  }
  const baseline = Number.parseInt(fs.readFileSync(BASELINE_PATH, 'utf8').trim(), 10);
  if (!Number.isInteger(baseline) || baseline < 0) {
    console.error(`Baseline file must hold a non-negative integer, got: ${baseline}`);
    process.exit(2);
  }

  const output = runTsc();
  const errorLines = output.split('\n').filter((l) => /error TS\d+/.test(l));
  const count = errorLines.length;

  console.log(`typecheck errors: ${count} (baseline ${baseline})`);

  if (count > baseline) {
    console.error(
      `\nFAIL: ${count - baseline} new type error(s). Fix them, or justify a raise.\n` +
        `Full tsc output below; the new ones are not marked, so compare against the\n` +
        `baseline by running this on origin/main if you need to narrow it down.\n`,
    );
    console.error(errorLines.join('\n'));
    process.exit(1);
  }

  if (count < baseline) {
    console.log(
      `\n${baseline - count} error(s) fixed. Lower the baseline:\n` +
        `  echo ${count} > regroup/mobile/.typecheck-baseline\n` +
        `Leaving it high lets those errors come back unnoticed.`,
    );
  }
  process.exit(0);
}

main();
