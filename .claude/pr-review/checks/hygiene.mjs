import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECRET_PATTERNS, redact } from './lib/redact.mjs';

const CODE = /\.(?:ts|tsx|js|jsx|mjs)$/;
const PII = /email|clientEmail|clientName|displayName|phone|sobrietyDate|address|request\.data|req\.body/;
const LOG_CALL = /\b(?:logger|console)\./;
const SELF_EDIT = /^(?:\.github\/workflows\/claude-code-review\.yml|\.claude\/pr-review\/.*)$/;

const fact = (check, file, line, note) => {
  const f = { check, file, note: redact(note) };
  if (line != null) f.line = line;
  return f;
};

export function checkSecrets(files) {
  const facts = [];
  for (const f of files) {
    if (f.binary) continue;
    for (const a of f.added) {
      if (SECRET_PATTERNS.some((re) => ((re.lastIndex = 0), re.test(a.text)))) {
        facts.push(fact('secrets', f.file, a.line, 'added line matches a secret pattern; rotate and remove it'));
      }
    }
  }
  return facts;
}

export function checkPiiLogs(files) {
  const facts = [];
  for (const f of files) {
    if (f.binary) continue;
    f.added.forEach((a, i) => {
      if (!LOG_CALL.test(a.text)) return;
      const window = f.added.slice(i, i + 4).filter((w) => w.line - a.line <= 3);
      if (window.some((w) => PII.test(w.text))) {
        facts.push(fact('pii-logs', f.file, a.line, 'log statement near a PII-named field; confirm no PII is logged'));
      }
    });
  }
  return facts;
}

export function checkNewFileSize(files, repoRoot) {
  const facts = [];
  for (const f of files) {
    if (f.status !== 'A' || f.binary || !CODE.test(f.file)) continue;
    const p = join(repoRoot, f.file);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const lines = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    if (lines > 300) facts.push(fact('file-size', f.file, null, `new file is ${lines} lines (limit 300); split into modules`));
  }
  return facts;
}

export function checkTitleScope(title) {
  const m = /^\w+\(([^)]*)\)!?:/.exec(String(title ?? ''));
  if (m && /^(?:mobile|web|functions)$/.test(m[1])) {
    return [fact('title-scope', 'PR title', null, `scope '${m[1]}' is bare; name the product, e.g. regroup-${m[1]}`)];
  }
  return [];
}

export function checkSelfEdit(files) {
  return files
    .filter((f) => SELF_EDIT.test(f.file) || (f.oldFile && SELF_EDIT.test(f.oldFile)))
    .map((f) => fact('self-edit', f.file, null, 'PR edits the review agent itself; its own scripts run from the base SHA, not this change'));
}

export function runVerifyDiff(baseSha, repoRoot, scriptPath) {
  if (!scriptPath || !existsSync(scriptPath)) return [];
  let out;
  try {
    execFileSync('bash', [scriptPath, baseSha], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return [];
  } catch (err) {
    if (err.status !== 1) throw err;
    out = String(err.stdout ?? '');
  }
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => fact('verify-diff', 'verify-diff.sh', null, l));
}
