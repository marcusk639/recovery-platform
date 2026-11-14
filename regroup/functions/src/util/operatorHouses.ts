import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { operatorStatusToHouseStatus } from './entitlement';

/**
 * Writes an operator's subscription status to their houses (found by
 * `ownerId`, which createHouses sets to the operator's uid), for a callable
 * that changes the subscription itself, such as replacing a canceled one: the
 * webhooks that would otherwise follow can arrive before the operator's record
 * points at the new subscription, and skip it. A live status ends any grace.
 * Returns the number of houses written.
 */
export async function setOperatorHousesStatus(
  operatorUid: string,
  status: string,
): Promise<number> {
  const houseStatus = operatorStatusToHouseStatus(status);
  if (!houseStatus) {
    logger.warn("setOperatorHousesStatus: status houses don't know; houses unchanged", {
      operatorUid,
      status,
    });
    return 0;
  }
  const db = admin.firestore();
  const snap = await db.collection('houses').where('ownerId', '==', operatorUid).get();
  if (snap.docs.length === 0) return 0;
  const live = houseStatus === 'active' || houseStatus === 'trialing';
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      subscriptionStatus: houseStatus,
      ...(live ? { guestGraceEndsAt: admin.firestore.FieldValue.delete() } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  logger.info('setOperatorHousesStatus', {
    operatorUid,
    status: houseStatus,
    houseCount: snap.docs.length,
  });
  return snap.docs.length;
}
