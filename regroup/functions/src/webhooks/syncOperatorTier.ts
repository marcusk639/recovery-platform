import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import type Stripe from "stripe";
import { getTier, tierForPriceId } from "../util/tierPricing";

/**
 * A plan change in Stripe's billing portal reaches the app only as
 * customer.subscription.updated, so the operator's tier and its limits follow
 * the subscription's price here.
 * - The subscription is read fresh from Stripe, so a late or retried older
 *   event can't put back the plan the operator left.
 * - Only the operator's current subscription counts.
 * - A price in the other catalog (traditional vs Oxford) changes nothing: the
 *   houses' houseType and oxfordEnabled must change with it, and only
 *   setOxfordEnabled writes those together.
 */
export async function syncOperatorTier(
  stripe: Stripe,
  operatorUid: string,
  subscriptionId: string,
): Promise<void> {
  const fresh = await stripe.subscriptions.retrieve(subscriptionId);
  const db = admin.firestore();
  const ref = db.collection("users").doc(operatorUid);
  const outcome = await db.runTransaction(async (tx) => {
    const meta = (await tx.get(ref)).data()?.subscriptionMetadata;
    if (meta?.subscriptionId !== subscriptionId) return "other subscription";
    const item =
      fresh.items.data.find((i) => i.id === meta.subscriptionItemId) ?? fresh.items.data[0];
    const plan = tierForPriceId(item?.price?.id ?? "");
    if (!plan) return "price matches no tier";
    if (plan.houseType !== meta.houseType) return "price is in the other catalog";
    const { maxResidents, maxProperties } = getTier(plan.houseType, plan.tier);
    tx.update(ref, {
      "subscriptionMetadata.tier": plan.tier,
      "subscriptionMetadata.billingInterval": plan.billingInterval,
      "subscriptionMetadata.maxResidents": maxResidents,
      "subscriptionMetadata.maxProperties": maxProperties,
    });
    return "updated";
  });
  const fields = { operatorUid, subscriptionId, outcome };
  if (outcome === "updated" || outcome === "price matches no tier") {
    logger.info("syncOperatorTier", fields);
  } else {
    logger.warn("syncOperatorTier: tier unchanged", fields);
  }
}
