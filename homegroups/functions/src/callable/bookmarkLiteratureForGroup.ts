import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface BookmarkForGroupInput {
  groupId: string;
  literatureId: string;
  note?: string;
  remove?: boolean; // true = un-bookmark
}

interface BookmarkForGroupOutput {
  bookmarked: boolean;
}

/**
 * bookmarkLiteratureForGroup — Admin only: bookmarks a literature item to a group's library
 */
export const bookmarkLiteratureForGroup = onCall(
  async (
    request: CallableRequest<BookmarkForGroupInput>,
  ): Promise<BookmarkForGroupOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.literatureId) {
      throw new HttpsError("invalid-argument", "literatureId is required.");
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
        "Only group admins can bookmark literature for a group.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    const bookmarkRef = db
      .collection("groups")
      .doc(data.groupId)
      .collection("literatureBookmarks")
      .doc(data.literatureId);

    if (data.remove) {
      await bookmarkRef.delete();
      return { bookmarked: false };
    }

    // Verify the literature item exists
    const itemDoc = await db
      .collection("literature_index")
      .doc(data.literatureId)
      .get();
    if (!itemDoc.exists) {
      throw new HttpsError("not-found", "Literature item not found.");
    }

    if (!itemDoc.data()?.isApproved) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot bookmark an unapproved literature item.",
      );
    }

    const callerName =
      request.auth.token.name || request.auth.token.email || "Admin";

    const bookmarkData: Record<string, any> = {
      literatureId: data.literatureId,
      addedBy: callerId,
      addedByName: callerName,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.note) bookmarkData.note = data.note.trim();

    await bookmarkRef.set(bookmarkData);

    logger.info(
      `Literature bookmarked for group: literatureId=${data.literatureId} groupId=${data.groupId} by=${callerId}`,
    );

    return { bookmarked: true };
  },
);
