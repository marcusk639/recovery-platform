// scripts/deploy-batched.sh deploys only the names in ALL_FUNCTIONS: an
// endpoint left off is silently never deployed. Compare that list with every
// Cloud Functions endpoint src/index.ts exports, read statically with the
// TypeScript checker (an export with an __endpoint property is a function).
import * as fs from 'fs';
import * as path from 'path';
// typescript is a devDependency: this test reads the exports statically.
// tslint:disable-next-line:no-implicit-dependencies
import * as ts from 'typescript';

it('deploy-batched.sh ALL_FUNCTIONS lists exactly the exported endpoints', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '../../../scripts/deploy-batched.sh'),
    'utf8',
  );
  // Shell comments are dropped before the list is read, so a comment inside
  // ALL_FUNCTIONS (even one containing ")") is ignored. A "#" only starts a
  // comment at line start or after whitespace, as in bash (${#arr[@]} stays).
  const uncommented = script.replace(/(^|\s)#.*$/gm, '$1');
  const listed = uncommented.match(/ALL_FUNCTIONS=\(([^)]*)\)/)![1].split(/\s+/);
  const entry = path.join(__dirname, '../index.ts');
  const program = ts.createProgram([entry], {
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const exported = checker
    .getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry)!)!)
    .filter((s) => checker.getTypeOfSymbol(s).getProperty('__endpoint'))
    .map((s) => s.getName());
  expect(exported.length).toBeGreaterThan(50);
  expect(listed.filter(Boolean).sort()).toEqual(exported.sort());
}, 120_000);
