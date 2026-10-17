const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseErrors, parseBaseline, subtract, normalisePaths } = require('./typecheck-ratchet');

const SCRIPT = path.join(__dirname, 'typecheck-ratchet.js');

/**
 * Runs the real script in a throwaway package whose `npx` is a stub, so the
 * gate's exit code can be asserted without invoking tsc. Launched from the
 * temp root rather than the package dir, which is also how a caller reaches
 * the cwd-dependent paths.
 */
function runGate({ tscOut = '', tscExit = 0, baseline = '', args = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'));
  const pkg = path.join(root, 'regroup', 'mobile');
  fs.mkdirSync(path.join(pkg, 'scripts'), { recursive: true });
  const script = path.join(pkg, 'scripts', 'typecheck-ratchet.js');
  fs.copyFileSync(SCRIPT, script);
  const baselinePath = path.join(pkg, '.typecheck-baseline');
  fs.writeFileSync(baselinePath, baseline);

  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const emit = tscOut ? `cat <<'TSCEOF'\n${tscOut}\nTSCEOF\n` : '';
  fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\n${emit}exit ${tscExit}\n`, { mode: 0o755 });

  let status = 0;
  let output = '';
  try {
    output = execFileSync(process.execPath, [script, ...args], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = err.status;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }
  return { status, output, baseline: fs.readFileSync(baselinePath, 'utf8') };
}

const KNOWN = "src/a.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'.";
const KNOWN_ID = "src/a.ts: TS2322: Type 'string' is not assignable to type 'number'.\n";

describe('typecheck ratchet gate', () => {
  it('passes when every reported error is already pinned', () => {
    expect(runGate({ tscOut: KNOWN, tscExit: 1, baseline: KNOWN_ID }).status).toBe(0);
  });

  it('fails when an error appears that is not pinned', () => {
    const result = runGate({
      tscOut: `${KNOWN}\nsrc/new.ts(2,2): error TS9999: Brand new.`,
      tscExit: 1,
      baseline: KNOWN_ID,
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain('src/new.ts: TS9999: Brand new.');
  });

  // The gate's whole value is that it cannot be satisfied by not running. A
  // zero error count from a tsc that never started would otherwise compare as
  // "every pinned error is fixed" and exit 0 over an unchecked tree.
  it('refuses to render a verdict when tsc could not start', () => {
    const result = runGate({ tscOut: '', tscExit: 127, baseline: KNOWN_ID });
    expect(result.status).toBe(2);
    expect(result.baseline).toBe(KNOWN_ID);
  });

  it('refuses to render a verdict when tsc reports no file-anchored error', () => {
    const result = runGate({
      tscOut: 'error TS18003: No inputs were found in config file.',
      tscExit: 1,
      baseline: KNOWN_ID,
    });
    expect(result.status).toBe(2);
    expect(result.baseline).toBe(KNOWN_ID);
  });

  it('--update will not silently replace a populated baseline with an empty one', () => {
    const result = runGate({ tscExit: 0, baseline: KNOWN_ID, args: ['--update'] });
    expect(result.status).toBe(2);
    expect(result.baseline).toBe(KNOWN_ID);
  });

  it('--update --force is the way to empty it on purpose', () => {
    const result = runGate({
      tscExit: 0,
      baseline: KNOWN_ID,
      args: ['--update', '--force'],
    });
    expect(result.status).toBe(0);
    expect(result.baseline).toBe('');
  });
});

const out = [
  "src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
  "  Type 'string' is not assignable to type 'number'.",
  "src/b.ts(3,1): error TS2304: Cannot find name 'x'.",
].join('\n');

describe('typecheck ratchet identities', () => {
  it('drops line and column, keeps file, code and message, ignores continuation lines', () => {
    expect(parseErrors(out)).toEqual([
      "src/a.ts: TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts: TS2304: Cannot find name 'x'.",
    ]);
  });

  it('an error that only moved lines is not new', () => {
    const moved = out.replace('(10,5)', '(42,5)');
    expect(subtract(parseErrors(moved), parseErrors(out))).toEqual([]);
  });

  it('fixing one error while adding another is caught, which a bare count would miss', () => {
    const baseline = parseErrors(out);
    const swapped = parseErrors(
      "src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
        "src/c.ts(1,1): error TS2551: Property 'y' does not exist.",
    );
    expect(swapped).toHaveLength(baseline.length);
    expect(subtract(swapped, baseline)).toEqual(["src/c.ts: TS2551: Property 'y' does not exist."]);
    expect(subtract(baseline, swapped)).toEqual(["src/b.ts: TS2304: Cannot find name 'x'."]);
  });

  it('compares by multiplicity: a second copy of a known error is new', () => {
    const line = 'src/a.ts(1,1): error TS2322: bad.';
    const baseline = parseBaseline('src/a.ts: TS2322: bad.\n');
    expect(subtract(parseErrors(`${line}\n${line.replace('(1,1)', '(9,1)')}`), baseline)).toEqual([
      'src/a.ts: TS2322: bad.',
    ]);
  });

  it('strips the absolute path tsc embeds in a message, so CI matches a local baseline', () => {
    // tsc writes the ABSOLUTE path of an imported module inside some messages.
    // Left in, the identity encodes the machine: a baseline written on a laptop
    // reports those errors as both added and removed in CI, while the total
    // agrees. That is exactly how this gate failed on PR #85.
    const pkgRoot = path.resolve(__dirname, '..');
    const withAbs =
      `src/screens/Contacts/ContactScreen.tsx(10,5): error TS2345: ` +
      `Argument of type 'import("${pkgRoot}/src/navigation/types").Routes' is not assignable.`;
    const parsed = parseErrors(withAbs);

    expect(parsed).toEqual([
      'src/screens/Contacts/ContactScreen.tsx: TS2345: Argument of type ' +
        '\'import("<pkg>/src/navigation/types").Routes\' is not assignable.',
    ]);
    expect(parsed[0]).not.toContain(pkgRoot);
  });

  it('normalisePaths leaves text without an absolute path untouched', () => {
    expect(normalisePaths("src/a.ts: TS2322: Type 'string' is not assignable.")).toBe(
      "src/a.ts: TS2322: Type 'string' is not assignable.",
    );
  });
});
