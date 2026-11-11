import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import type Stripe from "stripe";
import { getTier, tierForPriceId } from "../util/tierPricing";

/**
 * A plan change in Stripe's billing portal reaches the app only as
 * customer.subscription.updated, so the operator's tier and its limits follow
 * the subscription's price here. Only the operator's current subscription
 * counts: an event for an older one must not overwrite the plan they have now.
 */
export async function syncOperatorTier(
  operatorUid: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const plan = tierForPriceId(priceId);
  if (!plan) {
    logger.info("syncOperatorTier: price matches no tier; tier unchanged", {
      subscriptionId: subscription.id,
      priceId,
    });
    return;
  }
  const { maxResidents, maxProperties } = getTier(plan.houseType, plan.tier);
  const db = admin.firestore();
  const ref = db.collection("users").doc(operatorUid);
  const updated = await db.runTransaction(async (tx) => {
    const meta = (await tx.get(ref)).data()?.subscriptionMetadata;
    if (meta?.subscriptionId !== subscription.id) return false;
    tx.update(ref, {
      "subscriptionMetadata.houseType": plan.houseType,
      "subscriptionMetadata.tier": plan.tier,
      "subscriptionMetadata.billingInterval": plan.billingInterval,
      // As tier checkout sets it: a tier subscription is Oxford iff its catalog is.
      "subscriptionMetadata.oxfordEnabled": plan.houseType === "oxford",
      "subscriptionMetadata.maxResidents": maxResidents,
      "subscriptionMetadata.maxProperties": maxProperties,
    });
    return true;
  });
  if (updated) {
    logger.info("syncOperatorTier: operator tier follows the subscription", {
      operatorUid,
      subscriptionId: subscription.id,
      tier: plan.tier,
    });
  } else {
    logger.warn("syncOperatorTier: event is not for the operator's current subscription", {
      operatorUid,
      subscriptionId: subscription.id,
    });
  }
}
