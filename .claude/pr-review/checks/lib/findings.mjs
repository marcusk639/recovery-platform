// findings.json contract validation and the public security pointer.
import { SEVERITIES } from './ledger.mjs';

const CONFIDENCES = ['high', 'medium', 'low'];
const SIDES = ['changed', 'counterpart'];
const STRING_FIELDS = ['slug', 'package', 'area', 'title', 'feature', 'why', 'fix'];
const SLUG_RE = /^c([1-9]|1[0-4]):[^\s>]+:[^\s>]+$/;
const PACKAGE_RE = /^[A-Za-z0-9_-]{1,40}(?:\/[A-Za-z0-9_-]{1,40})?$/;
const AREA_RE = /^[A-Za-z0-9 _-]{1,40}$/;

function findingError(f, i) {
  const at = `findings[${i}]`;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return `${at} is not an object`;
  for (const k of STRING_FIELDS) if (typeof f[k] !== 'string' || !f[k].trim()) return `${at}.${k} missing`;
  if (!SLUG_RE.test(f.slug)) return `${at}.slug malformed`;
  if (!Number.isInteger(f.class) || f.class < 1 || f.class > 14) return `${at}.class out of range`;
  if (!SEVERITIES.includes(f.severity)) return `${at}.severity invalid`;
  if (!CONFIDENCES.includes(f.confidence)) return `${at}.confidence invalid`;
  if (typeof f.security !== 'boolean' || typeof f.inlinePosted !== 'boolean') return `${at} flags invalid`;
  if (!Array.isArray(f.locations) || f.locations.length === 0) return `${at}.locations empty`;
  for (const l of f.locations) {
    if (!l || typeof l.file !== 'string' || !l.file || !Number.isInteger(l.line) || l.line < 0 || !SIDES.includes(l.side)) {
      return `${at}.locations invalid`;
    }
  }
  return null;
}

// Accepts the raw file text or an already-parsed value.
export function validateFindings(json) {
  let v = json;
  if (typeof json === 'string') {
    try {
      v = JSON.parse(json);
    } catch {
      return { ok: false, error: 'not valid JSON' };
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'not an object' };
  if (typeof v.reviewedSha !== 'string') return { ok: false, error: 'reviewedSha missing' };
  if (!Array.isArray(v.findings)) return { ok: false, error: 'findings not an array' };
  if (!Array.isArray(v.resolvedSlugs) || v.resolvedSlugs.some((s) => typeof s !== 'string')) {
    return { ok: false, error: 'resolvedSlugs invalid' };
  }
  for (let i = 0; i < v.findings.length; i++) {
    const error = findingError(v.findings[i], i);
    if (error) return { ok: false, error };
  }
  return { ok: true, value: v };
}

// The only public text a security finding ever gets. Package and area are
// whitelisted so a file name, line or mechanism cannot ride along in them.
export function securityPointer({ severity, package: pkg, area }, clause = 'details sent privately') {
  const sev = SEVERITIES.includes(severity) ? severity : 'High';
  const p = typeof pkg === 'string' && PACKAGE_RE.test(pkg.trim()) ? pkg.trim() : 'an unnamed package';
  const a = typeof area === 'string' && AREA_RE.test(area.trim()) ? area.trim() : 'area';
  return `Security-relevant issue (${sev}) in ${p} ${a}; ${clause}`;
}
