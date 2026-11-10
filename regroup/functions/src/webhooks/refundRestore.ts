import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

/**
 * Puts a refunded rent payment back on the resident's balance (#198; owner
 * decision 2026-11-09). Only for a payment that lowered rentOwed when it
 * succeeded (rentApplied), and never more than it took off. Stripe's
 * amount_refunded is cumulative, so refundRestoredCents on the payment doc
 * records how much has been put back, and a repeated or later event restores
 * only the difference. The read and both writes are one transaction.
 *
 * Returns the cents put back (0 when there was nothing to do).
 */
export async function restoreRefundedRent(
  db: admin.firestore.Firestore,
  paymentIntentId: string,
  amountRefundedCents: number,
): Promise<number> {
  const paymentRef = db.collection("payments").doc(paymentIntentId);
  const restored = await db.runTransaction(async (txn) => {
    const payment = await txn.get(paymentRef);
    if (!payment.exists || payment.get("rentApplied") !== true) return 0;
    const guestId = payment.get("guestId");
    if (typeof guestId !== "string" || !guestId) return 0;

    const applied = Number(payment.get("rentAppliedAmountCents") ?? payment.get("amount") ?? 0);
    const target = Math.min(amountRefundedCents, applied);
    const already = Number(payment.get("refundRestoredCents") ?? 0);
    const delta = target - already;
    if (!(delta > 0)) return 0;

    txn.update(db.collection("guests").doc(guestId), {
      rentOwed: admin.firestore.FieldValue.increment(delta),
    });
    txn.set(paymentRef, { refundRestoredCents: target }, { merge: true });
    return delta;
  });

  if (restored > 0) {
    logger.info("charge.refunded: put the refund back on the balance", {
      paymentIntentId,
      restoredCents: restored,
    });
  }
  return restored;
}
