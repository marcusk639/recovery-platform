import { ZodSchema, ZodError, z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

// Origins permitted as Stripe return/refresh redirect targets. Shared by the
// billing portal and Stripe Connect onboarding so both enforce the same
// open-redirect allowlist.
export const ALLOWED_RETURN_ORIGINS = [
  "https://regroup-app.com",
  "https://phoenix-cleanhouse.web.app",
  "https://phoenix-cleanhouse.firebaseapp.com",
  "http://localhost:4200",
];

// Rejects any URL whose origin is not in ALLOWED_RETURN_ORIGINS (also rejects
// non-URL / javascript: values, which fail URL parsing or origin matching).
export const safeReturnUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) => {
      try {
        return ALLOWED_RETURN_ORIGINS.includes(new URL(url).origin);
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
