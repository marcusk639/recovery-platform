/**
 * scheduledRentCollection
 *
 * Daily auto-pay rent collection. Runs at 10 AM UTC. Queries guests with
 * autoPayEnabled === true and balance > 0, then attempts a Stripe
 * PaymentIntent for each. Uses Promise.allSettled so one failure does not
 * stop the rest, and uses an idempotency key of
 * `auto-rent-{guestId}-{YYYY-MM-DD}` so a re-invocation on the same day does
 * not double-charge.
 *
 * Firestore note: Firestore disallows range inequality filters on two
 * different fields in a single query, but equality on one field
 * (autoPayEnabled) combined with a range on another (balance) is permitted.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import Stripe from "stripe";
import { guestCollection } from "../api/firestore";
import { STRIPE_SECRET_KEY } from "../config";

interface AutoPayGuest {
  id: string;
  houseId: string;
  stripeCustomerId: string;
  defaultPaymentMethodId: string;
  rentOwed: number;
  stripeConnectId?: string;
}

/**
 * Exported for unit testing. Performs the auto-pay collection pass.
 */
export async function runRentCollection(): Promise<void> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
  });

  const snapshot = await guestCollection
    .where("autoPayEnabled", "==", true)
    .where("rentOwed", ">", 0)
    .get();

  if (snapshot.empty) {
    logger.info("scheduledRentCollection: no auto-pay guests with rent owed");
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  const results = await Promise.allSettled(
    snapshot.docs.map(async (doc) => {
      const guest: AutoPayGuest = {
        id: doc.id,
        ...doc.data(),
      } as AutoPayGuest;

      if (!guest.defaultPaymentMethodId || !guest.stripeCustomerId) {
        logger.warn("scheduledRentCollection: guest missing payment info", {
          guestId: guest.id,
        });
        return;
      }

      const amountCents = guest.rentOwed; // already integer cents
      const idempotencyKey = `auto-rent-${guest.id}-${today}`;

      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          customer: guest.stripeCustomerId,
          payment_method: guest.defaultPaymentMethodId,
          confirm: true,
          off_session: true,
          metadata: { guestId: guest.id, houseId: guest.houseId },
          ...(guest.stripeConnectId
            ? {
                transfer_data: { destination: guest.stripeConnectId },
                application_fee_amount: Math.round(amountCents * 0.02),
              }
            : {}),
        },
        { idempotencyKey },
      );

      logger.info("scheduledRentCollection: payment created", {
        guestId: guest.id,
        intentId: intent.id,
        status: intent.status,
      });
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    logger.error("scheduledRentCollection: some payments failed", {
      failureCount: failures.length,
      totalCount: snapshot.size,
    });
  }
}

export const scheduledRentCollection = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: "UTC",
    secrets: [STRIPE_SECRET_KEY],
  },
  async (_event) => {
    logger.info("scheduledRentCollection: starting daily run");
    await runRentCollection();
  },
);
