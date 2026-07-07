// functions/src/triggers/firestore/onTransactionWrite.ts
import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db } from "../../utils/firebase";

interface TransactionDocument {
  groupId: string;
  type: "income" | "expense";
  amount: number;
}

interface TreasuryOverviewDocument {
  groupId: string;
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  prudentReserve: number;
  lastMonthReset?: admin.firestore.Timestamp;
  lastUpdated: admin.firestore.Timestamp;
}

/**
 * Returns true when `lastReset` is from a different calendar month than now.
 */
function isNewMonth(lastReset: Date | undefined): boolean {
  if (!lastReset) return true;
  const now = new Date();
  return (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  );
}

/**
 * onTransactionWrite — Firestore trigger
 *
 * Fires whenever a document in the top-level `transactions` collection is
 * created, updated, or deleted.  It computes the net delta between the
 * before-state and after-state, then atomically applies that delta to the
 * matching `treasury_overviews/{groupId}` document.
 *
 * This replaces the client-side `updateTreasuryStatsAfterTransaction` calls
 * that previously wrote to `treasury_overviews` directly from the mobile app
 * (which Firestore security rules always blocked with `allow ... : if false`).
 *
 * Also handles the monthly stats reset: if the current calendar month differs
 * from the stored `lastMonthReset`, monthly counters are zeroed before the
 * delta for the current transaction is applied.
 *
 * Benefits over the old client-side approach:
 *  - Runs under the Admin SDK so it always succeeds regardless of security rules.
 *  - Stats can never be corrupted by a failed client delete (the delete happens
 *    first; the trigger reacts to what actually changed in Firestore).
 *  - Eventually consistent — a crash anywhere in the client cannot leave the
 *    running balance permanently wrong.
 *  - Monthly reset is authoritative and server-driven, not dependent on a
 *    client request being the first one in the new month.
 */
export const onTransactionWrite = functionsV1.firestore
  .document("transactions/{transactionId}")
  .onWrite(async (change, context) => {
    const { transactionId } = context.params;
    const eventId = context.eventId;

    const beforeData = change.before.exists
      ? (change.before.data() as TransactionDocument)
      : null;
    const afterData = change.after.exists
      ? (change.after.data() as TransactionDocument)
      : null;

    const groupId = afterData?.groupId ?? beforeData?.groupId;
    if (!groupId) {
      functions.logger.warn(
        `onTransactionWrite: no groupId found for transaction ${transactionId}. Skipping.`,
      );
      return null;
    }

    const signedContribution = (doc: TransactionDocument | null): number => {
      if (!doc) return 0;
      return doc.type === "income" ? doc.amount : -doc.amount;
    };

    const balanceDelta =
      signedContribution(afterData) - signedContribution(beforeData);
    const monthlyIncomeDelta =
      (afterData?.type === "income" ? afterData.amount : 0) -
      (beforeData?.type === "income" ? beforeData.amount : 0);
    const monthlyExpensesDelta =
      (afterData?.type === "expense" ? afterData.amount : 0) -
      (beforeData?.type === "expense" ? beforeData.amount : 0);

    if (
      balanceDelta === 0 &&
      monthlyIncomeDelta === 0 &&
      monthlyExpensesDelta === 0
    ) {
      functions.logger.debug(
        `onTransactionWrite: no balance change for transaction ${transactionId}. Skipping.`,
      );
      return null;
    }

    const lockRef = db.collection("processed_transaction_events").doc(eventId);
    const overviewRef = db.collection("treasury_overviews").doc(groupId);

    // ------------------------------------------------------------------
    // Idempotency guard, made atomic with the increment (D-5 hardening).
    //
    // The lock check and the counter update now happen inside a single
    // Firestore transaction: either both commit together, or neither
    // does. This closes the gap the previous lock-create/set/delete
    // dance had — if the increment write landed on Firestore's server
    // but the client never got the acknowledgment, the old code deleted
    // the lock and let a retry double-apply the increment. A Firestore
    // transaction has no such window: a retry either sees the lock
    // already committed (skip) or re-runs the whole transaction cleanly.
    // ------------------------------------------------------------------
    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        functions.logger.info(
          `onTransactionWrite: event ${eventId} (transaction ${transactionId}) already processed; skipping.`,
        );
        return;
      }

      const overviewSnap = await tx.get(overviewRef);
      const overviewData = overviewSnap.exists
        ? (overviewSnap.data() as TreasuryOverviewDocument)
        : null;

      const lastMonthReset = overviewData?.lastMonthReset?.toDate();
      const needsMonthlyReset = isNewMonth(lastMonthReset);
      const now = new Date();

      const updates: Record<string, unknown> = {
        groupId,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (needsMonthlyReset) {
        updates.monthlyIncome = monthlyIncomeDelta > 0 ? monthlyIncomeDelta : 0;
        updates.monthlyExpenses =
          monthlyExpensesDelta > 0 ? monthlyExpensesDelta : 0;
        updates.lastMonthReset = admin.firestore.Timestamp.fromDate(now);
        functions.logger.info(
          `onTransactionWrite: resetting monthly stats for group ${groupId} ` +
            `(lastMonthReset was ${lastMonthReset?.toISOString() ?? "never"})`,
        );
      } else {
        if (monthlyIncomeDelta !== 0) {
          updates.monthlyIncome =
            admin.firestore.FieldValue.increment(monthlyIncomeDelta);
        }
        if (monthlyExpensesDelta !== 0) {
          updates.monthlyExpenses =
            admin.firestore.FieldValue.increment(monthlyExpensesDelta);
        }
      }

      if (balanceDelta !== 0) {
        updates.balance = admin.firestore.FieldValue.increment(balanceDelta);
      }

      tx.set(lockRef, {
        transactionId,
        eventType: change.after.exists
          ? change.before.exists
            ? "update"
            : "create"
          : "delete",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processed",
      });
      tx.set(overviewRef, updates, { merge: true });

      functions.logger.info(
        `onTransactionWrite: updated treasury_overviews/${groupId} ` +
          `balanceDelta=${balanceDelta} ` +
          `monthlyIncomeDelta=${monthlyIncomeDelta} ` +
          `monthlyExpensesDelta=${monthlyExpensesDelta} ` +
          `monthlyReset=${needsMonthlyReset}`,
      );
    });

    return null;
  });
