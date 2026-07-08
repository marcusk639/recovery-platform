import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

/**
 * Asserts the caller is authenticated and returns their UID. Centralizes
 * the `if (!request.auth) throw ...` check that's currently reimplemented
 * ~89 times across this codebase's callables in 3 slightly different
 * styles (two-step guard, inline one-liner, destructure-rename).
 */
export function requireAuth<T>(request: CallableRequest<T>): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }
  return request.auth.uid;
}

/**
 * Validates `data` against `schema` and returns the parsed result. Zod's
 * default object-parsing mode strips any field not declared on the schema
 * — this is deliberate allow-list behavior: a client cannot inject a field
 * (e.g. `admins`, `stripeCustomerId`) that the schema doesn't define,
 * regardless of what's in the raw request payload.
 */
export function validateData<S extends z.ZodSchema>(
  schema: S,
  data: unknown
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new HttpsError("invalid-argument", issues);
  }
  return result.data;
}
