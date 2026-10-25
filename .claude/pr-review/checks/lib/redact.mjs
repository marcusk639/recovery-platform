// Pure secret scrubbing for any text that may be posted publicly. No I/O.
// Patterns are assembled from parts so this source holds no secret-shaped literal
// (the repo pre-commit secret scan would otherwise flag it).
const P = (...parts) => new RegExp(parts.join(''), 'g');

export const SECRET_PATTERNS = [
  P('whsec', '_', '[A-Za-z0-9]{8,}'),
  P('sk', '_live_', '[A-Za-z0-9]{8,}'),
  P('sk', '_test_', '[A-Za-z0-9]{8,}'),
  P('rk', '_live_', '[A-Za-z0-9]{8,}'),
  P('sk', '-ant-', '[A-Za-z0-9_-]{8,}'),
  P('sk', '-or-v1-', '[A-Za-z0-9]{8,}'),
  P('AKIA', '[0-9A-Z]{16}'),
  P('gh[posu]', '_', '[A-Za-z0-9]{20,}'),
  P('SG', '\\.', '[\\w-]{20,}', '\\.', '[\\w-]{20,}'),
  P('re', '_', '[A-Za-z0-9]{20,}'),
  P('AIza', '[0-9A-Za-z_-]{35}'),
  P('-----BEGIN [A-Z ]*PRIVATE KEY-----'),
];

export function redact(text) {
  let out = String(text ?? '');
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m) => m.slice(0, 6) + '…');
  return out;
}
