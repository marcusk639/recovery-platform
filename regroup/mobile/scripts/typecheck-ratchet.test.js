const path = require('path');
const { parseErrors, parseBaseline, subtract , normalisePaths} = require('./typecheck-ratchet');

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
    const line = "src/a.ts(1,1): error TS2322: bad.";
    const baseline = parseBaseline("src/a.ts: TS2322: bad.\n");
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
      "src/screens/Contacts/ContactScreen.tsx: TS2345: Argument of type " +
        "'import(\"<pkg>/src/navigation/types\").Routes' is not assignable.",
    ]);
    expect(parsed[0]).not.toContain(pkgRoot);
  });

  it('normalisePaths leaves text without an absolute path untouched', () => {
    expect(normalisePaths("src/a.ts: TS2322: Type 'string' is not assignable.")).toBe(
      "src/a.ts: TS2322: Type 'string' is not assignable.",
    );
  });
});
