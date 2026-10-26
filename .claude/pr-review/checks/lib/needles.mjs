// Security-file "needles": the full paths of every current security finding's
// locations. Any public text that mentions one is withheld, because it would
// point at the security finding. A mention is the full path anywhere, or a
// path-like token that names it in any form (names(): ./src/index.ts,
// /abs/repo/<path>, src//index.ts, a bare index.ts), but never a different file
// sharing its basename (other/index.ts, index.tsx, index.ts.bak).
// Matching ignores case and treats '\' as '/', after undoing the cheap
// disguises: zero-width characters, HTML entities and percent-escapes for '.',
// '/' and '\'.
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const PATH_CHARS = { 46: '.', 47: '/', 92: '\\' };
const NAMED = { period: '.', sol: '/', bsol: '\\' };

function decodeOnce(s) {
  return s
    .replace(ZERO_WIDTH, '')
    .replace(/&#(\d{1,7});?/g, (m, d) => PATH_CHARS[Number(d)] ?? m)
    .replace(/&#x([0-9a-f]{1,6});?/gi, (m, h) => PATH_CHARS[parseInt(h, 16)] ?? m)
    .replace(/&(period|sol|bsol);/gi, (m, n) => NAMED[n.toLowerCase()])
    .replace(/%(2e|2f|5c)/gi, (m, h) => PATH_CHARS[parseInt(h, 16)]);
}

// Repeats a few times so double-encoding (%252E, &amp;#46;) does not help either.
export function normalise(s) {
  let t = String(s ?? '').replace(/&amp;/gi, '&');
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(t).replace(/%25/g, '%').replace(/&amp;/gi, '&');
    if (next === t) break;
    t = next;
  }
  return t.replace(/\\/g, '/').toLowerCase();
}

// One path-like string, canonical: normalised and trimmed, '//' collapsed,
// './' segments dropped, leading './', '../' and '/' (and a file:// scheme or a
// drive letter) stripped, trailing sentence dots removed. unanchored: it was
// absolute or climbed with '../', so where it starts in the repo is unknown.
function parseNormalised(t) {
  let s = t.trim().replace(/^file:\/\//, '');
  const absolute = s.startsWith('/') || /^[a-z]:\//.test(s);
  s = s.replace(/^[a-z]:\//, '/');
  const parts = s.split('/').filter((x) => x !== '' && x !== '.');
  let up = false;
  while (parts[0] === '..') {
    parts.shift();
    up = true;
  }
  if (parts.length) parts[parts.length - 1] = parts[parts.length - 1].replace(/\.+$/, '');
  return { parts: parts.filter(Boolean), unanchored: absolute || up };
}

export const parsePath = (p) => parseNormalised(normalise(p));

// A repo path as needles compare it.
export const pathKey = (p) => parsePath(p).parts.join('/');

// The path and each shorter suffix of it at a '/' boundary.
export const suffixPaths = (parts) => parts.map((_, k) => parts.slice(k).join('/'));

// Path-like tokens of a text (holding a '.' or '/'), parsed. Token characters
// stop at whitespace, quotes, ':', '#', '@', brackets of prose and the like, so
// index.ts:12, `src/index.ts` and @src/index.ts all yield the path itself.
const TOKEN_RE = /[a-z0-9_.\-/[\]+~$%]+/g;
export function pathTokens(text) {
  return (normalise(text).match(TOKEN_RE) ?? []).filter((t) => /[./]/.test(t)).map(parseNormalised);
}

export function securityNeedles(findings) {
  const out = new Set();
  for (const f of (findings ?? []).filter((x) => x && x.security)) {
    for (const l of f.locations ?? []) out.add(pathKey(l.file));
  }
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}

function commonSuffix(a, b) {
  let k = 0;
  while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
  return k;
}

// Whether a parsed path names the security file n (canonical parts): one is a
// '/'-boundary suffix of the other (src/index.ts, /repo/<path>), or an
// unanchored path shares at least its last two segments (/x/src/index.ts).
// other/index.ts or index.tsx never names src/index.ts.
function names(p, n) {
  if (!p.parts.length || !n.length) return false;
  const k = commonSuffix(p.parts, n);
  return k === n.length || k === p.parts.length || (p.unanchored && k >= 2);
}

const WORD = /[a-z0-9_]/;

// The full path anywhere (even inside text the tokens split), unless continued
// on the right: a word character next, or '.'/'-' then one (index.ts.bak).
function occurs(t, n) {
  for (let i = t.indexOf(n); i !== -1; i = t.indexOf(n, i + 1)) {
    const c = t[i + n.length] ?? '';
    if (!WORD.test(c) && !((c === '.' || c === '-') && WORD.test(t[i + n.length + 1] ?? ''))) return true;
  }
  return false;
}

export function mentions(text, needles) {
  if (!needles?.length) return false;
  const t = normalise(text);
  if (needles.some((n) => occurs(t, n))) return true;
  const ns = needles.map((n) => n.split('/'));
  return pathTokens(t).some((p) => ns.some((n) => names(p, n)));
}

const slugFile = (slug) => String(slug ?? '').split(':')[1] ?? '';
const slugAnchor = (slug) => String(slug ?? '').split(':').slice(2).join(':');

// A non-security finding that names a security file anywhere it would be
// published. Its locations and its slug's file part count when they name the
// security file in any form (names()); a different file sharing its basename
// does not count.
export function touchesSecurityFile(f, needles) {
  if (!f || f.security || !needles?.length) return false;
  const ns = needles.map((n) => n.split('/'));
  const files = [slugFile(f.slug), ...(f.locations ?? []).map((l) => l.file)];
  if (files.some((file) => ns.some((n) => names(parsePath(file), n)))) return true;
  return [slugAnchor(f.slug), f.title, f.why, f.fix, f.feature].some((t) => mentions(t, needles));
}
