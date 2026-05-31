// functions/src/triggers/pubsub/scheduledRecurringTransactions.ts
import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "../../utils/firebase";

/**
 * Runs daily at 00:30 UTC.
 * Finds all active recurring transactions whose nextDate is today or earlier,
 * creates the actual transaction, and advances nextDate.
 */
export const scheduledRecurringTransactions = functionsV1.pubsub
  .schedule("30 0 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(today);

    const dueSnapshot = await db
      .collection("recurring_transactions")
      .where("isActive", "==", true)
      .where("nextDate", "<=", todayTimestamp)
      .get();

    if (dueSnapshot.empty) {
      functions.logger.info("No recurring transactions due today.");
      return null;
    }

    functions.logger.info(
      `Processing ${dueSnapshot.size} recurring transaction(s)`,
    );

    for (const doc of dueSnapshot.docs) {
      const data = doc.data();
      try {
        // Create the actual transaction in top-level transactions collection
        const txRef = db
          .collection("transactions")
          .doc();

        await txRef.set({
          id: txRef.id,
          groupId: data.groupId,
          type: data.type,
          amount: data.amount,
          description: `[Recurring] ${data.description}`,
          category: data.category,
          createdBy: data.createdBy,
          createdAt: now,
          updatedAt: now,
          recurringId: doc.id,
        });

        // Advance nextDate
        const nextDate = computeNextDate(
          data.nextDate.toDate(),
          data.frequency as string,
        );
        await doc.ref.update({
          nextDate: admin.firestore.Timestamp.fromDate(nextDate),
          updatedAt: now,
        });

        // Treasury balance is updated by the onTransactionWrite Firestore trigger.
        // Do NOT call updateTreasuryBalance here — that would double-count the amount.

        functions.logger.info(
          `Created recurring transaction for group ${data.groupId}, next: ${nextDate.toISOString()}`,
        );
      } catch (error) {
        functions.logger.error(
          `Failed to process recurring transaction ${doc.id}:`,
          error,
        );
      }
    }

    return null;
  });

export function computeNextDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

