import { ZodSchema, ZodError, z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

// Origins permitted as Stripe return/refresh redirect targets. Shared by the
// billing portal and Stripe Connect onboarding so both enforce the same
// open-redirect allowlist. This is the default list; deployments override it via
// the comma-separated ALLOWED_RETURN_ORIGINS env var (see allowedReturnOrigins()).
export const ALLOWED_RETURN_ORIGINS = [
  'https://regroup-app.com',
  'https://phoenix-cleanhouse.web.app',
  'https://phoenix-cleanhouse.firebaseapp.com',
  'http://localhost:4200',
];

// True when `entry` is exactly what URL.origin renders for an http(s) URL. Any
// other entry can never equal a parsed origin, so it silently allows nothing.
function isBareHttpOrigin(entry: string): boolean {
  try {
    const url = new URL(entry);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === entry;
  } catch {
    return false;
  }
}

let lastReportedConfig: string | undefined;

/**
 * Effective allowlist: the comma-separated ALLOWED_RETURN_ORIGINS env var when
 * it yields at least one entry, otherwise the default list. Read on every call
 * so config changes and tests take effect without a module reload.
 *
 * Each entry must be a bare origin exactly as URL.origin renders it
 * (`scheme://host[:port]`, no trailing slash or path). Entries are compared
 * verbatim and never normalised, so a malformed entry fails closed; it is
 * logged once per distinct config value so the rejection is diagnosable.
 */
export function allowedReturnOrigins(): string[] {
  const raw = process.env.ALLOWED_RETURN_ORIGINS ?? '';
  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length === 0) return [...ALLOWED_RETURN_ORIGINS];

  const invalid = configured.filter((entry) => !isBareHttpOrigin(entry));
  if (invalid.length > 0 && raw !== lastReportedConfig) {
    lastReportedConfig = raw;
    logger.error(
      'ALLOWED_RETURN_ORIGINS has entries that can never match a return URL; ' +
        'each must be a bare http(s) origin such as https://example.com',
      { invalid },
    );
  }
  return configured;
}

// Rejects any URL whose origin is not in allowedReturnOrigins() (also rejects
// non-URL / javascript: values, which fail URL parsing or origin matching).
// Only the origin is logged: the path and query may carry session ids.
export const safeReturnUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) => {
      let origin: string;
      try {
        origin = new URL(url).origin;
      } catch {
        logger.warn('returnUrl rejected: not a parseable URL');
        return false;
      }
      if (allowedReturnOrigins().includes(origin)) return true;
      logger.warn('returnUrl rejected: origin is not in the allowlist', { origin });
      return false;
    },
    { message: 'returnUrl must use an allowed origin' },
  );

export function parseInput<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? 'Invalid input';
      throw new HttpsError('invalid-argument', message);
    }
    throw err;
  }
}
