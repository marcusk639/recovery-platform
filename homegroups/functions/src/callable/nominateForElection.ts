import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";

interface NominateData {
  electionId: string;
  nomineeUserId: string;
  nomineeStatement?: string;
}

interface NominateResult {
  success: boolean;
}

/**
 * nominateForElection — Callable Cloud Function
 *
 * Nominates a member for an open election.
 * Auth: must be member of election.groupId.
 * Validates: election status == 'nominations_open', nominee is a group member, not already nominated.
 * Sends FCM to nominee if they were nominated by someone else.
 */
export const nominateForElection = onCall(
  async (request: CallableRequest<NominateData>): Promise<NominateResult> => {
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

    if (electionData.status !== "nominations_open") {
      throw new HttpsError(
        "failed-precondition",
        "Nominations are not currently open for this election.",
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

    // Verify nominee is a member
    const nomineeMemberDoc = await db
      .collection("members")
      .doc(`${groupId}_${data.nomineeUserId}`)
      .get();

    if (!nomineeMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "The nominee is not a member of this group.",
      );
    }

    const nomineeMemberData = nomineeMemberDoc.data()!;
    const nomineeDisplayName: string =
      nomineeMemberData.displayName || "Member";

    // Check if nominee already nominated (not withdrawn)
    const existingNominees: any[] = electionData.nominees || [];
    const alreadyNominated = existingNominees.some(
      (n: any) => n.userId === data.nomineeUserId && !n.withdrawn,
    );

    if (alreadyNominated) {
      throw new HttpsError(
        "already-exists",
        "This member has already been nominated.",
      );
    }

    const now = admin.firestore.Timestamp.now();

    const nominee = {
      userId: data.nomineeUserId,
      displayName: nomineeDisplayName,
      nominatedAt: now,
      nominatedBy: callerId,
      ...(data.nomineeStatement
        ? { nomineeStatement: data.nomineeStatement.trim() }
        : {}),
    };

    await electionRef.update({
      nominees: admin.firestore.FieldValue.arrayUnion(nominee),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `Nominee added: electionId=${data.electionId} nominee=${data.nomineeUserId} by=${callerId}`,
    );

    // Notify nominee if they were nominated by someone else
    if (data.nomineeUserId !== callerId) {
      try {
        await notifyNominee(
          data.nomineeUserId,
          electionData.groupName,
          electionData.positionName,
          data.electionId,
          groupId,
        );
      } catch (err) {
        logger.warn("FCM notification failed for nomination:", err);
      }
    }

    return { success: true };
  },
);

async function notifyNominee(
  nomineeUserId: string,
  groupName: string,
  positionName: string,
  electionId: string,
  groupId: string,
): Promise<void> {
  const userDoc = await db.collection("users").doc(nomineeUserId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data()!;
  const pushEnabled =
    userData.notificationSettings?.allowPushNotifications !== false;
  const tokens: string[] = userData.fcmTokens || [];

  if (!pushEnabled || tokens.length === 0) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `You've Been Nominated — ${groupName}`,
      body: `You've been nominated for ${positionName} — tap to view the election`,
    },
    data: { type: "election_nominated", groupId, electionId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
