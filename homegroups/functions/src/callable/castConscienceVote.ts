import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface CastVoteData {
  voteId: string;
  option: string;
}

interface CastVoteResult {
  success: boolean;
}

/**
 * castConscienceVote — Callable Cloud Function
 *
 * Allows a group member to cast (or change) their vote on an open conscience vote.
 * Auth: must be a member of the vote's group.
 * Vote counts are NOT returned (hidden until vote is closed).
 * Idempotent: calling again with a different option replaces the previous vote.
 */
export const castConscienceVote = onCall(
  async (request: CallableRequest<CastVoteData>): Promise<CastVoteResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    // --- Input validation ---
    if (!data.voteId) {
      throw new HttpsError("invalid-argument", "voteId is required.");
    }
    if (!data.option) {
      throw new HttpsError("invalid-argument", "option is required.");
    }

    // --- Fetch vote document ---
    const voteDoc = await db
      .collection("group_conscience_votes")
      .doc(data.voteId)
      .get();

    if (!voteDoc.exists) {
      throw new HttpsError("not-found", "Vote not found.");
    }

    const voteData = voteDoc.data()!;

    // --- Check vote is open ---
    if (voteData.status !== "open") {
      throw new HttpsError(
        "failed-precondition",
        "This vote is no longer open.",
      );
    }

    // --- Validate option is in the vote's options list ---
    const validOptions: string[] = voteData.options || [];
    if (!validOptions.includes(data.option)) {
      throw new HttpsError(
        "invalid-argument",
        `"${data.option}" is not a valid option for this vote. Valid options: ${validOptions.join(", ")}`,
      );
    }

    // --- Check caller is a group member ---
    const callerMemberDoc = await db
      .collection("members")
      .doc(`${voteData.groupId}_${callerId}`)
      .get();

    if (!callerMemberDoc.exists) {
      throw new HttpsError("permission-denied", "Only group members can vote.");
    }

    // --- Record vote (idempotent — overwrites previous vote) ---
    await voteDoc.ref.update({
      [`votes.${callerId}`]: data.option,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `Conscience vote cast: voteId=${data.voteId} voter=${callerId} option=${data.option}`,
    );

    return { success: true };
  },
);
