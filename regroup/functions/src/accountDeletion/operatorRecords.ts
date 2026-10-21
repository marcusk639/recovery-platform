import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { houseCollection } from "../api/firestore";
import { closeOperatorBilling } from "../api/stripeDeletion";

export interface OperatorDeletionUser {
  id: string;
  subscriptionMetadata?: { subscriptionId?: string; customerId?: string; status?: string };
}

/**
 * Account-deletion "operator" step. Cancels the operator's subscription now and
 * deletes their Stripe customer, when Stripe ties them to this uid (otherwise
 * the step stops before acting; see closeOperatorBilling), then closes every
 * house they own. Owned houses
 * are those with `ownerId` or `superAdminId` equal to the user; guests are
 * untouched.
 *
 * The house's Stripe Connect account is unlinked, not deleted: it belongs to
 * the operator's business and may still have payouts or disputes in flight.
 *
 * Billing is closed by closeOperatorBilling, which acts only on a subscription
 * Stripe ties to this uid (metadata.userId) and the customer it bills: the ids
 * here come from the user doc, which its owner can delete and recreate. The
 * cancel is attempted whatever the stored `status` says (it can be stale); an
 * already-cancelled subscription or already-deleted customer counts as done,
 * which also makes this step safe to re-run.
 * Logs ids and counts only.
 */
export const closeOperatorAccount = async (
  user: OperatorDeletionUser,
  now: string,
): Promise<{ housesClosed: string[] }> => {
  const { subscriptionId, customerId } = user.subscriptionMetadata ?? {};

  await closeOperatorBilling(user.id, subscriptionId, customerId);

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
