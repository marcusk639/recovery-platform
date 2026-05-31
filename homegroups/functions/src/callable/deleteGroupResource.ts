import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface DeleteResourceInput {
  groupId: string;
  resourceId: string;
}

interface DeleteResourceOutput {
  deleted: boolean;
}

/**
 * deleteGroupResource — Admin only
 * Soft-deletes a group resource and optionally cleans up Firebase Storage
 */
export const deleteGroupResource = onCall(
  async (
    request: CallableRequest<DeleteResourceInput>,
  ): Promise<DeleteResourceOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.resourceId) {
      throw new HttpsError("invalid-argument", "resourceId is required.");
    }

    // Admin check
    const [memberDoc, groupSnap] = await Promise.all([
      db.collection("members").doc(`${data.groupId}_${callerId}`).get(),
      db.collection("groups").doc(data.groupId).get(),
    ]);

    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }

    if (!memberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    const memberData = memberDoc.data()!;
    const isAdmin =
      memberData.isAdmin === true || (memberData.roles || []).includes("admin");

    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can delete group resources.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // Fetch the resource document
    const resourceRef = db
      .collection("groups")
      .doc(data.groupId)
      .collection("resources")
      .doc(data.resourceId);

    const resourceDoc = await resourceRef.get();

    if (!resourceDoc.exists) {
      throw new HttpsError("not-found", "Resource not found.");
    }

    const resourceData = resourceDoc.data()!;

    // If it's an uploaded file, delete from Firebase Storage
    if (resourceData.source === "upload" && resourceData.storageRef) {
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(resourceData.storageRef);
        await file.delete();
        logger.info(`Deleted storage file: ${resourceData.storageRef}`);
      } catch (storageErr) {
        // Log but don't fail — the Firestore soft-delete is the important part
        logger.warn(
          `Failed to delete storage file ${resourceData.storageRef}:`,
          storageErr,
        );
      }
    }

    // Soft delete — set isActive: false
    await resourceRef.update({
      isActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `Group resource soft-deleted: resourceId=${data.resourceId} groupId=${data.groupId} by=${callerId}`,
    );

    return { deleted: true };
  },
);
