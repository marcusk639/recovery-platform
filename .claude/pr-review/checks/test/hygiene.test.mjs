import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { redact, SECRET_PATTERNS } from '../lib/redact.mjs';
import {
  checkSecrets,
  checkPiiLogs,
  checkNewFileSize,
  checkTitleScope,
  checkSelfEdit,
  runVerifyDiff,
} from '../hygiene.mjs';

// Secret-shaped fixtures are built at runtime so the repo secret scan never sees a literal.
const FAKE_WHSEC = 'whsec' + '_' + 'A'.repeat(16);
const FAKE_SK_TEST = 'sk' + '_test_' + 'x'.repeat(24);
const FAKE_AKIA = 'AKIA' + 'B'.repeat(16);
const FAKE_GH = 'gh' + 'p_' + 'c'.repeat(24);
const FAKE_PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

const file = (over) => ({ file: 'a.ts', oldFile: 'a.ts', status: 'M', binary: false, added: [], removed: [], ...over });
const add = (...texts) => texts.map((text, i) => ({ line: i + 1, text }));

let root;
before(() => {
  root = mkdtempSync(join(tmpdir(), 'hygiene-'));
  const put = (p, c) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  };
  put('big.ts', 'x\n'.repeat(301));
  put('small.ts', 'x\n'.repeat(10));
  put('big.md', 'x\n'.repeat(400));
  put('fail.sh', 'echo "violation one"\necho "violation two"\nexit 1\n');
  put('ok.sh', 'exit 0\n');
});
after(() => rmSync(root, { recursive: true, force: true }));

test('redact truncates a secret to its first 6 chars plus ellipsis', () => {
  assert.equal(redact('k=' + FAKE_WHSEC), 'k=whsec_…');
});

test('redact covers each pattern family and is pure on clean text', () => {
  for (const s of [FAKE_SK_TEST, FAKE_AKIA, FAKE_GH, FAKE_PEM]) {
    const out = redact('v ' + s + ' end');
    assert.ok(!out.includes(s), s.slice(0, 8));
    assert.ok(out.includes('…'));
  }
  assert.equal(redact('nothing secret here'), 'nothing secret here');
  assert.ok(SECRET_PATTERNS.every((r) => r instanceof RegExp));
});

test('checkSecrets flags an added secret without echoing it', () => {
  const facts = checkSecrets([file({ added: add('const k = "' + FAKE_SK_TEST + '";') })]);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].check, 'secrets');
  assert.equal(facts[0].file, 'a.ts');
  assert.equal(facts[0].line, 1);
  assert.ok(!facts[0].note.includes(FAKE_SK_TEST.slice(0, 7)));
  assert.ok(!facts[0].note.includes(FAKE_SK_TEST.slice(7)));
});

test('checkSecrets skips binary files and clean lines', () => {
  assert.deepEqual(checkSecrets([file({ binary: true, added: add(FAKE_SK_TEST) })]), []);
  assert.deepEqual(checkSecrets([file({ added: add('const a = 1;') })]), []);
});

test('checkPiiLogs flags logger line with email', () => {
  const facts = checkPiiLogs([file({ added: add('logger.info("x", { email });') })]);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].check, 'pii-logs');
});

test('checkPiiLogs flags PII within the next 3 lines only', () => {
  const near = checkPiiLogs([file({ added: add('console.log({', 'a: 1,', 'b: 2,', 'phone: p', '});') })]);
  assert.equal(near.length, 1);
  const far = checkPiiLogs([file({ added: add('console.log({', 'a: 1,', 'b: 2,', 'c: 3,', 'phone: p') })]);
  assert.equal(far.length, 0);
  assert.deepEqual(checkPiiLogs([file({ added: add('const email = x;') })]), []);
});

test('checkNewFileSize flags only new code files over 300 lines', () => {
  const f = checkNewFileSize(
    [
      file({ file: 'big.ts', status: 'A' }),
      file({ file: 'small.ts', status: 'A' }),
      file({ file: 'big.md', status: 'A' }),
      file({ file: 'big.ts', status: 'M' }),
      file({ file: 'missing.ts', status: 'A' }),
    ],
    root,
  );
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'big.ts');
  assert.equal(f[0].check, 'file-size');
});

test('checkTitleScope', () => {
  assert.equal(checkTitleScope('fix(mobile): x').length, 1);
  assert.equal(checkTitleScope('feat(functions): x').length, 1);
  assert.deepEqual(checkTitleScope('fix(regroup-mobile): x'), []);
  assert.deepEqual(checkTitleScope('ci: x'), []);
});

test('checkSelfEdit', () => {
  assert.equal(checkSelfEdit([file({ file: '.claude/pr-review/REVIEW.md' })]).length, 1);
  assert.equal(checkSelfEdit([file({ file: '.github/workflows/claude-code-review.yml' })]).length, 1);
  assert.deepEqual(checkSelfEdit([file({ file: 'regroup/a.ts' })]), []);
});

test('runVerifyDiff: exit 1 yields stdout lines; exit 0 and missing yield []', () => {
  const f = runVerifyDiff('abc', root, join(root, 'fail.sh'));
  assert.equal(f.length, 2);
  assert.equal(f[0].check, 'verify-diff');
  assert.equal(f[0].note, 'violation one');
  assert.deepEqual(runVerifyDiff('abc', root, join(root, 'ok.sh')), []);
  assert.deepEqual(runVerifyDiff('abc', root, join(root, 'nope.sh')), []);
});
