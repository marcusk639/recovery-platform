import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface OpenElectionVotingData {
  electionId: string;
  groupId: string;
}

interface OpenElectionVotingResult {
  success: boolean;
}

/**
 * openElectionVoting — Callable Cloud Function
 *
 * Transitions an election from 'nominations_open' to 'voting_open'.
 * Auth: must be admin of groupId.
 * Sends FCM notification to group members (non-fatal on failure).
 * Returns { success: true }.
 */
export const openElectionVoting = onCall(
  async (
    request: CallableRequest<OpenElectionVotingData>,
  ): Promise<OpenElectionVotingResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.electionId) {
      throw new HttpsError("invalid-argument", "electionId is required.");
    }
    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }

    // Admin check + group fetch (parallel)
    const [callerMemberDoc, groupSnap] = await Promise.all([
      db.collection("members").doc(`${data.groupId}_${callerId}`).get(),
      db.collection("groups").doc(data.groupId).get(),
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
        "Only group admins can open voting.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // Load election
    const electionRef = db.collection("group_elections").doc(data.electionId);
    const electionDoc = await electionRef.get();

    if (!electionDoc.exists) {
      throw new HttpsError("not-found", "Election not found.");
    }

    const electionData = electionDoc.data()!;

    // Verify election belongs to the provided groupId
    if (electionData.groupId !== data.groupId) {
      throw new HttpsError(
        "permission-denied",
        "Election does not belong to this group.",
      );
    }

    // Status guard — must be nominations_open to transition
    if (electionData.status !== "nominations_open") {
      throw new HttpsError(
        "failed-precondition",
        "Election must be in nominations_open status to open voting.",
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    await electionRef.update({
      status: "voting_open",
      votingOpenAt: now,
      updatedAt: now,
    });

    logger.info(
      `Election voting opened: electionId=${data.electionId} groupId=${data.groupId} by=${callerId}`,
    );

    // Send FCM to all group members (non-fatal)
    try {
      await notifyGroupMembers(
        data.groupId,
        electionData.groupName,
        electionData.positionName,
        data.electionId,
      );
    } catch (err) {
      logger.warn("FCM notification failed for open election voting:", err);
    }

    return { success: true };
  },
);

async function notifyGroupMembers(
  groupId: string,
  groupName: string,
  positionName: string,
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

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `Voting Open — ${groupName}`,
      body: `Voting is now open for ${positionName} — tap to cast your vote`,
    },
    data: { type: "election_voting_open", groupId, electionId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
