import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";

const WINDOW_DAYS = 1; // ±1 day window around target

export async function sendRenewalReminders(
  reminderDays: number = 30,
): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const windowStart = admin.firestore.Timestamp.fromMillis(
    now + (reminderDays - WINDOW_DAYS) * 24 * 60 * 60 * 1000,
  );
  const windowEnd = admin.firestore.Timestamp.fromMillis(
    now + (reminderDays + WINDOW_DAYS) * 24 * 60 * 60 * 1000,
  );

  try {
    const snapshot = await db
      .collection("groups")
      .where("subscriptionStatus", "in", ["active", "trialing"])
      .where("subscriptionExpiresAt", ">=", windowStart)
      .where("subscriptionExpiresAt", "<=", windowEnd)
      .get();

    functions.logger.info(
      `Renewal reminders (${reminderDays}d): ${snapshot.docs.length} groups in window`,
    );

    for (const doc of snapshot.docs) {
      const group = doc.data();
      const groupName: string = group.name ?? "your group";
      const adminIds: string[] = group.admins ?? [];

      const userSnaps = await Promise.all(
        adminIds.map((adminId) => db.collection("users").doc(adminId).get()),
      );

      for (const userSnap of userSnaps) {
        if (!userSnap.exists) continue;
        const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
        if (tokens.length === 0) continue;

        const isUrgent = reminderDays <= 7;
        const body = isUrgent
          ? `Your ${groupName} subscription renews in ${reminderDays} days. Update your payment method now to avoid interruption.`
          : `Your ${groupName} subscription renews in ${reminderDays} days. Make sure your payment info is up to date.`;

        try {
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
              title: isUrgent
                ? `${groupName}: Renewal in ${reminderDays} days`
                : "Time to renew",
              body,
            },
            data: {
              type: "RENEWAL_REMINDER",
              groupId: doc.id,
              reminderDays: String(reminderDays),
            },
          });
        } catch (err) {
          functions.logger.error(`FCM send failed for group ${doc.id}`, err);
        }
      }
    }
  } catch (err) {
    functions.logger.error(
      `sendRenewalReminders(${reminderDays}d) failed`,
      err,
    );
  }
}

export const scheduledRenewalReminders = functionsV1.pubsub
  .schedule("0 10 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    await sendRenewalReminders(30);
    await sendRenewalReminders(7);
  });
