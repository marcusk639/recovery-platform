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
import { STRIPE_SECRET_KEY, LEGACY_RENT_FEE_HOUSE_IDS } from "../config";
import {
  computeApplicationFee,
  RentPaymentMethodType,
} from "../util/rentFee";

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

      // The platform application fee only applies to Connect transfers. When
      // present, derive the method-aware fee (P-1/P-2): look up the stored
      // default method's type so ACH vs card is priced correctly; legacy
      // houses stay on the flat 2% via the allow-list (P-3).
      let transferParams: Partial<Stripe.PaymentIntentCreateParams> = {};
      if (guest.stripeConnectId) {
        const method = await stripe.paymentMethods.retrieve(
          guest.defaultPaymentMethodId,
        );
        const paymentMethodType: RentPaymentMethodType =
          method.type === "us_bank_account" ? "us_bank_account" : "card";
        transferParams = {
          transfer_data: { destination: guest.stripeConnectId },
          application_fee_amount: computeApplicationFee({
            amountCents,
            paymentMethodType,
            isLegacyHouse: LEGACY_RENT_FEE_HOUSE_IDS.includes(guest.houseId),
          }),
        };
      }

      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          customer: guest.stripeCustomerId,
          payment_method: guest.defaultPaymentMethodId,
          confirm: true,
          off_session: true,
          metadata: { guestId: guest.id, houseId: guest.houseId },
          ...transferParams,
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
