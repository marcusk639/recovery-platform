import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { parseInput } from '../validation';
import { assertHouseMoneyStaff, HouseAdminFields } from '../util/houseAuth';

// Payment records are keyed by PaymentIntent id (webhook) or an auto-id (manual).
const resolveFailedPaymentSchema = z.object({
  paymentId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/),
});

/**
 * House money staff (owner, co-owner, manager) mark a failed rent payment as
 * resolved off-platform (cash, check, Venmo, Zelle), which takes it off the
 * Payment Dashboard's failed list. payments is server-written only
 * (firestore.rules), so the app can't set this itself (#238).
 *
 * Only the status changes. Money received off-platform is recorded as a manual
 * payment, which is what lowers rentOwed; resolved_offline never counts as
 * collected. A payment that has since succeeded is refused, so paid rent keeps
 * its status, and a repeat for one already resolved is a no-op.
 */
export const resolveFailedPaymentOffline = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
  const uid = request.auth.uid;
  const { paymentId } = parseInput(resolveFailedPaymentSchema, request.data);

  const db = admin.firestore();
  const paymentRef = db.collection('payments').doc(paymentId);
  const payment = await paymentRef.get();
  const houseId = payment.exists ? payment.get('houseId') : undefined;
  if (typeof houseId !== 'string' || houseId.length === 0) {
    throw new HttpsError('not-found', 'Payment not found');
  }
  const house = await db.collection('houses').doc(houseId).get();
  if (!house.exists) throw new HttpsError('not-found', 'Payment not found');
  await assertHouseMoneyStaff(
    uid,
    houseId,
    house.data() as HouseAdminFields,
    'Only house admins can resolve payments',
  );

  // In a transaction so a success the webhook records meanwhile is never overwritten.
  // FieldValue comes from firebase-admin/firestore: on the functions emulator
  // admin.firestore.FieldValue is undefined, so Mark Resolved always failed there.
  const changed = await db.runTransaction(async (tx) => {
    const current = await tx.get(paymentRef);
    const status = current.get('status');
    if (status === 'resolved_offline') return false;
    if (status !== 'failed') {
      throw new HttpsError('failed-precondition', 'Only a failed payment can be marked resolved');
    }
    tx.update(paymentRef, {
      status: 'resolved_offline',
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (changed) logger.info('payment.resolved_offline', { paymentId, houseId });
  return { status: 'resolved_offline' as const };
});
