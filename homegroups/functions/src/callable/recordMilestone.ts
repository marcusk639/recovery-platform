import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { db, messaging } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface RecordMilestoneData {
  groupId: string;
  memberId: string; // document ID in members: {groupId}_{userId}
  days: number;
  sobrietyDate?: string; // ISO string, required on first record
  notes?: string;
}

interface RecordMilestoneResult {
  success: boolean;
  days: number;
  nextMilestoneDate?: string;
  nextMilestoneDays?: number;
}

/** Milestone thresholds in days */
export const MILESTONE_THRESHOLDS = [30, 60, 90, 180, 270, 365];

/**
 * Returns the next milestone threshold (in days) after the given day count.
 * After 365, milestones occur every 365 days.
 */
export function getNextMilestoneThreshold(currentDays: number): number {
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (currentDays < threshold) return threshold;
  }
  // Every 365 after 365
  const yearCount = Math.floor(currentDays / 365);
  return (yearCount + 1) * 365;
}

/**
 * Computes the next milestone date given a sobriety start date and the days
 * count of the milestone just reached.
 */
export function computeNextMilestoneDate(
  sobrietyDate: Date,
  currentDays: number,
): { nextDate: Date; nextDays: number } {
  const nextDays = getNextMilestoneThreshold(currentDays);
  const nextDate = new Date(
    sobrietyDate.getTime() + nextDays * 24 * 60 * 60 * 1000,
  );
  return { nextDate, nextDays };
}

/**
 * Internal handler — exported for testing.
 * recordMilestone callable: records a sobriety chip for a group member.
 *
 * Auth check: caller must be admin of groupId.
 * Creates/updates groups/{groupId}/milestones/{memberId}.
 * Sends FCM to the member and to all group members with celebrations enabled.
 */
export async function recordMilestoneHandler(
  request: CallableRequest<RecordMilestoneData>,
): Promise<RecordMilestoneResult> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const callerId = request.auth.uid;
  const { data } = request;

  // --- Input validation ---
  if (!data.groupId) {
    throw new HttpsError("invalid-argument", "groupId is required.");
  }
  if (!data.memberId) {
    throw new HttpsError("invalid-argument", "memberId is required.");
  }
  if (!data.days || data.days <= 0) {
    throw new HttpsError("invalid-argument", "days must be a positive number.");
  }

  const { groupId, memberId, days, notes } = data;

  // --- Verify group exists ---
  const groupRef = db.collection("groups").doc(groupId);
  const groupDoc = await groupRef.get();
  if (!groupDoc.exists) {
    throw new HttpsError("not-found", `Group ${groupId} does not exist.`);
  }
  const groupData = groupDoc.data()!;

  // --- Verify caller is admin ---
  const callerMemberDocId = `${groupId}_${callerId}`;
  const callerMemberDoc = await db
    .collection("members")
    .doc(callerMemberDocId)
    .get();

  const isAdmin =
    (groupData.admins || []).includes(callerId) ||
    (groupData.adminUids || []).includes(callerId) ||
    (callerMemberDoc.exists &&
      ((callerMemberDoc.data()!.roles || []).includes("admin") ||
        callerMemberDoc.data()!.isAdmin === true));

  if (!isAdmin) {
    throw new HttpsError(
      "permission-denied",
      "You must be a group admin to record milestones.",
    );
  }

  // --- Verify subscription is active ---
  assertGroupActive(groupData);

  // --- Load target member ---
  const targetMemberDoc = await db.collection("members").doc(memberId).get();

  if (!targetMemberDoc.exists) {
    throw new HttpsError(
      "not-found",
      `Member ${memberId} does not exist in this group.`,
    );
  }
  const targetMemberData = targetMemberDoc.data()!;
  const targetUserId: string = targetMemberData.userId;
  const targetDisplayName: string = targetMemberData.displayName || "A Member";

  // --- Resolve sobriety date ---
  let sobrietyDateTs: Timestamp;
  const existingMilestoneDoc = await groupRef
    .collection("milestones")
    .doc(memberId)
    .get();

  if (
    existingMilestoneDoc.exists &&
    existingMilestoneDoc.data()?.sobrietyDate
  ) {
    sobrietyDateTs = existingMilestoneDoc.data()!.sobrietyDate;
  } else {
    // First record — sobrietyDate is required
    if (!data.sobrietyDate) {
      throw new HttpsError(
        "invalid-argument",
        "sobrietyDate (ISO string) is required for the first milestone record.",
      );
    }
    const parsedDate = new Date(data.sobrietyDate);
    if (isNaN(parsedDate.getTime())) {
      throw new HttpsError(
        "invalid-argument",
        "sobrietyDate must be a valid ISO date string.",
      );
    }
    sobrietyDateTs = Timestamp.fromDate(parsedDate);
  }

  const sobrietyDate = sobrietyDateTs.toDate();

  // --- Compute next milestone ---
  const { nextDate, nextDays } = computeNextMilestoneDate(sobrietyDate, days);

  // --- Build milestone record ---
  const chipGivenAt = Timestamp.now();
  const newRecord = {
    days,
    chipGivenAt,
    chipGivenBy: callerId,
    ...(notes ? { notes } : {}),
  };

  // --- Upsert milestone document ---
  const milestoneRef = groupRef.collection("milestones").doc(memberId);

  if (existingMilestoneDoc.exists) {
    await milestoneRef.update({
      milestones: admin.firestore.FieldValue.arrayUnion(newRecord),
      nextMilestoneDate: Timestamp.fromDate(nextDate),
      nextMilestoneDays: nextDays,
    });
  } else {
    await milestoneRef.set({
      userId: targetUserId,
      displayName: targetDisplayName,
      sobrietyDate: sobrietyDateTs,
      milestones: [newRecord],
      nextMilestoneDate: Timestamp.fromDate(nextDate),
      nextMilestoneDays: nextDays,
    });
  }

  // --- Send FCM notifications ---
  const yearCount = Math.floor(days / 365);
  const daysLabel =
    days >= 365
      ? `${yearCount} ${yearCount === 1 ? "year" : "years"}`
      : `${days} days`;

  // FCM to the member themselves
  const targetUserDocSnap = await db
    .collection("users")
    .doc(targetUserId)
    .get();
  if (targetUserDocSnap.exists) {
    const targetUserData = targetUserDocSnap.data()!;
    const memberTokens: string[] = targetUserData.fcmTokens || [];
    const pushEnabled =
      targetUserData.notificationSettings?.allowPushNotifications !== false;
    if (pushEnabled && memberTokens.length > 0) {
      try {
        await messaging.sendEachForMulticast({
          tokens: memberTokens,
          notification: {
            title: `Congratulations on ${daysLabel}!`,
            body: "Your group is proud of you. Keep up the amazing work!",
          },
          data: {
            type: "milestone_personal",
            groupId,
            days: String(days),
          },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        });
      } catch (err) {
        logger.warn("Failed to send personal milestone FCM:", err);
      }
    }
  }

  // FCM to all group members with celebrations enabled
  const groupMembersSnap = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();

  const groupMemberUserIds = groupMembersSnap.docs
    .map((d) => d.data().userId as string)
    .filter((uid) => uid !== targetUserId);

  const groupTokens: string[] = [];
  await Promise.all(
    groupMemberUserIds.map(async (uid) => {
      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists) return;
      const userData = userSnap.data()!;
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;
      const celebrationsEnabled =
        userData.notificationSettings?.celebrations !== false;
      if (pushEnabled && celebrationsEnabled && userData.fcmTokens?.length) {
        groupTokens.push(...userData.fcmTokens);
      }
    }),
  );

  if (groupTokens.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < groupTokens.length; i += batchSize) {
      const batch = groupTokens.slice(i, i + batchSize);
      try {
        await messaging.sendEachForMulticast({
          tokens: batch,
          notification: {
            title: `${targetDisplayName} is celebrating ${daysLabel}!`,
            body: `${targetDisplayName} reached ${daysLabel} of recovery. Show your support!`,
          },
          data: {
            type: "milestone_group",
            groupId,
            memberId,
            days: String(days),
          },
          android: { priority: "normal" },
          apns: { payload: { aps: { sound: "default" } } },
        });
      } catch (err) {
        logger.warn("Failed to send group milestone FCM batch:", err);
      }
    }
  }

  logger.info(
    `Milestone recorded: ${targetDisplayName} — ${daysLabel} in group ${groupId}`,
  );

  return {
    success: true,
    days,
    nextMilestoneDate: nextDate.toISOString(),
    nextMilestoneDays: nextDays,
  };
}

export const recordMilestone = onCall(recordMilestoneHandler);
