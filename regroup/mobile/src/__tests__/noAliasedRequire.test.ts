/**
 * Guards against "optional" requires hidden from Metro by aliasing `require`.
 *
 * In a release bundle Metro's require() reports an unknown module (outside
 * module initialisation) through ErrorUtils.reportFatalError instead of
 * throwing to the caller, so a surrounding try/catch never runs. Install the
 * package and import it statically instead.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const ALIASED_REQUIRE = /[=]\s*require\s+as\b|=\s*require\s*;|\(\s*require\s*\)\s*\(/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === '__mocks__' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('no aliased require in app source', () => {
  it('finds no `require` aliased to a value', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => ALIASED_REQUIRE.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
