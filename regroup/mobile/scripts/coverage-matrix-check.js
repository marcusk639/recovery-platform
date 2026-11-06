#!/usr/bin/env node
/**
 * Validates docs/e2e/coverage-matrix.md, the launch acceptance checklist
 * (regroup launch design §4.3, §9), and gates each phase on it.
 *
 *   node scripts/coverage-matrix-check.js [--release] [--kinds a,b] [--exclude-kinds a,b]
 *                                         [--id-prefix P] [--file <matrix.md>]
 *
 * Structure is checked on every row. With --release, every *selected* row must
 * be `pass` or validly `deferred`. Gates (launch roadmap): P6 `--release
 * --exclude-kinds device`; P7 `--release --kinds device --id-prefix DEVS-`;
 * before launch step 10.5 `--release` with no filter.
 */
const fs = require('fs');
const path = require('path');

const COLUMNS = [
  ['id', 'ID'],
  ['area', 'Area'],
  ['action', 'Action'],
  ['role', 'Role'],
  ['platform', 'Platform'],
  ['fixture', 'Fixture'],
  ['kind', 'Kind'],
  ['coveredBy', 'Covered by'],
  ['guard', 'Guard'],
  ['status', 'Status'],
  ['deferred', 'Deferred'],
];
const ENUMS = {
  role: ['signed-out', 'operator', 'manager', 'resident', 'oxford', 'any'],
  platform: ['ios', 'android', 'both', 'web'],
  fixture: ['clean', 'legacy', 'both', 'n/a'],
  kind: ['maestro', 'playwright', 'staging', 'device', 'unit'],
  guard: ['money', 'data', 'none'],
  status: ['pass', 'fail', 'missing', 'deferred'],
};
const NONE = '—';
const DEFERRAL = /^(checklist|post-launch): .+ \(\d{4}-\d{2}-\d{2}\)$/;
const FILE_KINDS = ['maestro', 'playwright', 'staging', 'unit'];

function parseMatrix(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^##\s+Rows\s*$/.test(l));
  if (start < 0) {
    throw new Error('no "## Rows" heading');
  }
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (line.trim().startsWith('|')) table.push(line.trim());
  }
  // table[0] is the header, table[1] the separator.
  return table.slice(2).map((line, i) => {
    const cells = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    const r = { line: i + 1, cellCount: cells.length };
    COLUMNS.forEach(([key], j) => {
      r[key] = cells[j] ?? '';
    });
    return r;
  });
}

function selectRows(rows, { kinds, excludeKinds, idPrefix } = {}) {
  for (const k of [...(kinds || []), ...(excludeKinds || [])]) {
    if (!ENUMS.kind.includes(k)) throw new Error(`unknown kind "${k}"`);
  }
  return rows.filter(
    (r) =>
      (!kinds || kinds.includes(r.kind)) &&
      (!excludeKinds || !excludeKinds.includes(r.kind)) &&
      (!idPrefix || r.id.startsWith(idPrefix)),
  );
}

function structuralErrors(r, repoRoot) {
  const name = r.id || `row ${r.line}`;
  if (r.cellCount !== COLUMNS.length) {
    return [`${name}: expected ${COLUMNS.length} columns, got ${r.cellCount}`];
  }
  const errs = [];
  if (!/^[A-Z]+-\d{3}$/.test(r.id)) errs.push(`${name}: id must look like AREA-NNN`);
  for (const [key, label] of COLUMNS) {
    if (ENUMS[key] && !ENUMS[key].includes(r[key]))
      errs.push(`${name}: unknown ${label} "${r[key]}"`);
  }
  if (r.status === 'deferred') {
    if (r.guard === 'money' || r.guard === 'data')
      errs.push(`${name}: cannot defer a ${r.guard} row`);
    else if (!DEFERRAL.test(r.deferred)) errs.push(`${name}: deferred needs reason and date`);
  }
  if (r.status !== 'missing' && FILE_KINDS.includes(r.kind)) {
    if (r.coveredBy === NONE) errs.push(`${name}: needs Covered by`);
    else if (!fs.existsSync(path.join(repoRoot, r.coveredBy)))
      errs.push(`${name}: missing file ${r.coveredBy}`);
  }
  return errs;
}

function validate(rows, { repoRoot, release, selected = rows }) {
  const errs = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.id)) errs.push(`${r.id}: duplicate id`);
    seen.add(r.id);
    errs.push(...structuralErrors(r, repoRoot));
  }
  if (release) {
    for (const r of selected) {
      const ok =
        r.status === 'pass' ||
        (r.status === 'deferred' && structuralErrors(r, repoRoot).length === 0);
      if (!ok) errs.push(`${r.id}: not passing (${r.status})`);
    }
  }
  return errs;
}

function main(argv) {
  const opt = { file: path.join(__dirname, '..', 'docs/e2e/coverage-matrix.md') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--release') opt.release = true;
    else if (a === '--kinds') opt.kinds = argv[++i].split(',');
    else if (a === '--exclude-kinds') opt.excludeKinds = argv[++i].split(',');
    else if (a === '--id-prefix') opt.idPrefix = argv[++i];
    else if (a === '--file') opt.file = path.resolve(argv[++i]);
    else {
      process.stderr.write(`unknown argument ${a}\n`);
      return 1;
    }
  }
  const repoRoot = path.resolve(__dirname, '../../..');
  let rows;
  let selected;
  try {
    rows = parseMatrix(fs.readFileSync(opt.file, 'utf8'));
    selected = selectRows(rows, opt);
  } catch (err) {
    process.stderr.write(`coverage-matrix: ${err.message}\n`);
    return 1;
  }
  if (selected.length === 0) {
    process.stderr.write('coverage-matrix: the filter selects no rows\n');
    return 1;
  }
  const counts = ENUMS.status.map((s) => `${s}: ${selected.filter((r) => r.status === s).length}`);
  process.stdout.write(`coverage-matrix: ${selected.length} rows — ${counts.join(', ')}\n`);
  const errs = validate(rows, { repoRoot, release: opt.release, selected });
  errs.forEach((e) => process.stderr.write(`  ${e}\n`));
  return errs.length ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { parseMatrix, selectRows, validate };
