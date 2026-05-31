import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { stripe } from "../../utils/stripe";

export async function reconcileSubscriptions(): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  try {
    const snapshot = await db
      .collection("groups")
      .where("subscriptionStatus", "in", ["trialing", "active"])
      .where("subscriptionExpiresAt", "<", now)
      .get();

    functions.logger.info(
      `Reconciler: ${snapshot.docs.length} expired groups to check`,
    );

    for (const doc of snapshot.docs) {
      const group = doc.data();
      const stripeSubscriptionId: string | null =
        group.stripeSubscriptionId ?? null;

      if (!stripeSubscriptionId) {
        await doc.ref.update({
          subscriptionStatus: "canceled",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.info(
          `Reconciler: group ${doc.id} has no subscription ID, marked canceled`,
        );
        continue;
      }

      try {
        const subscription =
          await stripe.subscriptions.retrieve(stripeSubscriptionId);

        if (subscription.status !== group.subscriptionStatus) {
          const rawPeriodEnd = (
            subscription as unknown as Record<string, unknown>
          ).current_period_end;
          const subscriptionExpiresAt =
            typeof rawPeriodEnd === "number"
              ? admin.firestore.Timestamp.fromMillis(rawPeriodEnd * 1000)
              : admin.firestore.FieldValue.delete();
          await doc.ref.update({
            subscriptionStatus: subscription.status,
            subscriptionExpiresAt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          functions.logger.info(
            `Reconciler: group ${doc.id} synced ${group.subscriptionStatus} → ${subscription.status}`,
          );
        }
      } catch (stripeError: any) {
        functions.logger.error(
          `Reconciler: Stripe fetch failed for ${stripeSubscriptionId}`,
          stripeError,
        );
      }
    }
  } catch (err) {
    functions.logger.error("reconcileSubscriptions failed", err);
  }
}

export const scheduledSubscriptionReconciler = functionsV1.pubsub
  .schedule("0 2 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    await reconcileSubscriptions();
  });
