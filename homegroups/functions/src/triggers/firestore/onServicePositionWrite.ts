import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db } from "../../utils/firebase";

interface ServicePositionData {
  groupId: string;
  name: string;
  currentHolderId?: string | null;
  currentHolderName?: string | null;
  termStartDate?: admin.firestore.Timestamp | null;
  termEndDate?: admin.firestore.Timestamp | null;
  termHistory?: any[];
  updatedAt?: admin.firestore.Timestamp;
}

/**
 * onServicePositionWrite — Firestore trigger
 *
 * Triggered when a service position document is written.
 * Detects holder changes and appends the outgoing holder to termHistory.
 *
 * Path: groups/{groupId}/servicePositions/{positionId}
 */
export const onServicePositionWrite = functionsV1.firestore
  .document("groups/{groupId}/servicePositions/{positionId}")
  .onWrite(async (change, context) => {
    const { groupId, positionId } = context.params;

    // Only process updates (not creates or deletes)
    if (!change.before.exists || !change.after.exists) {
      return null;
    }

    const before = change.before.data() as ServicePositionData;
    const after = change.after.data() as ServicePositionData;

    // Only act if currentHolderId changed
    const previousHolderId = before.currentHolderId;
    const newHolderId = after.currentHolderId;

    if (previousHolderId === newHolderId) {
      return null; // No holder change
    }

    // Only append history if there was a previous holder
    if (!previousHolderId) {
      return null;
    }

    // Get the admin who made the change (best-effort from context)
    // We use a placeholder since Firestore triggers don't expose the writer's UID
    const rotatedBy = "system";

    // Use the event's own timestamp so retries produce the same record,
    // allowing arrayUnion to deduplicate instead of appending duplicates.
    const rotatedAt = admin.firestore.Timestamp.fromDate(
      new Date(context.timestamp)
    );

    const historyRecord: any = {
      holderId: previousHolderId,
      holderName: before.currentHolderName || "Former Member",
      rotatedAt,
      rotatedBy,
    };

    if (before.termStartDate) {
      historyRecord.termStartDate = before.termStartDate;
    }
    if (before.termEndDate) {
      historyRecord.termEndDate = before.termEndDate;
    }

    try {
      const positionRef = db
        .collection("groups")
        .doc(groupId)
        .collection("servicePositions")
        .doc(positionId);

      await positionRef.update({
        termHistory: admin.firestore.FieldValue.arrayUnion(historyRecord),
      });

      functions.logger.info(
        `Term history appended: groupId=${groupId} positionId=${positionId} outgoingHolder=${previousHolderId}`
      );
    } catch (err) {
      functions.logger.error(
        `Error appending term history: groupId=${groupId} positionId=${positionId}`,
        err
      );
    }

    return null;
  });
