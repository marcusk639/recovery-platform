import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface FavoriteTopicInput {
  groupId: string;
  topicId: string;
  remove?: boolean;
  markUsed?: boolean; // if true, increment useCount and set usedAt
}

interface FavoriteTopicOutput {
  favorited: boolean;
}

/**
 * favoriteGroupTopic — Admin or secretary only
 * Adds/removes a meeting topic from the group's favorites
 * Optionally marks the topic as used
 */
export const favoriteGroupTopic = onCall(
  async (
    request: CallableRequest<FavoriteTopicInput>,
  ): Promise<FavoriteTopicOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.topicId) {
      throw new HttpsError("invalid-argument", "topicId is required.");
    }

    // Admin or secretary check
    const memberDoc = await db
      .collection("members")
      .doc(`${data.groupId}_${callerId}`)
      .get();

    if (!memberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    const memberData = memberDoc.data()!;
    const roles: string[] = memberData.roles || [];
    const isAdminOrSecretary =
      memberData.isAdmin === true ||
      roles.includes("admin") ||
      roles.includes("secretary");

    if (!isAdminOrSecretary) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins or secretaries can favorite meeting topics.",
      );
    }

    const favoriteRef = db
      .collection("groups")
      .doc(data.groupId)
      .collection("topicFavorites")
      .doc(data.topicId);

    if (data.remove) {
      await favoriteRef.delete();
      return { favorited: false };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Check if already favorited
    const existingDoc = await favoriteRef.get();

    if (existingDoc.exists && data.markUsed) {
      // Increment use count and set usedAt
      await Promise.all([
        favoriteRef.update({
          usedAt: now,
          useCount: admin.firestore.FieldValue.increment(1),
        }),
        db
          .collection("meeting_topics")
          .doc(data.topicId)
          .update({
            useCount: admin.firestore.FieldValue.increment(1),
          }),
      ]);
    } else if (!existingDoc.exists) {
      // New favorite
      await favoriteRef.set({
        topicId: data.topicId,
        addedBy: callerId,
        addedAt: now,
        useCount: data.markUsed ? 1 : 0,
        ...(data.markUsed ? { usedAt: now } : {}),
      });

      if (data.markUsed) {
        await db
          .collection("meeting_topics")
          .doc(data.topicId)
          .update({
            useCount: admin.firestore.FieldValue.increment(1),
          });
      }
    }

    logger.info(
      `Meeting topic favorited: topicId=${data.topicId} groupId=${data.groupId} by=${callerId}`,
    );

    return { favorited: true };
  },
);
