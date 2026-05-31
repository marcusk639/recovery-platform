import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import moment from "moment-timezone";
import { db } from "../../utils/firebase";
import {
  MeetingDocument,
  MeetingInstanceDocument,
} from "../../entities/Meeting";
import { generateInstancesForMeeting } from "../../utils/meetingUtils";

export const updateFutureMeetingInstances = functionsV1.firestore
  .document("meetings/{meetingId}")
  .onUpdate(async (change, context) => {
    const meetingId = context.params.meetingId;
    const newData = change.after.data() as MeetingDocument | undefined;
    const previousData = change.before.data() as MeetingDocument | undefined;

    if (!newData || !newData.updatedAt || !newData.groupId) {
      functions.logger.error(`Missing data for updated meeting ${meetingId}`);
      return null;
    }

    const newTs = newData.updatedAt;
    const prevTs = previousData?.updatedAt;

    if (
      newTs &&
      prevTs &&
      typeof newTs.isEqual === "function" &&
      newTs.isEqual(prevTs)
    ) {
      functions.logger.info(
        `Meeting ${meetingId} timestamp unchanged. No propagation needed.`,
      );
      return null;
    }

    const dayChanged = newData.day !== previousData?.day;
    const timeChanged = newData.time !== previousData?.time;
    const shouldRegenerate = dayChanged || timeChanged;

    const now = admin.firestore.Timestamp.now();
    const futureInstancesQuery = db
      .collection("meetingInstances")
      .where("meetingId", "==", meetingId)
      .where("scheduledAt", ">=", now);

    try {
      if (shouldRegenerate) {
        functions.logger.info(
          `Regenerating future instances for meeting ${meetingId} due to day/time change.`,
        );
        const snapshotToDelete = await futureInstancesQuery.get();
        if (!snapshotToDelete.empty) {
          let deleteBatch = db.batch();
          let deleteCount = 0;
          const deletePromises: Promise<FirebaseFirestore.WriteResult[]>[] = [];
          snapshotToDelete.forEach((doc) => {
            deleteBatch.delete(doc.ref);
            deleteCount++;
            if (deleteCount % 450 === 0) {
              deletePromises.push(deleteBatch.commit());
              deleteBatch = db.batch();
            }
          });
          const midDeleteResults = await Promise.allSettled(deletePromises);
          midDeleteResults.forEach((r, i) => {
            if (r.status === "rejected")
              functions.logger.error(`Batch delete ${i} failed:`, r.reason);
          });
          await deleteBatch.commit();
          functions.logger.info(
            `Deleted ${deleteCount} old future instances for meeting ${meetingId}.`,
          );
        }

        const groupDoc = await db
          .collection("groups")
          .doc(newData.groupId)
          .get();
        const groupTimezone = groupDoc.data()?.timezone || "UTC";
        // Use group timezone for accurate date calculations
        const startDate = moment.tz(groupTimezone).startOf("day");
        const endDate = moment.tz(groupTimezone).add(7, "days").endOf("day"); // Regenerate for 7 days
        await generateInstancesForMeeting(
          meetingId,
          newData,
          startDate,
          endDate,
          groupTimezone,
          db,
        );
      } else {
        functions.logger.info(
          `Propagating non-schedule changes to future instances for meeting ${meetingId}.`,
        );
        const instancesSnapshot = await futureInstancesQuery.get();
        if (instancesSnapshot.empty) return null;

        let updateBatch = db.batch();
        let updatedCount = 0;
        const BATCH_LIMIT = 450;
        const updatePromises: Promise<FirebaseFirestore.WriteResult[]>[] = [];

        instancesSnapshot.forEach((doc) => {
          const instanceData = doc.data() as MeetingInstanceDocument;
          const overriddenFields = instanceData.overriddenFields || {};

          // Build update payload, respecting overrides
          const updatePayload: Partial<MeetingInstanceDocument> = {
            templateUpdatedAt: newData.updatedAt, // Always update this
          };

          // Only update fields that aren't overridden
          if (!overriddenFields.scheduledAt) {
            // scheduledAt is only set when day/time changes, which is handled separately
          }

          if (!overriddenFields.location && newData.location !== undefined) {
            updatePayload.location = newData.location ?? null;
          }
          if (!overriddenFields.address && newData.address !== undefined) {
            updatePayload.address = newData.address ?? null;
          }
          if (!overriddenFields.city && newData.city !== undefined) {
            updatePayload.city = newData.city ?? null;
          }
          if (!overriddenFields.state && newData.state !== undefined) {
            updatePayload.state = newData.state ?? null;
          }
          if (!overriddenFields.zip && newData.zip !== undefined) {
            updatePayload.zip = newData.zip ?? null;
          }
          if (!overriddenFields.lat && newData.lat !== undefined) {
            updatePayload.lat = newData.lat ?? null;
          }
          if (!overriddenFields.lng && newData.lng !== undefined) {
            updatePayload.lng = newData.lng ?? null;
          }
          if (
            !overriddenFields.locationName &&
            newData.locationName !== undefined
          ) {
            updatePayload.locationName = newData.locationName ?? null;
          }
          if (!overriddenFields.isOnline && newData.isOnline !== undefined) {
            updatePayload.isOnline = newData.isOnline ?? false;
          }
          if (!overriddenFields.link && newData.onlineLink !== undefined) {
            updatePayload.link = newData.onlineLink ?? null;
          }
          if (
            !overriddenFields.onlineNotes &&
            newData.onlineNotes !== undefined
          ) {
            updatePayload.onlineNotes = newData.onlineNotes ?? null;
          }

          // Always update these fields (not subject to overrides)
          if (newData.name !== undefined) {
            updatePayload.name = newData.name;
          }
          if (newData.type !== undefined) {
            updatePayload.type = newData.type;
          }
          if (newData.format !== undefined) {
            updatePayload.format = newData.format ?? null;
          }

          // Preserve instance-specific fields (never overwrite these)
          // chairpersonId, chairpersonName, instanceNotice, isCancelled are preserved

          // Clean up undefined values
          Object.keys(updatePayload).forEach(
            (key) =>
              (updatePayload as any)[key] === undefined &&
              delete (updatePayload as any)[key],
          );

          if (Object.keys(updatePayload).length > 0) {
            updateBatch.update(doc.ref, updatePayload);
            updatedCount++;
            if (updatedCount % BATCH_LIMIT === 0) {
              updatePromises.push(updateBatch.commit());
              updateBatch = db.batch();
            }
          }
        });

        const midUpdateResults = await Promise.allSettled(updatePromises);
        midUpdateResults.forEach((r, i) => {
          if (r.status === "rejected")
            functions.logger.error(`Batch update ${i} failed:`, r.reason);
        });
        if (updatedCount % BATCH_LIMIT !== 0 && updatedCount > 0) {
          await updateBatch.commit();
        }
        functions.logger.info(
          `Successfully propagated updates to ${updatedCount} future instances for meeting ${meetingId}.`,
        );
      }
      return { success: true };
    } catch (error) {
      functions.logger.error(
        `Error processing update trigger for meeting ${meetingId}:`,
        error,
      );
      return null;
    }
  });
