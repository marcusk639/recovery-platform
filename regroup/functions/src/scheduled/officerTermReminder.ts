import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { app, userCollection } from "../api/firestore";

/**
 * Exported for testing — the core logic without the scheduler wrapper.
 *
 * Firestore and Messaging are accessed lazily (inside the function body)
 * so that module-level initialisation does not fail when firebase-admin is
 * mocked in tests that import scheduled/index.ts.
 */
export async function sendOfficerTermReminders(): Promise<void> {
  const db = admin.firestore();

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const cutoffDate = thirtyDaysFromNow.toISOString().slice(0, 10);

  const today = new Date().toISOString().slice(0, 10);

  // Query all active officers whose term ends within 30 days
  const snapshot = await db
    .collectionGroup("officers")
    .where("isActive", "==", true)
    .where("termEndDate", "<=", cutoffDate)
    .where("termEndDate", ">=", today)
    .get();

  if (snapshot.empty) {
    logger.info("No officer terms expiring within 30 days");
    return;
  }

  // --- Issue 1: batch user lookups with db.getAll() ---
  // Collect unique userIds from all officer docs
  const userIdSet = new Set<string>();
  for (const doc of snapshot.docs) {
    const { userId } = doc.data();
    if (userId) userIdSet.add(userId);
  }

  // Fetch all user docs in a single round-trip
  const userRefs = Array.from(userIdSet).map((uid) => userCollection.doc(uid));
  const userSnapshots = userRefs.length > 0 ? await db.getAll(...userRefs) : [];

  // Build a map of userId → user data for O(1) lookup per officer
  const userDataMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (const userSnap of userSnapshots) {
    if (userSnap.exists) {
      userDataMap.set(userSnap.id, userSnap.data()!);
    }
  }

  for (const doc of snapshot.docs) {
    const officer = doc.data();
    const { userId, role, houseId, termEndDate } = officer;

    // --- Issue 5: validate required officer fields ---
    if (!userId || !role || !houseId || !termEndDate) {
      logger.warn(
        `Officer document ${doc.id} missing required fields, skipping`
      );
      continue;
    }

    // --- Issue 2: daysLeft boundary guard ---
    const daysLeft = Math.ceil(
      (new Date(termEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft < 1) continue;

    const userData = userDataMap.get(userId);

    // --- Issue 4: safe array check instead of `as` cast ---
    const raw = userData?.messagingToken;
    const messagingTokens = Array.isArray(raw) ? raw : undefined;

    if (!messagingTokens || messagingTokens.length === 0) continue;

    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    try {
      const result = await admin.messaging(app).sendEachForMulticast({
        tokens: messagingTokens,
        notification: {
          title: "Officer Term Expiring",
          body: `Your term as ${roleLabel} expires in ${daysLeft} days.`,
        },
        data: { houseId, role, type: "officer_term_reminder" },
      });
      logger.info(
        `Sent term reminder to officer ${userId} (${role}) — ${daysLeft} days left`
      );

      // --- Issue 3: stale-token cleanup ---
      const tokensToRemove: string[] = [];
      result.responses.forEach((response, index) => {
        const error = response.error;
        if (error) {
          logger.error(
            "Failure sending officer term reminder to",
            messagingTokens[index],
            error
          );
          if (
            error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(messagingTokens[index]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        const updatedTokens = messagingTokens.filter(
          (token) => !tokensToRemove.includes(token)
        );
        await userCollection
          .doc(userId)
          .update({ messagingToken: updatedTokens });
        logger.info(
          `Removed ${tokensToRemove.length} stale token(s) for user ${userId}`
        );
      }
    } catch (err) {
      logger.warn(`Failed to send reminder to ${userId}:`, err);
    }
  }
}

// Scheduled Cloud Function: runs daily at 8 AM UTC
export const officerTermReminder = onSchedule(
  { schedule: "0 8 * * *", timeZone: "UTC" },
  async (_event) => {
    logger.info("Running officer term reminder check...");
    await sendOfficerTermReminders();
  }
);
