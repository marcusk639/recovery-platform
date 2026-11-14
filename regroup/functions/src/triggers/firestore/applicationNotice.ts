import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { houseCollection, notificationCollection, ratsFirestore } from '../../api/firestore';
import { staffUids } from '../../util/houseRoleStore';

/**
 * Notifies the house's staff when a new resident application is submitted.
 *
 * Fires on: create of houses/{houseId}/applications/{appId}
 * Action:   creates a /notifications/{id} document per recipient, which
 *           triggers `notify` to send the push.
 *
 * Recipients are uids: the staff role records (owner, manager, peer leader —
 * the tiers whose admin claim lets them act on applications) plus the house's
 * superAdminId. house.adminIds is deliberately not read: it holds admin-record
 * ids from createAdminId(), not uids, so a notification addressed to one
 * reached nobody.
 */
export const notifyOperatorOnApplication = onDocumentCreated(
  'houses/{houseId}/applications/{appId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const houseId = event.params.houseId;
    const applicantName = (data.applicantName as string) || 'Someone';

    try {
      const houseSnap = await houseCollection.doc(houseId).get();
      if (!houseSnap.exists) return;

      const superAdminId: string = houseSnap.data()?.superAdminId ?? '';
      const recipientIds = [
        ...new Set([...(await staffUids(houseId)), superAdminId].filter(Boolean)),
      ];
      if (recipientIds.length === 0) return;

      const batch = ratsFirestore.batch();
      recipientIds.forEach((userId) => {
        batch.set(notificationCollection.doc(), {
          userId,
          houseId,
          subject: 'New Application Received',
          message: `${applicantName} applied to join your house.`,
          type: 'application-received',
          date: new Date().toISOString(),
          read: false,
        });
      });

      await batch.commit();
      logger.info(
        `notifyOperatorOnApplication: sent ${recipientIds.length} notifications for house ${houseId}`,
      );
    } catch (error) {
      logger.error('notifyOperatorOnApplication: failed to notify staff', {
        houseId,
        error: (error as Error).message,
      });
      throw error;
    }
  },
);
