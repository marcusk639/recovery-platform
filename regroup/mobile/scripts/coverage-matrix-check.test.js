const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'coverage-matrix-check.js');
const { parseMatrix, selectRows, validate } = require('./coverage-matrix-check');

const REPO = path.resolve(__dirname, '../../..');
const EXISTING = 'regroup/mobile/maestro/flows/smoke.yaml';
const HEADER =
  '| ID | Area | Action | Role | Platform | Fixture | Kind | Covered by | Guard | Status | Deferred |\n' +
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';

const row = (o = {}) => {
  const r = {
    id: 'AUTH-001',
    area: 'Auth',
    action: 'Sign in',
    role: 'resident',
    platform: 'both',
    fixture: 'clean',
    kind: 'maestro',
    coveredBy: EXISTING,
    guard: 'none',
    status: 'pass',
    deferred: '—',
    ...o,
  };
  return `| ${[r.id, r.area, r.action, r.role, r.platform, r.fixture, r.kind, r.coveredBy, r.guard, r.status, r.deferred].join(' | ')} |\n`;
};
const matrix = (...rows) => `# Coverage\n\nIntro.\n\n## Rows\n\n${HEADER}${rows.join('')}`;
const check = (md, opts = {}) => {
  const rows = parseMatrix(md);
  return validate(rows, {
    repoRoot: REPO,
    release: false,
    ...opts,
    selected: opts.selected?.(rows),
  });
};

describe('parseMatrix', () => {
  it('reads every row under ## Rows into named fields', () => {
    const rows = parseMatrix(
      matrix(row(), row({ id: 'AUTH-002', status: 'missing', coveredBy: '—' })),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'AUTH-001',
      kind: 'maestro',
      coveredBy: EXISTING,
      status: 'pass',
    });
  });
});

describe('validate — structure', () => {
  it('accepts a valid matrix', () => {
    expect(
      check(matrix(row(), row({ id: 'AUTH-002', status: 'missing', coveredBy: '—' }))),
    ).toEqual([]);
  });
  it('reports a duplicate id', () => {
    expect(check(matrix(row(), row()))).toEqual([expect.stringMatching(/AUTH-001: duplicate id/)]);
  });
  it('names the column of an unknown enum value', () => {
    expect(check(matrix(row({ role: 'admin' })))).toEqual([
      expect.stringMatching(/AUTH-001: unknown Role "admin"/),
    ]);
  });
  it.each(['money', 'data'])('refuses to defer a %s row', (guard) => {
    const errs = check(
      matrix(
        row({ guard, status: 'deferred', deferred: 'checklist: needs a device (2026-11-06)' }),
      ),
    );
    expect(errs).toEqual([expect.stringMatching(new RegExp(`cannot defer a ${guard} row`))]);
  });
  it('needs a reason and date to defer', () => {
    expect(check(matrix(row({ status: 'deferred' })))).toEqual([
      expect.stringMatching(/needs reason and date/),
    ]);
  });
  it('reports a covering file that does not exist', () => {
    const errs = check(matrix(row({ coveredBy: 'regroup/mobile/maestro/flows/nope.yaml' })));
    expect(errs).toEqual([expect.stringMatching(/AUTH-001: missing file/)]);
  });
  it('does not check the file of a missing row', () => {
    expect(check(matrix(row({ coveredBy: '—', status: 'missing' })))).toEqual([]);
  });
  it('needs a covering file for a server row that has run', () => {
    const server = { kind: 'server', guard: 'money' };
    expect(check(matrix(row({ ...server, coveredBy: '—' })))).toEqual([
      expect.stringMatching(/AUTH-001: needs Covered by/),
    ]);
    expect(check(matrix(row({ ...server, coveredBy: 'regroup/nope.test.ts' })))).toEqual([
      expect.stringMatching(/AUTH-001: missing file/),
    ]);
    expect(check(matrix(row(server)))).toEqual([]);
  });
  it('cannot defer a money-guarded server row', () => {
    const errs = check(
      matrix(row({ kind: 'server', guard: 'money', status: 'deferred', deferred: 'checklist: x (2026-11-08)' })),
    );
    expect(errs).toEqual([expect.stringMatching(/cannot defer a money row/)]);
  });
});

describe('validate — release', () => {
  it.each(['missing', 'fail'])('fails a %s row by id', (status) => {
    const coveredBy = status === 'missing' ? '—' : EXISTING;
    const errs = check(matrix(row({ status, coveredBy })), { release: true });
    expect(errs).toEqual([
      expect.stringMatching(new RegExp(`AUTH-001: not passing \\(${status}\\)`)),
    ]);
  });
  it('accepts a validly deferred non-money row', () => {
    const md = matrix(
      row({ status: 'deferred', deferred: 'post-launch: chart polish (2026-11-06)' }),
    );
    expect(check(md, { release: true })).toEqual([]);
  });
  it('checks only the selected rows, but structure on all rows', () => {
    const md = matrix(
      row({ id: 'DEVS-001', kind: 'device', coveredBy: '§7.3 push', status: 'missing' }),
      row({ id: 'FLOW-001', status: 'missing', coveredBy: '—' }),
    );
    const sel = (rows) => selectRows(rows, { excludeKinds: ['device'] });
    expect(check(md, { release: true, selected: sel })).toEqual([
      expect.stringMatching(/FLOW-001: not passing/),
    ]);
  });
  it('still reports a structural error in a row the filter excludes', () => {
    const dup = row({ id: 'DEVS-001', kind: 'device', coveredBy: 'x', status: 'missing' });
    const sel = (rows) => selectRows(rows, { excludeKinds: ['device'] });
    expect(check(matrix(dup, dup, row()), { release: true, selected: sel })).toEqual([
      expect.stringMatching(/DEVS-001: duplicate id/),
    ]);
  });
});

describe('selectRows', () => {
  const rows = parseMatrix(
    matrix(
      row({ id: 'DEVS-001', kind: 'device' }),
      row({ id: 'DEVP-001', kind: 'device' }),
      row({ id: 'FLOW-001' }),
    ),
  );
  it('returns every row with no options', () => {
    expect(selectRows(rows, {})).toHaveLength(3);
  });
  it('drops device rows with excludeKinds', () => {
    expect(selectRows(rows, { excludeKinds: ['device'] }).map((r) => r.id)).toEqual(['FLOW-001']);
  });
  it('keeps only staging-pass device rows with kinds + idPrefix', () => {
    expect(selectRows(rows, { kinds: ['device'], idPrefix: 'DEVS-' }).map((r) => r.id)).toEqual([
      'DEVS-001',
    ]);
  });
  it('throws on an unknown kind', () => {
    expect(() => selectRows(rows, { kinds: ['devise'] })).toThrow(/unknown kind "devise"/);
  });
});

describe('CLI', () => {
  let dir;
  let file;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-'));
    file = path.join(dir, 'm.md');
    fs.writeFileSync(
      file,
      matrix(row(), row({ id: 'DEVS-001', kind: 'device', coveredBy: 'x', status: 'missing' })),
    );
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (...args) =>
    spawnSync('node', [SCRIPT, '--file', file, ...args], { encoding: 'utf8' });

  it('exits 0 and prints counts for a valid matrix', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/pass: 1/);
  });
  it('exits 1 in release mode while a selected row is missing', () => {
    expect(run('--release').status).toBe(1);
  });
  it('exits 0 in release mode when the filter excludes the missing row', () => {
    expect(run('--release', '--exclude-kinds', 'device').status).toBe(0);
  });
  it('exits 1 for an unknown kind', () => {
    expect(run('--kinds', 'devise').status).toBe(1);
  });
  it('exits 1 when the filter selects no rows', () => {
    expect(run('--kinds', 'device', '--id-prefix', 'DEVP-').status).toBe(1);
  });
});

describe('gate integrity', () => {
  it('requires device rows to use a DEVS- or DEVP- id', () => {
    const errs = check(matrix(row({ id: 'LINK-004', kind: 'device', coveredBy: 'x', status: 'missing' })));
    expect(errs).toEqual([expect.stringMatching(/LINK-004: device rows need a DEVS- or DEVP- id/)]);
  });

  it('requires DEVS-/DEVP- rows to be Kind device', () => {
    expect(check(matrix(row({ id: 'DEVS-009' })))).toEqual([expect.stringMatching(/DEVS-009: .*must be Kind device/)]);
  });

  it('refuses a Rows table whose header is not the column list', () => {
    const md = `## Rows\n\n${row()}| --- | --- |\n${row({ id: 'AUTH-002' })}`;
    expect(() => parseMatrix(md)).toThrow(/header must be/);
  });

  it('refuses a row line outside the Rows table', () => {
    const md = `${matrix(row())}\n## Later\n\n${HEADER}${row({ id: 'AUTH-002' })}`;
    expect(() => parseMatrix(md)).toThrow(/AUTH-002.*outside the Rows table/);
  });
});
