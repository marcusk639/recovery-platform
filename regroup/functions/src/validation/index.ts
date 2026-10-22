import { ZodSchema, ZodError, z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

// Origins permitted as Stripe return/refresh redirect targets. Shared by the
// billing portal and Stripe Connect onboarding so both enforce the same
// open-redirect allowlist. This is the production default; deployments override
// it via the comma-separated ALLOWED_RETURN_ORIGINS env var (see
// allowedReturnOrigins()).
export const ALLOWED_RETURN_ORIGINS = [
  "https://regroup-app.com",
  "https://phoenix-cleanhouse.web.app",
  "https://phoenix-cleanhouse.firebaseapp.com",
  "http://localhost:4200",
];

/**
 * Effective allowlist: the comma-separated ALLOWED_RETURN_ORIGINS env var when
 * it yields at least one entry (each normalised to a URL origin), otherwise the production default. Read on every
 * call so config changes and tests take effect without a module reload.
 */
export function allowedReturnOrigins(): string[] {
  const configured = (process.env.ALLOWED_RETURN_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length === 0) return [...ALLOWED_RETURN_ORIGINS];
  // Normalise to URL origins so "https://x.app/" matches what safeReturnUrlSchema
  // compares against. An entry that is not a URL can never match, so it is
  // dropped; a list of only such entries yields an empty (deny-all) allowlist
  // rather than silently falling back to production.
  return configured.flatMap((origin) => {
    try {
      return [new URL(origin).origin];
    } catch {
      return [];
    }
  });
}

// Rejects any URL whose origin is not in allowedReturnOrigins() (also rejects
// non-URL / javascript: values, which fail URL parsing or origin matching).
export const safeReturnUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) => {
      try {
        return allowedReturnOrigins().includes(new URL(url).origin);
      } catch {
        return false;
      }
    },
    { message: "returnUrl must use an allowed origin" },
  );

export function parseInput<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? "Invalid input";
      throw new HttpsError("invalid-argument", message);
    }
    throw err;
  }
}
