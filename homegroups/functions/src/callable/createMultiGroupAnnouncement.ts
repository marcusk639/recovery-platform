import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface CreateMultiGroupAnnouncementData {
  groupIds: string[];
  title: string;
  content: string;
  isPinned?: boolean;
}

interface CreateMultiGroupAnnouncementResult {
  createdCount: number;
  announcementIds: string[];
}

/**
 * createMultiGroupAnnouncement — Callable Cloud Function
 *
 * Lets admins broadcast the same announcement to multiple groups they administer.
 *
 * - Requires auth.
 * - groupIds must be non-empty.
 * - Caller must be admin of ALL specified groups; throws permission-denied otherwise.
 * - Creates identical announcement documents in each group's announcements subcollection.
 * - Notifications are handled automatically by the existing onAnnouncementCreate trigger.
 * - Returns { createdCount, announcementIds }.
 */
export const createMultiGroupAnnouncement = onCall(
  async (
    request: CallableRequest<CreateMultiGroupAnnouncementData>,
  ): Promise<CreateMultiGroupAnnouncementResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;
    const callerName =
      request.auth.token.name || request.auth.token.email || "Admin";

    // --- Input validation ---
    if (!data.groupIds || data.groupIds.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "groupIds must be a non-empty array.",
      );
    }
    if (!data.title || !data.title.trim()) {
      throw new HttpsError("invalid-argument", "title is required.");
    }
    if (!data.content || !data.content.trim()) {
      throw new HttpsError("invalid-argument", "content is required.");
    }

    const title = data.title.trim();
    const content = data.content.trim();
    const isPinned = data.isPinned ?? false;

    // --- Admin check for ALL specified groups ---
    // Each group must have callerId in its admins or adminUids array.
    const groupDocs = await Promise.all(
      data.groupIds.map((groupId) =>
        db.collection("groups").doc(groupId).get(),
      ),
    );

    for (let i = 0; i < data.groupIds.length; i++) {
      const groupId = data.groupIds[i];
      const groupDoc = groupDocs[i];

      if (!groupDoc.exists) {
        throw new HttpsError("not-found", `Group ${groupId} does not exist.`);
      }

      const groupData = groupDoc.data()!;
      const admins: string[] = groupData.admins || [];
      const adminUids: string[] = groupData.adminUids || [];
      const isAdmin = admins.includes(callerId) || adminUids.includes(callerId);

      if (!isAdmin) {
        throw new HttpsError(
          "permission-denied",
          `You are not an admin of group ${groupId}.`,
        );
      }
    }

    // --- Create announcement in each group ---
    const now = admin.firestore.FieldValue.serverTimestamp();
    const announcementIds: string[] = [];
    const failedGroups: string[] = [];

    await Promise.all(
      data.groupIds.map(async (groupId, i) => {
        try {
          const groupData = groupDocs[i].data()!;
          const announcementRef = db
            .collection("groups")
            .doc(groupId)
            .collection("announcements")
            .doc();

          await announcementRef.set({
            title,
            content,
            isPinned,
            createdAt: now,
            updatedAt: now,
            createdBy: callerId,
            createdByName: callerName,
            authorName: callerName,
            groupId,
            userId: callerId,
            memberId: callerId,
            status: "published",
            readBy: [],
            readCount: 0,
            isMultiGroup: true, // Mark as broadcast announcement
          });

          announcementIds.push(announcementRef.id);
        } catch (err) {
          logger.error(
            `Failed to create announcement in group ${groupId}:`,
            err,
          );
          failedGroups.push(groupId);
        }
      }),
    );

    if (failedGroups.length > 0) {
      logger.warn(
        `createMultiGroupAnnouncement: failed for groups: ${failedGroups.join(", ")}`,
      );
    }

    return {
      createdCount: announcementIds.length,
      announcementIds,
    };
  },
);
