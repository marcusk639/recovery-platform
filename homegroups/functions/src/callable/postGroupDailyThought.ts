import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface PostThoughtInput {
  groupId: string;
  content: string; // max 500 chars, validated server-side
  date?: string; // YYYY-MM-DD; defaults to today UTC
}

interface PostThoughtOutput {
  thoughtId: string;
}

/**
 * postGroupDailyThought — Admin posts a daily group thought
 *
 * Auth: must be admin of groupId (check adminUids or claims)
 * Validates content length <= 500 chars
 * Writes groups/{groupId}/dailyThoughts/{date} (upsert)
 */
export const postGroupDailyThought = onCall(
  async (
    request: CallableRequest<PostThoughtInput>,
  ): Promise<PostThoughtOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.content || !data.content.trim()) {
      throw new HttpsError("invalid-argument", "content is required.");
    }
    if (data.content.trim().length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "content must be 500 characters or fewer.",
      );
    }

    // Admin check via members collection + subscription check
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
        "Only group admins can post group daily thoughts.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // Determine date — default to today UTC
    const today = new Date();
    const defaultDate = `${today.getUTCFullYear()}-${String(
      today.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const date = data.date || defaultDate;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError(
        "invalid-argument",
        "date must be in YYYY-MM-DD format.",
      );
    }

    // Get caller name
    const callerName =
      request.auth.token.name || request.auth.token.email || "Admin";

    const thoughtRef = db
      .collection("groups")
      .doc(data.groupId)
      .collection("dailyThoughts")
      .doc(date);

    await thoughtRef.set(
      {
        date,
        groupId: data.groupId,
        content: data.content.trim(),
        authorId: callerId,
        authorName: callerName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    logger.info(
      `Group daily thought posted: groupId=${data.groupId} date=${date} by=${callerId}`,
    );

    return { thoughtId: date };
  },
);
