/**
 * Drift guard for the two hand-maintained copies of money.ts.
 *
 * functions/src/util/money.ts and mobile/src/util/money.ts share no package, so
 * nothing but this test stops one being edited without the other. The brands are
 * structural: a divergence is a silent loss of protection, not a build failure.
 *
 * What is compared: the whole file as TypeScript syntax, printed with comments
 * removed. Types (the brands, the asCents/asDollars conditional parameters) are
 * part of the comparison, because they are the point. Comments, blank lines and
 * formatting are deliberately NOT compared, since the two headers are worded for
 * different audiences. If a platform-specific import or helper ever has to differ,
 * move it out of money.ts rather than weakening this test.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const FUNCTIONS_COPY = path.resolve(__dirname, '../../util/money.ts');
const MOBILE_COPY = path.resolve(__dirname, '../../../../mobile/src/util/money.ts');

function normalized(file: string): string {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  return ts.createPrinter({ removeComments: true }).printFile(source);
}

describe('money.ts mirrors', () => {
  it('both copies exist', () => {
    expect(fs.existsSync(FUNCTIONS_COPY)).toBe(true);
    expect(fs.existsSync(MOBILE_COPY)).toBe(true);
  });

  it('have not drifted apart (code and types, ignoring comments and formatting)', () => {
    expect(normalized(MOBILE_COPY)).toBe(normalized(FUNCTIONS_COPY));
  });
});
