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

interface OpenElectionData {
  groupId: string;
  positionId: string;
  nominationsCloseHours?: number;
}

interface OpenElectionResult {
  electionId: string;
}

/**
 * openElection — Callable Cloud Function
 *
 * Creates a new election for a service position with status 'nominations_open'.
 * Auth: must be admin of groupId.
 * Sends FCM to all members announcing nominations are open.
 */
export const openElection = onCall(
  async (
    request: CallableRequest<OpenElectionData>,
  ): Promise<OpenElectionResult> => {
    const { data } = request;
    const callerId = requireAuth(request);
    const callerName =
      request.auth?.token?.name || request.auth?.token?.email || "Admin";

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.positionId) {
      throw new HttpsError("invalid-argument", "positionId is required.");
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
        "Only group admins can open elections.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    const groupName: string = groupSnap.data()!.name || "Group";

    // Load service position
    const positionDoc = await db
      .collection("groups")
      .doc(data.groupId)
      .collection("servicePositions")
      .doc(data.positionId)
      .get();

    if (!positionDoc.exists) {
      throw new HttpsError("not-found", "Service position not found.");
    }

    const positionData = positionDoc.data()!;
    const positionName: string = positionData.name || "Position";

    // Create election document
    const electionRef = db.collection("group_elections").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const electionPayload: Record<string, any> = {
      id: electionRef.id,
      groupId: data.groupId,
      groupName,
      positionId: data.positionId,
      positionName,
      createdBy: callerId,
      createdByName: callerName,
      status: "nominations_open",
      nominees: [],
      votes: {},
      nominationsOpenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (
      typeof data.nominationsCloseHours === "number" &&
      data.nominationsCloseHours > 0
    ) {
      const closeAt = new Date(
        Date.now() + data.nominationsCloseHours * 60 * 60 * 1000,
      );
      electionPayload.nominationsCloseAt =
        admin.firestore.Timestamp.fromDate(closeAt);
    }

    await electionRef.set(electionPayload);

    logger.info(
      `Election opened: electionId=${electionRef.id} groupId=${data.groupId} position=${positionName} by=${callerId}`,
    );

    // Send FCM to all members
    try {
      await notifyGroupMembers(
        data.groupId,
        groupName,
        positionName,
        electionRef.id,
      );
    } catch (err) {
      logger.warn("FCM notification failed for election open:", err);
    }

    return { electionId: electionRef.id };
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
      title: `Nominations Open — ${groupName}`,
      body: `Nominations are open for ${positionName} — tap to nominate`,
    },
    data: { type: "election_nominations_open", groupId, electionId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
