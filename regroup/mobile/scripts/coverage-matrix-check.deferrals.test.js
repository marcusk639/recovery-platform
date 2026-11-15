/**
 * scripts/coverage-matrix-check.js: the launch gates' matrix checker (#176).
 * Runs main() against the real matrix, or a copy with one row changed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main } = require('./coverage-matrix-check');

const MATRIX = path.join(__dirname, '..', 'docs', 'e2e', 'coverage-matrix.md');

let stderr;
let stdout;
beforeEach(() => {
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  stderr.mockRestore();
  stdout.mockRestore();
});
const errText = () => stderr.mock.calls.map(([s]) => s).join('');

/**
 * A copy of the real matrix with one passing `none`-guard row deferred for
 * `reason`. A passing row has its Covered by file, so only the deferral is new.
 */
function matrixDeferring(reason) {
  const lines = fs.readFileSync(MATRIX, 'utf8').split('\n');
  const i = lines.findIndex((l) => /^\| [A-Z]+-\d{3} /.test(l) && /\| none +\| pass +\|/.test(l));
  const cells = lines[i].split('|');
  // Cells: '', ID, Area, Action, Role, Platform, Fixture, Kind, Covered by, Guard, Status, Deferred, ''
  deferredId = cells[1].trim();
  cells[10] = ' deferred ';
  cells[11] = ` ${reason} `;
  lines[i] = cells.join('|');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-')), 'matrix.md');
  fs.writeFileSync(file, lines.join('\n'));
  return file;
}
let deferredId;

describe('coverage-matrix-check arguments', () => {
  it('passes the real matrix', () => {
    expect(main([])).toBe(0);
  });

  it.each(['--kinds', '--exclude-kinds', '--id-prefix', '--file'])(
    'refuses %s with no value instead of crashing or ignoring it',
    (flag) => {
      expect(main([flag])).toBe(1);
      expect(errText()).toContain(`${flag} needs a value`);
    },
  );

  it('refuses a flag where a value should be', () => {
    expect(main(['--id-prefix', '--release'])).toBe(1);
    expect(errText()).toContain('--id-prefix needs a value');
  });

  it('still filters by a given id prefix', () => {
    expect(main(['--kinds', 'device', '--id-prefix', 'DEVS-'])).toBe(0);
    expect(stdout.mock.calls.join('')).toMatch(/coverage-matrix: \d+ rows/);
  });
});

describe('checklist deferrals', () => {
  it('accepts one that cites an existing device-pass row', () => {
    expect(main(['--file', matrixDeferring('checklist: covered by DEVS-001 (2026-11-14)')])).toBe(
      0,
    );
  });

  it('refuses one that cites no DEVS-/DEVP- row', () => {
    expect(main(['--file', matrixDeferring('checklist: checked by hand (2026-11-14)')])).toBe(1);
    expect(errText()).toContain(
      `${deferredId}: a checklist deferral must cite an existing DEVS- or DEVP- row`,
    );
  });

  it('refuses one that cites a device row that does not exist', () => {
    expect(main(['--file', matrixDeferring('checklist: covered by DEVS-999 (2026-11-14)')])).toBe(
      1,
    );
    expect(errText()).toContain(
      `${deferredId}: a checklist deferral must cite an existing DEVS- or DEVP- row`,
    );
  });

  it('leaves post-launch deferrals as they were', () => {
    expect(main(['--file', matrixDeferring('post-launch: owner decision (2026-11-14)')])).toBe(0);
  });
});
