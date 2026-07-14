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

interface CreateVoteData {
  groupId: string;
  title: string;
  description?: string;
  options?: string[]; // Defaults to ["Yes", "No", "Abstain"]
  quorumRequired?: number;
  autoCloseHours?: number;
}

interface CreateVoteResult {
  voteId: string;
}

/**
 * createConscienceVote — Callable Cloud Function
 *
 * Creates a group conscience vote (motion) for members to vote on.
 * Auth: must be admin of the specified group.
 * Sends FCM notification to all group members.
 */
export const createConscienceVote = onCall(
  async (
    request: CallableRequest<CreateVoteData>,
  ): Promise<CreateVoteResult> => {
    const { data } = request;
    const callerId = requireAuth(request);
    const callerName =
      request.auth.token.name || request.auth.token.email || "Admin";

    // --- Input validation ---
    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.title || !data.title.trim()) {
      throw new HttpsError("invalid-argument", "title is required.");
    }

    const title = data.title.trim();
    const description = data.description?.trim();
    const options =
      data.options && data.options.length > 0
        ? data.options.map((o) => o.trim()).filter(Boolean)
        : ["Yes", "No", "Abstain"];

    if (options.length < 2) {
      throw new HttpsError(
        "invalid-argument",
        "At least 2 options are required.",
      );
    }

    // --- Admin check + group fetch (parallel) ---
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

    const callerMemberData = callerMemberDoc.data()!;
    const callerRoles: string[] = callerMemberData.roles || [];
    const isAdmin =
      callerMemberData.isAdmin === true || callerRoles.includes("admin");

    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can create conscience votes.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    const groupData = groupSnap.data()!;
    const groupName: string = groupData.name || "Group";

    // --- Create vote document ---
    const voteRef = db.collection("group_conscience_votes").doc();

    const votePayload: Record<string, any> = {
      id: voteRef.id,
      groupId: data.groupId,
      groupName,
      createdBy: callerId,
      createdByName: callerName,
      title,
      options,
      votes: {},
      status: "open",
      openedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (description) {
      votePayload.description = description;
    }
    if (typeof data.quorumRequired === "number" && data.quorumRequired > 0) {
      votePayload.quorumRequired = data.quorumRequired;
    }
    if (typeof data.autoCloseHours === "number" && data.autoCloseHours > 0) {
      const autoCloseAt = new Date(
        Date.now() + data.autoCloseHours * 60 * 60 * 1000,
      );
      votePayload.autoCloseAt = admin.firestore.Timestamp.fromDate(autoCloseAt);
    }

    await voteRef.set(votePayload);

    logger.info(
      `Group conscience vote created: voteId=${voteRef.id} groupId=${data.groupId} by=${callerId}`,
    );

    // --- Send FCM to all group members ---
    try {
      await notifyGroupMembers(data.groupId, groupName, title, voteRef.id);
    } catch (err) {
      logger.warn("FCM notification failed for conscience vote:", err);
    }

    return { voteId: voteRef.id };
  },
);

async function notifyGroupMembers(
  groupId: string,
  groupName: string,
  voteTitle: string,
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
      title: `Group Conscience — ${groupName}`,
      body: `New vote opened: ${voteTitle}`,
    },
    data: { type: "conscience_vote_opened", groupId, voteId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
