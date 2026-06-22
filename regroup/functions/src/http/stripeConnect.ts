/**
 * Stripe Connect HTTP handlers (v2).
 *
 * - stripeConnectReauth: Stripe redirects here when a Connect onboarding link
 *   expires before the user completes verification. This endpoint should
 *   generate a fresh AccountLink and redirect the user back to Stripe.
 *
 * - stripeConnectReturn: Stripe redirects here after the user completes (or
 *   abandons) the Express onboarding flow. This endpoint displays a
 *   confirmation page or redirects back into the mobile deep-link.
 *
 * NOTE: onboardStripeConnectUser was the legacy web-based standard-account
 * onboarding endpoint. It has been removed — see FUNCTION_AUDIT.md. The
 * replacement callable function `connectStripeAccount` (in
 * src/callable/payments.ts) handles Express-account onboarding for
 * the React Native app.
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { STRIPE_SECRET_KEY } from "../config";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { createStripeClient } from "../util/stripe";

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
  { secrets: [STRIPE_SECRET_KEY] },
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

    // Build the return and refresh URLs from this same function so they
    // remain consistent regardless of which environment is deployed.
    const baseUrl = `${req.protocol}://${req.hostname}`;
    const refreshUrl = `${baseUrl}/stripeConnectReauth?stripeAccountId=${stripeAccountId}`;
    const returnUrl = `${baseUrl}/stripeConnectReturn`;

    try {
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
// Stripe redirects here after the user completes or abandons the Express
// onboarding flow.  On completion we sync the account status back to
// Firestore and render a simple acknowledgement page.
// ---------------------------------------------------------------------------

export const stripeConnectReturn = onRequest(
  { secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    const stripeAccountId = req.query.stripeAccountId as string | undefined;

    logger.info("stripeConnectReturn: user returned from Stripe onboarding", {
      stripeAccountId: stripeAccountId ?? "unknown",
    });

    if (!stripeAccountId) {
      // No account ID — still render a success page; the account.updated
      // webhook will sync Firestore when Stripe sends it.
      res
        .status(200)
        .send(
          "<html><body><h2>Stripe setup complete.</h2>" +
            "<p>You can close this window and return to the app.</p>" +
            "</body></html>",
        );
      return;
    }

    try {
      // This endpoint is unauthenticated (reached via Stripe redirect). Verify
      // the account maps to a regroup house BEFORE calling Stripe, so an
      // attacker cannot use it to probe arbitrary connected-account IDs.
      const db = admin.firestore();
      const snap = await db
        .collection("houses")
        .where("stripeAccountId", "==", stripeAccountId)
        .limit(1)
        .get();

      if (snap.empty) {
        logger.warn("stripeConnectReturn: no house found for account", {
          stripeAccountId,
        });
      } else {
        // Eagerly sync the account status so the app reflects it immediately
        // without waiting for the account.updated webhook.
        const account = await getStripe().accounts.retrieve(stripeAccountId);
        const chargesEnabled = account.charges_enabled === true;
        const payoutsEnabled = account.payouts_enabled === true;

        let stripeStatus: "active" | "pending" | "restricted";
        if (chargesEnabled && payoutsEnabled) {
          stripeStatus = "active";
        } else if (
          account.requirements?.disabled_reason ||
          (account.requirements?.currently_due &&
            account.requirements.currently_due.length > 0)
        ) {
          stripeStatus = "restricted";
        } else {
          stripeStatus = "pending";
        }

        await snap.docs[0].ref.update({
          stripeStatus,
          stripeChargesEnabled: chargesEnabled,
          stripePayoutsEnabled: payoutsEnabled,
          updatedAt: new Date().toISOString(),
        });
        logger.info("stripeConnectReturn: synced account status to Firestore", {
          stripeAccountId,
          stripeStatus,
        });
      }
    } catch (err) {
      // Non-fatal — the account.updated webhook will reconcile state.
      logger.error("stripeConnectReturn: error syncing account status", {
        stripeAccountId,
        err: (err as Error).message,
      });
    }

    res
      .status(200)
      .send(
        "<html><body><h2>Stripe setup complete.</h2>" +
          "<p>You can close this window and return to the app.</p>" +
          "</body></html>",
      );
  },
);
