import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface SaveLiteratureInput {
  literatureId: string;
  save: boolean; // true = add, false = remove
}

interface SaveLiteratureOutput {
  saved: boolean;
  newCount: number;
}

/**
 * saveLiteratureItem — Adds/removes a literature item from the user's savedLiteratureIds
 *
 * Uses Firestore arrayUnion/arrayRemove on users/{uid}.savedLiteratureIds
 * Uses Firestore increment on literature_index/{literatureId}.saveCount
 */
export const saveLiteratureItem = onCall(
  async (
    request: CallableRequest<SaveLiteratureInput>,
  ): Promise<SaveLiteratureOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.literatureId) {
      throw new HttpsError("invalid-argument", "literatureId is required.");
    }

    // Verify item exists
    const itemRef = db.collection("literature_index").doc(data.literatureId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      throw new HttpsError("not-found", "Literature item not found.");
    }

    const userRef = db.collection("users").doc(callerId);

    if (data.save) {
      // Add to user's saved list and increment count
      await Promise.all([
        userRef.update({
          savedLiteratureIds: admin.firestore.FieldValue.arrayUnion(
            data.literatureId,
          ),
        }),
        itemRef.update({
          saveCount: admin.firestore.FieldValue.increment(1),
        }),
      ]);
    } else {
      // Remove from user's saved list and decrement count
      await Promise.all([
        userRef.update({
          savedLiteratureIds: admin.firestore.FieldValue.arrayRemove(
            data.literatureId,
          ),
        }),
        itemRef.update({
          saveCount: admin.firestore.FieldValue.increment(-1),
        }),
      ]);
    }

    const updatedItem = await itemRef.get();
    const newCount = (updatedItem.data()?.saveCount as number) || 0;

    logger.info(
      `Literature ${data.save ? "saved" : "unsaved"}: itemId=${data.literatureId} by=${callerId}`,
    );

    return { saved: data.save, newCount };
  },
);
