// x.y or x.y.z: the shape of the app's version names and of getAppConfig's values.
const VERSION = /^\d+\.\d+(\.\d+)?$/;

/**
 * Compares two dotted versions part by part, as numbers ('1.10' is above
 * '1.9'). A missing part counts as 0, so '1.53' equals '1.53.0'.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * Whether this build must update: only when both versions are well formed and
 * the minimum is strictly above it. Anything else lets the user in, so a bad
 * server value can never lock everyone out.
 */
export function isUpdateRequired(current: unknown, min: unknown): boolean {
  if (typeof current !== 'string' || typeof min !== 'string') return false;
  if (!VERSION.test(current) || !VERSION.test(min)) return false;
  return compareVersions(current, min) < 0;
}
