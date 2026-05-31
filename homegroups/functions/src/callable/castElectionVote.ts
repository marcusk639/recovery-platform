import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface CastElectionVoteData {
  electionId: string;
  nomineeUserId: string;
}

interface CastElectionVoteResult {
  success: boolean;
}

/**
 * castElectionVote — Callable Cloud Function
 *
 * Casts (or changes) a vote in an open election.
 * Auth: must be member of election.groupId.
 * Validates: election status == 'voting_open', nominee exists and not withdrawn.
 * Idempotent: calling again changes the vote.
 * Vote counts hidden until election is closed.
 */
export const castElectionVote = onCall(
  async (
    request: CallableRequest<CastElectionVoteData>,
  ): Promise<CastElectionVoteResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.electionId) {
      throw new HttpsError("invalid-argument", "electionId is required.");
    }
    if (!data.nomineeUserId) {
      throw new HttpsError("invalid-argument", "nomineeUserId is required.");
    }

    // Load election
    const electionRef = db.collection("group_elections").doc(data.electionId);
    const electionDoc = await electionRef.get();

    if (!electionDoc.exists) {
      throw new HttpsError("not-found", "Election not found.");
    }

    const electionData = electionDoc.data()!;

    if (electionData.status !== "voting_open") {
      throw new HttpsError(
        "failed-precondition",
        "Voting is not currently open for this election.",
      );
    }

    const groupId: string = electionData.groupId;

    // Verify caller is a member
    const callerMemberDoc = await db
      .collection("members")
      .doc(`${groupId}_${callerId}`)
      .get();

    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    // Verify nominee is a valid, non-withdrawn nominee
    const nominees: any[] = electionData.nominees || [];
    const validNominee = nominees.find(
      (n: any) => n.userId === data.nomineeUserId && !n.withdrawn,
    );

    if (!validNominee) {
      throw new HttpsError(
        "invalid-argument",
        "The selected nominee is not a valid, active nominee in this election.",
      );
    }

    // Record the vote (idempotent — sets the voter's choice)
    await electionRef.update({
      [`votes.${callerId}`]: data.nomineeUserId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `Election vote cast: electionId=${data.electionId} voter=${callerId} nominee=${data.nomineeUserId}`,
    );

    return { success: true };
  },
);
