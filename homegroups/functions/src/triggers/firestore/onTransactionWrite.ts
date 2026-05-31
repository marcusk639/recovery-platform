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

    // ------------------------------------------------------------------
    // Idempotency guard.
    //
    // Firestore triggers retry the entire handler on uncaught exceptions
    // AND on partial-completion failures (timeout, OOM, network blip
    // between increment landing and the function returning normally).
    // Because the handler applies `FieldValue.increment(±amount)`, a
    // retry would silently double-count the balance.
    //
    // To prevent that: try to atomically `create()` a lock document
    // keyed by `context.eventId` (which Firestore guarantees is stable
    // per delivery). If the create fails with ALREADY_EXISTS, this is a
    // duplicate delivery and we skip. Same pattern as stripeWebhook.ts.
    //
    // On a downstream failure (after the lock is held), we DELETE the
    // lock before rethrowing so the next retry can attempt cleanly.
    // ------------------------------------------------------------------

    const eventId = context.eventId;
    const lockRef = db.collection("processed_transaction_events").doc(eventId);
    try {
      await lockRef.create({
        transactionId,
        eventType: change.after.exists
          ? change.before.exists
            ? "update"
            : "create"
          : "delete",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processing",
      });
    } catch (err: any) {
      if (err.code === 6) {
        // ALREADY_EXISTS — duplicate delivery, already processed
        functions.logger.info(
          `onTransactionWrite: event ${eventId} (transaction ${transactionId}) already processed; skipping.`,
        );
        return null;
      }
      // Firestore unavailable / other create failure — proceed and risk
      // a duplicate rather than drop the event entirely.
      functions.logger.warn(
        `onTransactionWrite: could not claim idempotency lock for event ${eventId}, proceeding`,
        err,
      );
    }

    const beforeData = change.before.exists
      ? (change.before.data() as TransactionDocument)
      : null;
    const afterData = change.after.exists
      ? (change.after.data() as TransactionDocument)
      : null;

    // Derive the groupId from whichever snapshot exists.
    const groupId = afterData?.groupId ?? beforeData?.groupId;
    if (!groupId) {
      functions.logger.warn(
        `onTransactionWrite: no groupId found for transaction ${transactionId}. Skipping.`,
      );
      return null;
    }

    // ------------------------------------------------------------------
    // Compute the net balance delta and monthly-stat deltas.
    //
    // We model the treasury state as:
    //   balance          += income - expense  (running total)
    //   monthlyIncome    += income received this write
    //   monthlyExpenses  += expense incurred this write
    //
    // For each state (before, after) we compute its signed contribution to
    // the balance:
    //   income  → +amount
    //   expense → -amount
    //
    // The net delta is simply: after_contribution - before_contribution.
    // ------------------------------------------------------------------

    const signedContribution = (doc: TransactionDocument | null): number => {
      if (!doc) return 0;
      return doc.type === "income" ? doc.amount : -doc.amount;
    };

    const balanceDelta =
      signedContribution(afterData) - signedContribution(beforeData);

    // Monthly income delta: how much net new income was added by this write.
    const monthlyIncomeDelta =
      (afterData?.type === "income" ? afterData.amount : 0) -
      (beforeData?.type === "income" ? beforeData.amount : 0);

    // Monthly expense delta: how much net new expense was added by this write.
    const monthlyExpensesDelta =
      (afterData?.type === "expense" ? afterData.amount : 0) -
      (beforeData?.type === "expense" ? beforeData.amount : 0);

    // No-op guard: if nothing changed that affects the balance, skip the write.
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

    const overviewRef = db.collection("treasury_overviews").doc(groupId);

    // Check whether we need to reset monthly counters first.
    const overviewSnap = await overviewRef.get();
    const overviewData = overviewSnap.exists
      ? (overviewSnap.data() as TreasuryOverviewDocument)
      : null;

    const lastMonthReset = overviewData?.lastMonthReset?.toDate();
    const needsMonthlyReset = isNewMonth(lastMonthReset);
    const now = new Date();

    // Build the update payload.
    // Use set+merge so the document is created if it doesn't exist yet
    // (e.g. the very first transaction for a new group).
    const updates: Record<string, unknown> = {
      groupId,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (needsMonthlyReset) {
      // Zero out monthly counters and then apply only the current write's
      // delta as the initial value for the new month.
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

    try {
      await overviewRef.set(updates, { merge: true });
      functions.logger.info(
        `onTransactionWrite: updated treasury_overviews/${groupId} ` +
          `balanceDelta=${balanceDelta} ` +
          `monthlyIncomeDelta=${monthlyIncomeDelta} ` +
          `monthlyExpensesDelta=${monthlyExpensesDelta} ` +
          `monthlyReset=${needsMonthlyReset}`,
      );
      // Mark the lock as processed (best-effort; failure here is safe to
      // ignore — the lock's existence alone prevents duplicate processing).
      await lockRef.update({ status: "processed" }).catch(() => {});
    } catch (error) {
      functions.logger.error(
        `onTransactionWrite: failed to update treasury_overviews/${groupId}:`,
        error,
      );
      // Release the lock so the next retry can re-attempt. Without this,
      // a transient Firestore error would permanently leave the treasury
      // out of sync (lock says "processed" but increment never landed).
      await lockRef.delete().catch(() => {});
      throw error;
    }

    return null;
  });
