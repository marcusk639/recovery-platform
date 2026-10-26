/**
 * Stripe Connect HTTP handlers (Cloud Functions v2 `onRequest`).
 *
 * - stripeConnectReauth: Stripe redirects here when a Connect onboarding link
 *   expires before the user completes verification. This endpoint should
 *   generate a fresh AccountLink and redirect the user back to Stripe.
 *
 * - stripeConnectReturn: Stripe redirects here after the user completes (or
 *   abandons) the Stripe-hosted onboarding flow. This endpoint displays a
 *   confirmation page or redirects back into the mobile deep-link.
 *
 * NOTE: onboardStripeConnectUser was the legacy web-based standard-account
 * onboarding endpoint. It has been removed — see FUNCTION_AUDIT.md. The
 * replacement callable function `connectStripeAccount` (in
 * src/callable/payments.ts) handles house account onboarding (Accounts v1
 * by default, v2 behind CONNECT_ACCOUNTS_API) for the React Native app.
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { STRIPE_SECRET_KEY } from "../config";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { createStripeClient } from "../util/stripe";
import { connectRefreshUrl, connectReturnUrl } from "../util/connectUrls";

// Lazily instantiated to avoid constructing the Stripe client at module load
// (Firebase source analysis loads modules without secrets bound, so eager
// `createStripeClient()` would throw on an empty key). Memoized on first use.
let _stripe: Stripe | undefined;
const getStripe = (): Stripe => (_stripe ??= createStripeClient());


// ---------------------------------------------------------------------------
// stripeConnectReauth
// ---------------------------------------------------------------------------
// Stripe redirects to this URL when an AccountLink expires before the
// connected account owner completes onboarding.  We look up the house by
// the stripeAccountId query param, create a fresh AccountLink, and
// redirect the user back to Stripe.
// ---------------------------------------------------------------------------

export const stripeConnectReauth = onRequest(
  // A browser lands here from Stripe, unauthenticated; without this a deploy can
  // leave the service with no allUsers invoker and the redirect gets 403.
  { invoker: "public", secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    const stripeAccountId = req.query.stripeAccountId as string | undefined;

    if (!stripeAccountId) {
      logger.warn("stripeConnectReauth: missing stripeAccountId query param");
      res.status(400).send("Missing stripeAccountId parameter.");
      return;
    }

    // This endpoint is unauthenticated (reached via Stripe redirect), so verify
    // the account belongs to a regroup house before calling Stripe. Prevents an
    // attacker from minting onboarding links / probing arbitrary account IDs.
    const houseSnap = await admin
      .firestore()
      .collection("houses")
      .where("stripeAccountId", "==", stripeAccountId)
      .limit(1)
      .get();

    if (houseSnap.empty) {
      logger.warn("stripeConnectReauth: no house found for account", {
        stripeAccountId,
      });
      res.status(404).send("Unknown account.");
      return;
    }

    // Never build these from req.hostname. This endpoint is unauthenticated and
    // the Host header is attacker-supplied, so a spoofed Host would put an
    // attacker's origin into refresh_url / return_url and Stripe would send the
    // house operator there after onboarding. Derive it from deployment config
    // instead, which a request cannot influence.
    try {
      // Inside the try: these throw on a missing project id, and an
      // uncaught throw here would reject the handler, producing an unlogged
      // generic 500. Catching it keeps the error-log line and the operator-
      // facing message that the catch below already provides.
      const refreshUrl = connectRefreshUrl(stripeAccountId);
      const returnUrl = connectReturnUrl();

      const accountLink = await getStripe().accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      logger.info("stripeConnectReauth: redirecting to fresh onboarding link", {
        stripeAccountId,
      });
      res.redirect(303, accountLink.url);
    } catch (err) {
      logger.error("stripeConnectReauth: failed to create account link", {
        stripeAccountId,
        err: (err as Error).message,
      });
      res
        .status(500)
        .send("Failed to generate a new onboarding link. Please try again.");
    }
  },
);

// ---------------------------------------------------------------------------
// stripeConnectReturn
// ---------------------------------------------------------------------------
// Stripe redirects here after the user completes or abandons onboarding. The
// handler is read-only: it reports the status the house already has and leaves
// syncing to the account.updated webhook (see the note inside the handler).
// ---------------------------------------------------------------------------

/**
 * The page Stripe returns an operator to after onboarding.
 *
 * Never claims success unconditionally. Stripe redirects here whenever the flow
 * ends, including when the operator abandoned it part-way, so "Stripe setup
 * complete" was wrong for every account that came back `pending` or
 * `restricted` — and those are exactly the accounts that then fail the
 * `stripeStatus === "active"` gate on rent collection, leaving an operator who
 * was told they were finished wondering why nothing works.
 *
 * Every other value gets the same neutral message: no account id on the
 * request, no house matching it, a failed read of the house, the
 * account.updated webhook not having landed yet, and `disconnected`.
 */
function renderReturnPage(status: string | undefined): string {
  const body =
    status === "active"
      ? "<h2>Stripe setup complete.</h2><p>Your house can now receive rent.</p>"
      : status === "restricted"
        ? "<h2>Stripe needs more information.</h2>" +
          "<p>Your account was created, but Stripe requires further details " +
          "before your house can receive rent. Reopen setup from the app to finish.</p>"
        : status === "pending"
          ? "<h2>Stripe is verifying your details.</h2>" +
            "<p>This usually takes a few minutes. You can close this window.</p>"
          : "<h2>Finishing setup.</h2>" +
            "<p>We are confirming your details with Stripe. You can close this " +
            "window and check your house settings in the app shortly.</p>";
  return `<html><body>${body}</body></html>`;
}

export const stripeConnectReturn = onRequest(
  { invoker: "public", secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    const stripeAccountId = req.query.stripeAccountId as string | undefined;

    logger.info("stripeConnectReturn: user returned from Stripe onboarding", {
      stripeAccountId: stripeAccountId ?? "unknown",
    });

    // Read-only by design. This endpoint is unauthenticated and reached by
    // redirect, and stripeAccountId is not a secret — firestore.rules lets any
    // resident of a house read houses/{houseId}, where the field lives. The
    // previous version retrieved the account from Stripe and wrote the result to
    // the house document on every hit, which handed anyone holding an account id
    // an unauthenticated write plus unbounded Stripe calls against a chosen
    // house, and let them choose WHEN a status refresh happened — which matters
    // because createPaymentIntent gates on house.stripeStatus === "active".
    //
    // Nothing is lost by dropping it: account.updated is handled
    // (stripeWebhook.ts) and re-reads authoritative v2 state, so the webhook is
    // the syncing path. The cost is that status can lag this page by the webhook
    // delivery, which is why the copy below never claims more than it knows.
    let status: string | undefined;
    if (stripeAccountId) {
      try {
        const snap = await admin
          .firestore()
          .collection("houses")
          .where("stripeAccountId", "==", stripeAccountId)
          .limit(1)
          .get();
        if (snap.empty) {
          logger.warn("stripeConnectReturn: no house found for account", {
            stripeAccountId,
          });
        } else {
          status = snap.docs[0].get("stripeStatus") as string | undefined;
        }
      } catch (err) {
        // Non-fatal: the page still renders, just without a status.
        logger.error("stripeConnectReturn: could not read house status", {
          stripeAccountId,
          err: (err as Error)?.message,
        });
      }
    }

    res.status(200).send(renderReturnPage(status));
  },
);
