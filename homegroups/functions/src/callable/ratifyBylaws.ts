import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface RatifyBylawsData {
  groupId: string;
  voteId: string;
}

interface RatifyBylawsResult {
  version: number;
}

/**
 * ratifyBylaws — Callable Cloud Function
 *
 * Ratifies the current bylaw draft by linking it to a passed conscience vote.
 * Auth: must be admin of groupId.
 * 1. Loads the conscience vote — verifies status == 'closed' && result.winner == 'Yes'
 * 2. Archives previous version to group_bylaws/{groupId}/versions/{N}
 * 3. Increments version, sets status = 'ratified'
 * 4. Sends FCM to all group members
 */
export const ratifyBylaws = onCall(
  async (
    request: CallableRequest<RatifyBylawsData>,
  ): Promise<RatifyBylawsResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.voteId) {
      throw new HttpsError("invalid-argument", "voteId is required.");
    }

    // Admin check (parallel fetch for performance)
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
        "Only group admins can ratify bylaws.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // Load conscience vote
    const voteDoc = await db
      .collection("group_conscience_votes")
      .doc(data.voteId)
      .get();

    if (!voteDoc.exists) {
      throw new HttpsError("not-found", "Conscience vote not found.");
    }

    const voteData = voteDoc.data()!;

    if (voteData.status !== "closed") {
      throw new HttpsError(
        "failed-precondition",
        "Conscience vote must be closed before ratifying bylaws.",
      );
    }

    if (!voteData.result || voteData.result.winner !== "Yes") {
      throw new HttpsError(
        "failed-precondition",
        "Bylaws can only be ratified when the vote result is 'Yes'.",
      );
    }

    // Load current bylaw document
    const bylawRef = db.collection("group_bylaws").doc(data.groupId);
    const bylawDoc = await bylawRef.get();

    if (!bylawDoc.exists) {
      throw new HttpsError(
        "not-found",
        "Bylaw document not found. Save a draft first.",
      );
    }

    const bylawData = bylawDoc.data()!;

    // Prevent duplicate ratification: check the persistent usedVoteIds array
    // and also the legacy ratifyingVoteId field for backward compatibility.
    const usedVoteIds: string[] = bylawData.usedVoteIds || [];
    if (
      usedVoteIds.includes(data.voteId) ||
      bylawData.ratifyingVoteId === data.voteId
    ) {
      throw new HttpsError(
        "already-exists",
        "This vote has already been used to ratify bylaws.",
      );
    }

    const currentVersion: number = bylawData.version || 0;
    const newVersion = currentVersion + 1;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowTimestamp = admin.firestore.Timestamp.now();

    // Archive previous ratified version (if version > 0)
    if (currentVersion > 0) {
      const versionRef = db
        .collection("group_bylaws")
        .doc(data.groupId)
        .collection("versions")
        .doc(String(currentVersion));

      await versionRef.set({
        version: currentVersion,
        content: bylawData.content,
        ratifiedAt: bylawData.ratifiedAt || nowTimestamp,
        ratifyingVoteId: bylawData.ratifyingVoteId || data.voteId,
      });
    }

    // Update bylaw document to ratified; append voteId to usedVoteIds to
    // prevent future duplicate ratification with the same conscience vote.
    await bylawRef.update({
      version: newVersion,
      status: "ratified",
      ratifyingVoteId: data.voteId,
      usedVoteIds: admin.firestore.FieldValue.arrayUnion(data.voteId),
      ratifiedAt: now,
      ratifiedBy: callerId,
      updatedAt: now,
    });

    logger.info(
      `Bylaws ratified: groupId=${data.groupId} version=${newVersion} by=${callerId}`,
    );

    // Send FCM to all group members
    try {
      const groupName: string = bylawData.groupName || "Group";
      await notifyGroupMembers(
        data.groupId,
        groupName,
        newVersion,
        bylawData.title,
      );
    } catch (err) {
      logger.warn("FCM notification failed for bylaw ratification:", err);
    }

    return { version: newVersion };
  },
);

async function notifyGroupMembers(
  groupId: string,
  groupName: string,
  version: number,
  title: string,
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
      title: `Group Guidelines Ratified — ${groupName}`,
      body: `${title} (v${version}) ratified by group conscience — tap to read`,
    },
    data: { type: "bylaws_ratified", groupId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
