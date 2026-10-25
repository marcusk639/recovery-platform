// Security-file "needles": the paths and basenames of every current security
// finding's locations. Any public text that mentions one is withheld, because
// it would point at the security finding. Matching ignores case and treats '\'
// as '/'.
const slashes = (s) => String(s ?? '').replace(/\\/g, '/');

export function securityNeedles(findings) {
  const out = new Set();
  for (const f of (findings ?? []).filter((x) => x && x.security)) {
    for (const l of f.locations ?? []) {
      const file = slashes(l.file).toLowerCase();
      out.add(file);
      out.add(file.split('/').pop());
    }
  }
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}

export function mentions(text, needles) {
  if (!needles?.length) return false;
  const t = slashes(text).toLowerCase();
  return needles.some((n) => t.includes(n));
}

// A non-security finding that names a security file anywhere it would be published.
export function touchesSecurityFile(f, needles) {
  if (!f || f.security || !needles?.length) return false;
  const texts = [f.slug, f.title, f.why, f.fix, f.feature, ...(f.locations ?? []).map((l) => l.file)];
  return texts.some((t) => mentions(t, needles));
}
