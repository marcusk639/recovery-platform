import { HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "./stripeApiVersion";

/**
 * Creates a Stripe client using the Secret Manager value injected at runtime.
 * Must only be called from within a function handler where the secret is
 * already available in process.env.
 */
export const createStripeClient = (): Stripe =>
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: STRIPE_API_VERSION,
  });

/**
 * Maps a Stripe API error to an appropriate Firebase HttpsError so clients
 * receive a meaningful error code rather than a generic `internal`.
 */
export function mapStripeError(err: unknown): HttpsError {
  // Guard against `Stripe.errors` being unavailable (e.g. under test harnesses
  // that fully mock the `stripe` module); fall back to duck-typing the error.
  const isStripeError = Stripe.errors?.StripeError
    ? err instanceof Stripe.errors.StripeError
    : typeof err === "object" &&
      err !== null &&
      typeof (err as { type?: unknown }).type === "string" &&
      (err as { type: string }).type.startsWith("Stripe");
  if (isStripeError) {
    const stripeErr = err as { type?: string; message?: string };
    const message = stripeErr.message ?? "Stripe error";
    switch (stripeErr.type) {
      case "StripeCardError":
        // Card declined, insufficient funds, etc. — surface to the user.
        return new HttpsError("failed-precondition", message);
      case "StripeInvalidRequestError":
        return new HttpsError("invalid-argument", message);
      case "StripeAuthenticationError":
        return new HttpsError(
          "unauthenticated",
          "Stripe authentication failed",
        );
      case "StripeRateLimitError":
        return new HttpsError(
          "resource-exhausted",
          "Stripe rate limit exceeded",
        );
      case "StripeConnectionError":
        return new HttpsError("unavailable", message);
      case "StripeAPIError":
        return new HttpsError("internal", message);
      default:
        return new HttpsError("internal", message);
    }
  }
  return new HttpsError("internal", "An unexpected error occurred");
}

/**
 * Returns true when a Stripe error indicates the referenced resource genuinely
 * no longer exists (`resource_missing`). Used to distinguish a deleted
 * subscription/item from transient failures (rate limit, network) so callers
 * only fall back to local-only state when Stripe truly has nothing to update.
 */
export function isResourceMissing(err: unknown): boolean {
  // Duck-typed rather than `instanceof Stripe.errors.StripeError` so it also
  // works under test harnesses that fully mock the `stripe` module.
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: unknown }).type === "StripeInvalidRequestError" &&
    (err as { code?: unknown }).code === "resource_missing"
  );
}

/**
 * Returns true for Stripe errors indicating the account is already gone or
 * was never Express-connected, so disconnect can be treated as idempotent.
 */
export function isAlreadyDeauthorized(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeError) {
    const msg = err.message.toLowerCase();
    return (
      err.type === "StripeInvalidRequestError" &&
      (msg.includes("no such account") ||
        msg.includes("not connected") ||
        msg.includes("already disconnected") ||
        msg.includes("cannot deauthorize") ||
        msg.includes("account not found"))
    );
  }
  return false;
}
