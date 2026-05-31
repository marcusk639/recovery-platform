// functions/src/triggers/pubsub/scheduledYearEndSummary.ts
import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";

// Groups created before this date have had 10+ months to accumulate treasury data.
// Recomputed at runtime so the cutoff is always relative to the current year.
function tenMonthCutoff(): admin.firestore.Timestamp {
  const now = new Date();
  // Feb 1 of the current year = 10 months before Dec 1
  const cutoff = new Date(now.getFullYear(), 1, 1); // Jan is 0, Feb is 1
  return admin.firestore.Timestamp.fromDate(cutoff);
}

export async function sendYearEndSummaries(): Promise<void> {
  const db = admin.firestore();
  const cutoff = tenMonthCutoff();
  const currentYear = new Date().getFullYear();

  const snapshot = await db
    .collection("groups")
    .where("subscriptionStatus", "in", ["active", "trialing"])
    .where("createdAt", "<=", cutoff)
    .get();

  functions.logger.info(
    `Year-end summary: ${snapshot.docs.length} qualifying groups`,
  );

  for (const doc of snapshot.docs) {
    const group = doc.data();
    const groupName: string = group.name ?? "your group";
    const adminIds: string[] = group.admins ?? [];

    const userSnaps = await Promise.all(
      adminIds.map((uid) => db.collection("users").doc(uid).get()),
    );

    for (const userSnap of userSnaps) {
      if (!userSnap.exists) continue;
      const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
      if (tokens.length === 0) continue;

      try {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `${groupName}: Year-End Summary Ready`,
            body: `Your ${currentYear} treasury summary is ready. Review it now for your December business meeting.`,
          },
          data: {
            type: "YEAR_END_SUMMARY",
            groupId: doc.id,
            summaryYear: String(currentYear),
          },
          apns: {
            payload: {
              aps: { sound: "default", "interruption-level": "active" },
            },
          },
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
        });
      } catch (err) {
        functions.logger.error(
          `Year-end FCM send failed for group ${doc.id}`,
          err,
        );
      }
    }
  }
}

// Runs November 1st at 10:00 AM UTC every year
export const scheduledYearEndSummary = functionsV1.pubsub
  .schedule("0 10 1 11 *")
  .timeZone("UTC")
  .onRun(async () => {
    await sendYearEndSummaries();
  });
