import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { parseInput } from '../validation';
import { assertHouseMoneyStaff, HouseAdminFields } from '../util/houseAuth';

const schema = z.object({
  houseId: z.string().min(1),
  paymentId: z.string().min(1),
});

/**
 * Staff mark a failed payment as handled off the app, which clears it from the
 * Payment Dashboard's failed list (#238). The payments rules refuse client
 * updates, so this is the only way to write the status. It moves no money: a
 * payment collected by hand is recorded separately, as a manual payment, which
 * lowers the resident's balance. The webhook treats resolved_offline as paid,
 * so a late payment_failed for the same PaymentIntent leaves it alone.
 */
export const markPaymentResolvedOffline = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const uid = request.auth.uid;
  const { houseId, paymentId } = parseInput(schema, request.data);

  const db = admin.firestore();
  const houseSnap = await db.collection('houses').doc(houseId).get();
  if (!houseSnap.exists) {
    throw new HttpsError('not-found', 'House not found');
  }
  await assertHouseMoneyStaff(
    uid,
    houseId,
    houseSnap.data() as HouseAdminFields,
    "Only the house's owner or managers can resolve payments",
  );

  const paymentRef = db.collection('payments').doc(paymentId);
  await db.runTransaction(async (txn) => {
    const payment = await txn.get(paymentRef);
    // Another house's payment reads as missing, so its existence doesn't leak.
    if (!payment.exists || payment.get('houseId') !== houseId) {
      throw new HttpsError('not-found', 'Payment not found');
    }
    if (payment.get('status') !== 'failed') {
      throw new HttpsError('failed-precondition', 'Only a failed payment can be resolved');
    }
    txn.update(paymentRef, {
      status: 'resolved_offline',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  logger.info('markPaymentResolvedOffline: resolved', { houseId, paymentId });
  return { status: 'resolved_offline' };
});
