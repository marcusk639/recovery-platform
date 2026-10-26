// Security-file "needles": the full paths of every current security finding's
// locations. Any public text that mentions one is withheld, because it would
// point at the security finding. A mention is the full path anywhere, or a
// shorter path suffix of it (down to the bare basename) standing as its own
// token: not continuing a longer path on the left (so other/index.ts is not
// src/index.ts) and not continued on the right (so index.tsx is not index.ts).
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

// A repo path as needles and locations compare it: normalised, no leading './'.
export const pathKey = (p) => normalise(p).replace(/^(\.\/)+/, '');

export function securityNeedles(findings) {
  const out = new Set();
  for (const f of (findings ?? []).filter((x) => x && x.security)) {
    for (const l of f.locations ?? []) out.add(pathKey(l.file));
  }
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}

const WORD = /[a-z0-9_]/;
const PATH_CHAR = /[a-z0-9_.\-/]/;

// Not continued on the right: no word character next, nor '.'/'-' then one (index.ts.bak).
function endsHere(t, end) {
  const c = t[end] ?? '';
  if (WORD.test(c)) return false;
  return !((c === '.' || c === '-') && WORD.test(t[end + 1] ?? ''));
}

// s occurs in t as a mention; a suffix (left) must also not continue a longer path.
function occurs(t, s, left) {
  for (let i = t.indexOf(s); i !== -1; i = t.indexOf(s, i + 1)) {
    if ((!left || i === 0 || !PATH_CHAR.test(t[i - 1])) && endsHere(t, i + s.length)) return true;
  }
  return false;
}

// The needle and each shorter suffix of it at a '/' boundary, basename last.
const suffixes = (n) => n.split('/').map((_, k, parts) => parts.slice(k).join('/')).filter(Boolean);

export function mentions(text, needles) {
  if (!needles?.length) return false;
  const t = normalise(text);
  return needles.some((n) => suffixes(n).some((s, k) => occurs(t, s, k > 0)));
}

const slugParts = (slug) => {
  const [, file = '', ...rest] = String(slug ?? '').split(':');
  return { file, anchor: rest.join(':') };
};

// A non-security finding that names a security file anywhere it would be
// published. Its locations and its slug's file part must be the security file
// itself; a different file sharing its basename does not count.
export function touchesSecurityFile(f, needles) {
  if (!f || f.security || !needles?.length) return false;
  const exact = new Set(needles);
  const { file, anchor } = slugParts(f.slug);
  if ([file, ...(f.locations ?? []).map((l) => l.file)].some((p) => exact.has(pathKey(p)))) return true;
  return [anchor, f.title, f.why, f.fix, f.feature].some((t) => mentions(t, needles));
}
