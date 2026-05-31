import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface VoteData {
  requestId: string;
  vote: "yes" | "no" | "abstain";
}

export const voteOnAdminRemoval = onCall(
  async (
    request: CallableRequest<VoteData>,
  ): Promise<{ success: boolean; message: string }> => {
    const { data, auth: context } = request;

    if (!context)
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    const callerId = context.uid;

    if (!data.requestId || !["yes", "no", "abstain"].includes(data.vote)) {
      throw new HttpsError(
        "invalid-argument",
        "requestId and vote (yes/no/abstain) are required.",
      );
    }

    const requestDoc = await db
      .collection("admin_removal_requests")
      .doc(data.requestId)
      .get();
    if (!requestDoc.exists)
      throw new HttpsError("not-found", "Removal request not found.");

    const removalData = requestDoc.data()!;

    if (removalData.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        `Vote is closed (status: ${removalData.status}).`,
      );
    }

    const now = admin.firestore.Timestamp.now();
    if (removalData.expiresAt.toMillis() < now.toMillis()) {
      throw new HttpsError("failed-precondition", "Vote has expired.");
    }

    if (callerId === removalData.targetAdminId) {
      throw new HttpsError(
        "permission-denied",
        "The targeted admin cannot vote on their own removal.",
      );
    }

    const callerMemberDoc = await db
      .collection("members")
      .doc(`${removalData.groupId}_${callerId}`)
      .get();
    if (!callerMemberDoc.exists) {
      throw new HttpsError("permission-denied", "Only group members can vote.");
    }

    const callerName = callerMemberDoc.data()?.displayName || "A member";

    const total = removalData.totalEligibleVoters;
    const threshold = Math.ceil((total * 2) / 3);

    const result = await db.runTransaction(async (transaction) => {
      const voteRef = db
        .collection("admin_removal_requests")
        .doc(data.requestId)
        .collection("votes")
        .doc(callerId);

      // Read all existing votes BEFORE any writes (Firestore transaction requirement)
      const allVotesSnapshot = await transaction.get(
        db
          .collection("admin_removal_requests")
          .doc(data.requestId)
          .collection("votes"),
      );

      // Write the vote AFTER reads
      transaction.set(voteRef, {
        userId: callerId,
        userName: callerName,
        vote: data.vote,
        votedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      let votesFor = 0,
        votesAgainst = 0,
        votesAbstain = 0;
      allVotesSnapshot.docs.forEach((doc) => {
        // Skip the current voter's old doc since we're overwriting it in this transaction
        if (doc.id === callerId) {
          // Use the new vote value instead
          if (data.vote === "yes") votesFor++;
          else if (data.vote === "no") votesAgainst++;
          else if (data.vote === "abstain") votesAbstain++;
          return;
        }
        const v = doc.data().vote;
        if (v === "yes") votesFor++;
        else if (v === "no") votesAgainst++;
        else if (v === "abstain") votesAbstain++;
      });

      // If this is a new voter (not yet in snapshot), count their vote
      if (!allVotesSnapshot.docs.some((doc) => doc.id === callerId)) {
        if (data.vote === "yes") votesFor++;
        else if (data.vote === "no") votesAgainst++;
        else if (data.vote === "abstain") votesAbstain++;
      }

      const definitivelyFailed = votesAgainst > Math.floor(total / 3);

      let newStatus = "pending";
      let resolvedAt: admin.firestore.FieldValue | undefined;

      if (votesFor >= threshold) {
        newStatus = "approved";
        resolvedAt = admin.firestore.FieldValue.serverTimestamp();
      } else if (definitivelyFailed) {
        newStatus = "rejected";
        resolvedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      const updateData: Record<string, any> = {
        votesFor,
        votesAgainst,
        votesAbstain,
        status: newStatus,
      };
      if (resolvedAt) updateData.resolvedAt = resolvedAt;
      transaction.update(requestDoc.ref, updateData);

      return { newStatus, votesFor, votesAgainst, votesAbstain };
    });

    const { newStatus, votesFor, votesAgainst, votesAbstain } = result;

    if (newStatus === "approved") {
      await removeAdmin(removalData.groupId, removalData.targetAdminId);
      logger.info(
        `Admin ${removalData.targetAdminId} removed from group ${removalData.groupId} by vote`,
      );
    }

    logger.info(
      `Vote: request=${data.requestId} voter=${callerId} vote=${data.vote} tally=${votesFor}/${votesAgainst}/${votesAbstain}`,
    );
    return { success: true, message: "Vote recorded successfully." };
  },
);

async function removeAdmin(groupId: string, userId: string): Promise<void> {
  const batch = db.batch();
  const memberRef = db.collection("members").doc(`${groupId}_${userId}`);
  batch.update(memberRef, {
    isAdmin: false,
    roles: admin.firestore.FieldValue.arrayRemove("admin"),
  });
  const groupRef = db.collection("groups").doc(groupId);
  batch.update(groupRef, {
    admins: admin.firestore.FieldValue.arrayRemove(userId),
    adminUids: admin.firestore.FieldValue.arrayRemove(userId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
