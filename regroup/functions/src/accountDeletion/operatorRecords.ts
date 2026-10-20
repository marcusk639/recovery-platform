import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { houseCollection } from "../api/firestore";
import { cancelSubscriptionNow, deleteCustomer } from "../api/stripeDeletion";

export interface OperatorDeletionUser {
  id: string;
  subscriptionMetadata?: { subscriptionId?: string; customerId?: string; status?: string };
}

/**
 * Account-deletion "operator" step. Cancels the operator's subscription now,
 * deletes their Stripe customer, and closes every house they own. Owned houses
 * are those with `ownerId` or `superAdminId` equal to the user; guests are
 * untouched.
 *
 * The house's Stripe Connect account is unlinked, not deleted: it belongs to
 * the operator's business and may still have payouts or disputes in flight.
 *
 * The cancel is attempted whenever a subscription id is stored, whatever the
 * stored `status` says: that status can be stale, and the Stripe helpers treat
 * an already-cancelled subscription or an already-deleted customer as done
 * (logging a warning), which also makes this step safe to re-run.
 * Logs ids and counts only.
 */
export const closeOperatorAccount = async (
  user: OperatorDeletionUser,
  now: string,
): Promise<{ housesClosed: string[] }> => {
  const { subscriptionId, customerId } = user.subscriptionMetadata ?? {};

  if (subscriptionId) await cancelSubscriptionNow(subscriptionId);
  if (customerId) await deleteCustomer(customerId);

  const [owned, superAdmin] = await Promise.all([
    houseCollection.where("ownerId", "==", user.id).get(),
    houseCollection.where("superAdminId", "==", user.id).get(),
  ]);
  const housesClosed: string[] = [];
  for (const doc of [...owned.docs, ...superAdmin.docs]) {
    if (housesClosed.includes(doc.id)) continue;
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
