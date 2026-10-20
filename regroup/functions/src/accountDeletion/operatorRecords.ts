import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { houseCollection } from "../api/firestore";
import { cancelSubscriptionNow, deleteCustomer } from "../api/stripe";

export interface OperatorDeletionUser {
  id: string;
  subscriptionMetadata?: { subscriptionId?: string; customerId?: string };
}

/**
 * Account-deletion "operator" step. Cancels the operator's subscription now,
 * deletes their Stripe customer, and closes every house they own. The Connect
 * account is unlinked, not deleted (D2); guests are untouched. Idempotent.
 * Logs ids and counts only.
 */
export const closeOperatorAccount = async (
  user: OperatorDeletionUser,
  now: string,
): Promise<{ housesClosed: string[] }> => {
  const { subscriptionId, customerId } = user.subscriptionMetadata ?? {};

  if (subscriptionId) await cancelSubscriptionNow(subscriptionId);
  if (customerId) await deleteCustomer(customerId);

  const houses = await houseCollection.where("ownerId", "==", user.id).get();
  const housesClosed: string[] = [];
  for (const doc of houses.docs) {
    await doc.ref.update({
      subscriptionStatus: "canceled",
      closedAt: now,
      stripeAccountId: admin.firestore.FieldValue.delete(),
      stripeStatus: "disconnected",
    });
    housesClosed.push(doc.id);
  }

  logger.info("Operator account closed", { userId: user.id, housesClosed: housesClosed.length });
  return { housesClosed };
};
