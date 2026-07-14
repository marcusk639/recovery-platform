import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";
import { requireAuth } from "../utils/callableWrapper";

interface CloseVoteData {
  voteId: string;
}

interface CloseVoteResult {
  success: boolean;
}

/**
 * closeConscienceVote — Callable Cloud Function
 *
 * Closes an open group conscience vote, tallies results, and sends FCM
 * notifications with the outcome to all group members.
 * Auth: must be admin of the vote's group.
 */
export const closeConscienceVote = onCall(
  async (request: CallableRequest<CloseVoteData>): Promise<CloseVoteResult> => {
    const { data } = request;
    const callerId = requireAuth(request);

    // --- Input validation ---
    if (!data.voteId) {
      throw new HttpsError("invalid-argument", "voteId is required.");
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
        "This vote is already closed.",
      );
    }

    // --- Admin check + group fetch (parallel) ---
    const [callerMemberDoc, groupSnap] = await Promise.all([
      db.collection("members").doc(`${voteData.groupId}_${callerId}`).get(),
      db.collection("groups").doc(voteData.groupId).get(),
    ]);

    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    const callerMemberData = callerMemberDoc.data()!;
    const callerRoles: string[] = callerMemberData.roles || [];
    const isAdmin =
      callerMemberData.isAdmin === true || callerRoles.includes("admin");

    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can close conscience votes.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // --- Tally votes ---
    const votes: Record<string, string> = voteData.votes || {};
    const options: string[] = voteData.options || ["Yes", "No", "Abstain"];

    const counts: Record<string, number> = {};
    options.forEach((opt) => {
      counts[opt] = 0;
    });

    Object.values(votes).forEach((option) => {
      if (counts[option] !== undefined) {
        counts[option]++;
      } else {
        counts[option] = 1;
      }
    });

    const totalVotes = Object.values(counts).reduce((sum, n) => sum + n, 0);

    // --- Determine winner (most votes; ties = no winner) ---
    let winner: string | undefined;
    let maxCount = 0;
    let tied = false;

    Object.entries(counts).forEach(([option, count]) => {
      if (count > maxCount) {
        maxCount = count;
        winner = option;
        tied = false;
      } else if (count === maxCount && maxCount > 0) {
        tied = true;
      }
    });

    if (tied) {
      winner = undefined;
    }

    // --- Quorum check ---
    const quorumRequired: number | undefined = voteData.quorumRequired;
    const quorumMet =
      quorumRequired !== undefined ? totalVotes >= quorumRequired : true;

    // --- Get eligible voter count ---
    const membersSnapshot = await db
      .collection("members")
      .where("groupId", "==", voteData.groupId)
      .get();
    const totalEligible = membersSnapshot.docs.length;

    // --- Update vote document ---
    await voteDoc.ref.update({
      status: "closed",
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
      result: {
        counts,
        winner: winner || null,
        quorumMet,
        totalVotes,
        totalEligible,
      },
    });

    logger.info(
      `Conscience vote closed: voteId=${data.voteId} winner=${winner || "tie"} totalVotes=${totalVotes} quorumMet=${quorumMet}`,
    );

    // --- Send FCM to all group members ---
    const resultSummary = winner
      ? `${winner} wins (${counts[winner]} of ${totalVotes} votes)`
      : "No clear winner (tie)";

    try {
      await notifyGroupMembers(
        voteData.groupId,
        voteData.groupName,
        voteData.title,
        resultSummary,
        data.voteId,
      );
    } catch (err) {
      logger.warn("FCM notification failed for conscience vote close:", err);
    }

    return { success: true };
  },
);

async function notifyGroupMembers(
  groupId: string,
  groupName: string,
  voteTitle: string,
  resultSummary: string,
  voteId: string,
): Promise<void> {
  const membersSnapshot = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();

  const memberUserIds = membersSnapshot.docs
    .map((doc) => doc.data().userId as string)
    .filter(Boolean);

  const tokens: string[] = [];

  for (let i = 0; i < memberUserIds.length; i += 10) {
    const batch = memberUserIds.slice(i, i + 10);
    const usersSnapshot = await db
      .collection("users")
      .where("__name__", "in", batch)
      .get();

    usersSnapshot.docs.forEach((doc) => {
      const userData = doc.data();
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;
      if (pushEnabled && userData.fcmTokens?.length) {
        tokens.push(...userData.fcmTokens);
      }
    });
  }

  if (tokens.length === 0) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `Group Conscience Results — ${groupName}`,
      body: `"${voteTitle}": ${resultSummary}`,
    },
    data: { type: "conscience_vote_closed", groupId, voteId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
