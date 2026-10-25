// Pure secret scrubbing for any text that may be posted publicly. No I/O.
// Patterns are assembled from parts so this source holds no secret-shaped literal
// (the repo pre-commit secret scan would otherwise flag it).
const P = (...parts) => new RegExp(parts.join(''));
// Left boundary: a prefix inside a longer identifier (task_test_x, capture_foo) is not a secret.
const B = '(?<![A-Za-z0-9_])';

export const SECRET_PATTERNS = [
  P(B, 'whsec', '_', '[A-Za-z0-9]{8,}'),
  P(B, 'sk', '_live_', '[A-Za-z0-9]{8,}'),
  P(B, 'sk', '_test_', '[A-Za-z0-9]{8,}'),
  P(B, 'rk', '_live_', '[A-Za-z0-9]{8,}'),
  P(B, 'sk', '-ant-', '[A-Za-z0-9_-]{8,}'),
  P(B, 'sk', '-or-v1-', '[A-Za-z0-9]{8,}'),
  P(B, 'AKIA', '[0-9A-Z]{16}'),
  P(B, 'gh[posu]', '_', '[A-Za-z0-9]{20,}'),
  P(B, 'SG', '\\.', '[\\w-]{20,}', '\\.', '[\\w-]{20,}'),
  P(B, 're', '_', '[A-Za-z0-9]{20,}'),
  P(B, 'AIza', '[0-9A-Za-z_-]{35}'),
  P('-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)'),
];

export function redact(text) {
  let out = String(text ?? '');
  for (const re of SECRET_PATTERNS) out = out.replace(new RegExp(re.source, 'g'), (m) => m.slice(0, 6) + '…');
  return out;
}
