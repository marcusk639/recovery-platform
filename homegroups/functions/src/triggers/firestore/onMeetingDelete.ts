import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db } from "../../utils/firebase";

/**
 * Triggered when a meeting document is deleted.
 * Deletes all future instances for the meeting, keeping past instances for historical record.
 */
export const onMeetingDelete = functionsV1.firestore
  .document("meetings/{meetingId}")
  .onDelete(async (snapshot, context) => {
    const meetingId = context.params.meetingId;
    const meetingData = snapshot.data();

    functions.logger.info(
      `Meeting deleted: ${meetingId} for group ${meetingData?.groupId}`
    );

    try {
      const now = admin.firestore.Timestamp.now();

      // Query future instances for this meeting
      const futureInstancesQuery = db
        .collection("meetingInstances")
        .where("meetingId", "==", meetingId)
        .where("scheduledAt", ">=", now);

      const futureInstancesSnapshot = await futureInstancesQuery.get();

      if (futureInstancesSnapshot.empty) {
        functions.logger.info(
          `No future instances to delete for meeting ${meetingId}`
        );
        return { success: true, deletedCount: 0 };
      }

      // Batch delete future instances
      const batch = db.batch();
      let deletedCount = 0;
      const BATCH_LIMIT = 500;

      futureInstancesSnapshot.docs.forEach((doc) => {
        if (deletedCount < BATCH_LIMIT) {
          batch.delete(doc.ref);
          deletedCount++;
        }
      });

      await batch.commit();

      // If there are more instances, delete them in additional batches
      if (futureInstancesSnapshot.size > BATCH_LIMIT) {
        let lastDoc = futureInstancesSnapshot.docs[BATCH_LIMIT - 1];
        let hasMore = true;

        while (hasMore) {
          const nextBatch = db.batch();
          let batchCount = 0;

          const nextQuery = db
            .collection("meetingInstances")
            .where("meetingId", "==", meetingId)
            .where("scheduledAt", ">=", now)
            .startAfter(lastDoc)
            .limit(BATCH_LIMIT);

          const nextSnapshot = await nextQuery.get();

          if (nextSnapshot.empty) {
            hasMore = false;
          } else {
            nextSnapshot.docs.forEach((doc) => {
              nextBatch.delete(doc.ref);
              batchCount++;
            });

            await nextBatch.commit();
            deletedCount += batchCount;
            lastDoc = nextSnapshot.docs[nextSnapshot.docs.length - 1];
            hasMore = nextSnapshot.size === BATCH_LIMIT;
          }
        }
      }

      functions.logger.info(
        `Deleted ${deletedCount} future instances for meeting ${meetingId}`
      );

      return { success: true, deletedCount };
    } catch (error) {
      functions.logger.error(
        `Error deleting instances for meeting ${meetingId}:`,
        error
      );
      return null;
    }
  });
