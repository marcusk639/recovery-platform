import { HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";

/**
 * Creates a Stripe client using the Secret Manager value injected at runtime.
 * Must only be called from within a function handler where the secret is
 * already available in process.env.
 */
export const createStripeClient = (): Stripe =>
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
  });

/**
 * Maps a Stripe API error to an appropriate Firebase HttpsError so clients
 * receive a meaningful error code rather than a generic `internal`.
 */
export function mapStripeError(err: unknown): HttpsError {
  if (err instanceof Stripe.errors.StripeError) {
    switch (err.type) {
      case "StripeCardError":
        // Card declined, insufficient funds, etc. — surface to the user.
        return new HttpsError("failed-precondition", err.message);
      case "StripeInvalidRequestError":
        return new HttpsError("invalid-argument", err.message);
      case "StripeAuthenticationError":
        return new HttpsError(
          "unauthenticated",
          "Stripe authentication failed"
        );
      case "StripeRateLimitError":
        return new HttpsError(
          "resource-exhausted",
          "Stripe rate limit exceeded"
        );
      case "StripeConnectionError":
        return new HttpsError("unavailable", err.message);
      case "StripeAPIError":
        return new HttpsError("internal", err.message);
      default:
        return new HttpsError("internal", err.message);
    }
  }
  return new HttpsError("internal", "An unexpected error occurred");
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
