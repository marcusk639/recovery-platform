import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface ContributeLiteratureInput {
  title: string;
  author?: string;
  type:
    | "article"
    | "guide"
    | "pamphlet"
    | "meditation"
    | "prayer"
    | "external_link";
  summary: string; // max 500 chars
  externalUrl?: string; // required if type === 'external_link'
  tags?: string[];
  program?: string;
}

interface ContributeLiteratureOutput {
  itemId: string;
}

/**
 * contributeLiterature — Any authenticated user can contribute
 * Item is created with isApproved: false until admin review
 */
export const contributeLiterature = onCall(
  async (
    request: CallableRequest<ContributeLiteratureInput>,
  ): Promise<ContributeLiteratureOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.title || !data.title.trim()) {
      throw new HttpsError("invalid-argument", "title is required.");
    }
    if (!data.summary || !data.summary.trim()) {
      throw new HttpsError("invalid-argument", "summary is required.");
    }
    if (data.summary.trim().length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "summary must be 500 characters or fewer.",
      );
    }
    if (!data.type) {
      throw new HttpsError("invalid-argument", "type is required.");
    }
    if (data.type === "external_link" && !data.externalUrl) {
      throw new HttpsError(
        "invalid-argument",
        "externalUrl is required for external_link type.",
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const itemRef = db.collection("literature_index").doc();

    const itemData: Record<string, any> = {
      id: itemRef.id,
      title: data.title.trim(),
      type: data.type,
      source: "contributed",
      summary: data.summary.trim(),
      tags: data.tags || [],
      contributedBy: callerId,
      isApproved: false,
      saveCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (data.author) itemData.author = data.author.trim();
    if (data.externalUrl) itemData.externalUrl = data.externalUrl.trim();
    if (data.program) itemData.program = data.program;

    await itemRef.set(itemData);

    logger.info(`Literature contributed: itemId=${itemRef.id} by=${callerId}`);

    return { itemId: itemRef.id };
  },
);
