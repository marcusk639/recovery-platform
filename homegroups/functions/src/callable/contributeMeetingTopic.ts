import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface ContributeTopicInput {
  title: string;
  description: string; // max 400 chars
  category:
    | "discussion"
    | "step_study"
    | "big_book_theme"
    | "speaker_prompt"
    | "seasonal";
  stepNumber?: number;
  tags?: string[];
}

interface ContributeTopicOutput {
  topicId: string;
}

/**
 * contributeMeetingTopic — Any authenticated user can contribute a meeting topic
 * Topic is created with isApproved: false until admin review
 */
export const contributeMeetingTopic = onCall(
  async (
    request: CallableRequest<ContributeTopicInput>,
  ): Promise<ContributeTopicOutput> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;
    const callerName =
      request.auth.token.name || request.auth.token.email || "Member";

    if (!data.title || !data.title.trim()) {
      throw new HttpsError("invalid-argument", "title is required.");
    }
    if (!data.description || !data.description.trim()) {
      throw new HttpsError("invalid-argument", "description is required.");
    }
    if (data.description.trim().length > 400) {
      throw new HttpsError(
        "invalid-argument",
        "description must be 400 characters or fewer.",
      );
    }
    if (!data.category) {
      throw new HttpsError("invalid-argument", "category is required.");
    }

    const validCategories = [
      "discussion",
      "step_study",
      "big_book_theme",
      "speaker_prompt",
      "seasonal",
    ];
    if (!validCategories.includes(data.category)) {
      throw new HttpsError("invalid-argument", "Invalid category.");
    }

    if (
      data.category === "step_study" &&
      (typeof data.stepNumber !== "number" ||
        data.stepNumber < 1 ||
        data.stepNumber > 12)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "stepNumber (1-12) is required for step_study topics.",
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const topicRef = db.collection("meeting_topics").doc();

    const topicData: Record<string, any> = {
      id: topicRef.id,
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      tags: data.tags || [],
      contributedBy: callerId,
      contributorName: callerName,
      isApproved: false,
      useCount: 0,
      createdAt: now,
    };

    if (data.category === "step_study" && typeof data.stepNumber === "number") {
      topicData.stepNumber = data.stepNumber;
    }

    await topicRef.set(topicData);

    logger.info(
      `Meeting topic contributed: topicId=${topicRef.id} by=${callerId}`,
    );

    return { topicId: topicRef.id };
  },
);
