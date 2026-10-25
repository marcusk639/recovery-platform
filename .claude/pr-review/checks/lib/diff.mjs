import { execFileSync } from 'node:child_process';

export function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// "diff --git a/<p> b/<q>": for non-renames p === q, which disambiguates paths
// containing spaces. Renames are corrected later from rename from/to lines.
function headerPaths(rest) {
  if (!rest.startsWith('a/')) return { oldFile: rest, file: rest };
  for (let i = rest.indexOf(' b/'); i !== -1; i = rest.indexOf(' b/', i + 1)) {
    const a = rest.slice(2, i);
    const b = rest.slice(i + 3);
    if (a === b) return { oldFile: a, file: b };
  }
  const i = rest.lastIndexOf(' b/');
  return i === -1 ? { oldFile: rest, file: rest } : { oldFile: rest.slice(2, i), file: rest.slice(i + 3) };
}

const stripTab = (s) => s.replace(/\t.*$/, '');

export function parseUnifiedDiff(text) {
  const files = [];
  let cur = null;
  let oldLeft = 0;
  let newLeft = 0;
  let newLine = 0;
  for (const line of text.split('\n')) {
    if (cur && (oldLeft > 0 || newLeft > 0)) {
      const c = line[0];
      if (c === '+') {
        cur.added.push({ line: newLine++, text: line.slice(1) });
        newLeft--;
        continue;
      }
      if (c === '-') {
        oldLeft--;
        continue;
      }
      if (c === ' ' || line === '') {
        oldLeft--;
        newLeft--;
        newLine++;
        continue;
      }
      if (c === '\\') continue;
      oldLeft = newLeft = 0;
    }
    if (line.startsWith('diff --git ')) {
      cur = { ...headerPaths(line.slice(11)), status: 'M', binary: false, added: [] };
      files.push(cur);
    } else if (!cur) {
      continue;
    } else if (line.startsWith('new file mode')) cur.status = 'A';
    else if (line.startsWith('deleted file mode')) cur.status = 'D';
    else if (line.startsWith('rename from ')) {
      cur.status = 'R';
      cur.oldFile = line.slice(12);
    } else if (line.startsWith('rename to ')) cur.file = line.slice(10);
    else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) cur.binary = true;
    else if (line.startsWith('--- a/')) cur.oldFile = stripTab(line.slice(6));
    else if (line.startsWith('+++ b/')) cur.file = stripTab(line.slice(6));
    else {
      const m = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m) {
        oldLeft = m[1] === undefined ? 1 : Number(m[1]);
        newLine = Number(m[2]);
        newLeft = m[3] === undefined ? 1 : Number(m[3]);
      }
    }
  }
  // A deleted file is identified by its old path.
  for (const f of files) if (f.status === 'D') f.file = f.oldFile;
  return files;
}

export function prDiff(baseSha, headSha, cwd) {
  return parseUnifiedDiff(git(['diff', '-M', '--no-color', `${baseSha}...${headSha}`], cwd));
}
