import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";
import { requireAuth } from "../utils/callableWrapper";

interface SaveBylawDraftData {
  groupId: string;
  title: string;
  content: string;
}

interface SaveBylawDraftResult {
  bylawId: string;
}

/**
 * saveBylawDraft — Callable Cloud Function
 *
 * Creates or overwrites group_bylaws/{groupId} with status: 'draft'.
 * Auth: must be admin of groupId.
 * Idempotent: calling again replaces the draft content.
 * Version only increments on ratification.
 */
export const saveBylawDraft = onCall(
  async (
    request: CallableRequest<SaveBylawDraftData>,
  ): Promise<SaveBylawDraftResult> => {
    const { data } = request;
    const callerId = requireAuth(request);

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.title || !data.title.trim()) {
      throw new HttpsError("invalid-argument", "title is required.");
    }
    if (!data.content || !data.content.trim()) {
      throw new HttpsError("invalid-argument", "content is required.");
    }

    // Admin check (parallel fetch for performance)
    const [callerMemberDoc, groupDoc] = await Promise.all([
      db.collection("members").doc(`${data.groupId}_${callerId}`).get(),
      db.collection("groups").doc(data.groupId).get(),
    ]);

    if (!groupDoc.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    const callerData = callerMemberDoc.data()!;
    const isAdmin =
      callerData.isAdmin === true || (callerData.roles || []).includes("admin");

    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can manage bylaws.",
      );
    }

    assertGroupActive(groupDoc.data()!);

    const groupName: string = groupDoc.data()!.name || "Group";

    // Load existing bylaw doc to preserve version and createdAt
    const bylawRef = db.collection("group_bylaws").doc(data.groupId);
    const existingBylaw = await bylawRef.get();

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (existingBylaw.exists) {
      const existingData = existingBylaw.data()!;
      await bylawRef.update({
        title: data.title.trim(),
        content: data.content.trim(),
        status: "draft",
        lastEditedBy: callerId,
        updatedAt: now,
        // Preserve: version, createdAt, createdBy
        groupName,
      });
    } else {
      await bylawRef.set({
        groupId: data.groupId,
        groupName,
        title: data.title.trim(),
        content: data.content.trim(),
        version: 0,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        createdBy: callerId,
        lastEditedBy: callerId,
      });
    }

    logger.info(`Bylaw draft saved: groupId=${data.groupId} by=${callerId}`);

    return { bylawId: data.groupId };
  },
);
