import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface CloseElectionData {
  electionId: string;
  assignWinner?: boolean;
}

interface CloseElectionResult {
  winnerId: string | null;
  winnerName: string | null;
  tied: boolean;
}

/**
 * closeElection — Callable Cloud Function
 *
 * Closes an election, tallies votes, determines winner or tie.
 * Auth: must be admin of election.groupId.
 * If assignWinner == true && !tied: auto-assigns winner to the service position.
 * Sends FCM to all members with the result.
 */
export const closeElection = onCall(
  async (
    request: CallableRequest<CloseElectionData>,
  ): Promise<CloseElectionResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.electionId) {
      throw new HttpsError("invalid-argument", "electionId is required.");
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
        "Election must be in voting_open status to close.",
      );
    }

    const groupId: string = electionData.groupId;

    // Admin check + group fetch (parallel)
    const [callerMemberDoc, groupSnap] = await Promise.all([
      db.collection("members").doc(`${groupId}_${callerId}`).get(),
      db.collection("groups").doc(groupId).get(),
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

    const callerData = callerMemberDoc.data()!;
    const isAdmin =
      callerData.isAdmin === true || (callerData.roles || []).includes("admin");

    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can close elections.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // Get total eligible voters
    const membersSnapshot = await db
      .collection("members")
      .where("groupId", "==", groupId)
      .get();
    const totalEligible = membersSnapshot.size;

    // Tally votes
    const votes: Record<string, string> = electionData.votes || {};
    const nominees: any[] = electionData.nominees || [];

    // Initialize counts for all non-withdrawn nominees
    const counts: Record<string, number> = {};
    nominees.forEach((n: any) => {
      if (!n.withdrawn) {
        counts[n.userId] = 0;
      }
    });

    Object.values(votes).forEach((nomineeId) => {
      if (counts[nomineeId] !== undefined) {
        counts[nomineeId] += 1;
      }
    });

    const totalVotes = Object.values(counts).reduce((sum, c) => sum + c, 0);

    // Find winner
    let maxVotes = 0;
    let winnerId: string | null = null;
    let winnerName: string | null = null;
    let tied = false;

    Object.entries(counts).forEach(([nomineeId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        winnerId = nomineeId;
        tied = false;
      } else if (count === maxVotes && maxVotes > 0) {
        tied = true;
        winnerId = null;
        winnerName = null;
      }
    });

    if (winnerId && !tied) {
      const winnerNominee = nominees.find((n: any) => n.userId === winnerId);
      winnerName = winnerNominee ? winnerNominee.displayName : null;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    const result = {
      winnerId,
      winnerName,
      counts,
      totalVotes,
      totalEligible,
      tied,
    };

    const updatePayload: Record<string, any> = {
      status: "closed",
      closedAt: now,
      updatedAt: now,
      result,
    };

    // Auto-assign winner to service position if requested
    if (data.assignWinner && !tied && winnerId) {
      const positionRef = db
        .collection("groups")
        .doc(groupId)
        .collection("servicePositions")
        .doc(electionData.positionId);

      await positionRef.update({
        currentHolderId: winnerId,
        currentHolderName: winnerName,
        updatedAt: now,
      });

      updatePayload.winnerAssigned = true;
      logger.info(
        `Election winner assigned: electionId=${data.electionId} winner=${winnerId} position=${electionData.positionId}`,
      );
    }

    await electionRef.update(updatePayload);

    logger.info(
      `Election closed: electionId=${data.electionId} winner=${winnerId} tied=${tied}`,
    );

    // Send FCM to all members
    try {
      await notifyGroupMembers(
        groupId,
        electionData.groupName,
        electionData.positionName,
        winnerId,
        winnerName,
        tied,
        data.electionId,
      );
    } catch (err) {
      logger.warn("FCM notification failed for election close:", err);
    }

    return { winnerId, winnerName, tied };
  },
);

async function notifyGroupMembers(
  groupId: string,
  groupName: string,
  positionName: string,
  winnerId: string | null,
  winnerName: string | null,
  tied: boolean,
  electionId: string,
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

  const body = tied
    ? `Election tied for ${positionName} — admin will determine next steps`
    : `${winnerName} elected as ${positionName}`;

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `Election Result — ${groupName}`,
      body,
    },
    data: { type: "election_closed", groupId, electionId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
