import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface SaveMinutesData {
  businessMeetingId: string;
  groupId: string;
  minutes: {
    date?: any;
    openedAt?: string;
    closedAt?: string;
    chair: string;
    secretary: string;
    attendanceCount: number;
    memberQuorum: boolean;
    guestsPresent?: string;
    openingPrayer: boolean;
    closingPrayer: boolean;
    treasuryReport?: {
      openingBalance: number;
      collection7thTradition: number;
      expenses: number;
      closingBalance: number;
      prudentReserve: number;
      notes?: string;
    };
    agendaItems: {
      itemId: string;
      title: string;
      notes: string;
      outcome: "no_action" | "voted" | "tabled" | "information_only";
    }[];
    decisions: {
      topic: string;
      motionText: string;
      movedBy: string;
      secondedBy?: string;
      voteFor: number;
      voteAgainst: number;
      voteAbstain: number;
      passed: boolean;
      notes?: string;
    }[];
    nextMeetingDate?: any;
    nextMeetingLocation?: string;
    announcements?: string;
  };
}

interface SaveMinutesResult {
  success: boolean;
}

/**
 * saveMeetingMinutes — Callable Cloud Function
 *
 * Creates or overwrites business_meetings/{meetingId}/minutes/record.
 * Auth: must be secretary or admin of groupId.
 * Status is always set to 'draft' — approval is via approveMeetingMinutes.
 */
export const saveMeetingMinutes = onCall(
  async (
    request: CallableRequest<SaveMinutesData>,
  ): Promise<SaveMinutesResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { data } = request;
    const callerId = request.auth.uid;

    if (!data.businessMeetingId) {
      throw new HttpsError(
        "invalid-argument",
        "businessMeetingId is required.",
      );
    }
    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }

    // Verify member is secretary or admin + subscription check
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
    const roles: string[] = callerData.roles || [];
    const isAdmin = callerData.isAdmin === true || roles.includes("admin");
    const isSecretary = roles.includes("secretary");

    if (!isAdmin && !isSecretary) {
      throw new HttpsError(
        "permission-denied",
        "Only secretaries and admins can record minutes.",
      );
    }

    assertGroupActive(groupSnap.data()!);

    // Verify business meeting exists and belongs to this group
    const meetingDoc = await db
      .collection("business_meetings")
      .doc(data.businessMeetingId)
      .get();

    if (!meetingDoc.exists) {
      throw new HttpsError("not-found", "Business meeting not found.");
    }

    const meetingData = meetingDoc.data()!;
    if (meetingData.groupId !== data.groupId) {
      throw new HttpsError(
        "permission-denied",
        "Meeting does not belong to this group.",
      );
    }

    // Derive group name from already-loaded groupSnap
    const groupName: string = groupSnap.data()!.name || "Group";

    const now = admin.firestore.FieldValue.serverTimestamp();
    const minutesRef = db
      .collection("business_meetings")
      .doc(data.businessMeetingId)
      .collection("minutes")
      .doc("record");

    const existingMinutes = await minutesRef.get();

    const minutesPayload: Record<string, any> = {
      businessMeetingId: data.businessMeetingId,
      groupId: data.groupId,
      groupName,
      date: meetingData.date,
      chair: data.minutes.chair || "",
      secretary: data.minutes.secretary || "",
      attendanceCount: data.minutes.attendanceCount || 0,
      memberQuorum: data.minutes.memberQuorum || false,
      openingPrayer: data.minutes.openingPrayer || false,
      closingPrayer: data.minutes.closingPrayer || false,
      agendaItems: data.minutes.agendaItems || [],
      decisions: data.minutes.decisions || [],
      status: "draft",
      updatedAt: now,
    };

    if (data.minutes.openedAt) minutesPayload.openedAt = data.minutes.openedAt;
    if (data.minutes.closedAt) minutesPayload.closedAt = data.minutes.closedAt;
    if (data.minutes.guestsPresent)
      minutesPayload.guestsPresent = data.minutes.guestsPresent;
    if (data.minutes.treasuryReport)
      minutesPayload.treasuryReport = data.minutes.treasuryReport;
    if (data.minutes.nextMeetingDate)
      minutesPayload.nextMeetingDate = data.minutes.nextMeetingDate;
    if (data.minutes.nextMeetingLocation)
      minutesPayload.nextMeetingLocation = data.minutes.nextMeetingLocation;
    if (data.minutes.announcements)
      minutesPayload.announcements = data.minutes.announcements;

    if (existingMinutes.exists) {
      await minutesRef.update(minutesPayload);
    } else {
      minutesPayload.createdBy = callerId;
      minutesPayload.createdAt = now;
      await minutesRef.set(minutesPayload);
    }

    logger.info(
      `Meeting minutes saved: meetingId=${data.businessMeetingId} groupId=${data.groupId} by=${callerId}`,
    );

    return { success: true };
  },
);
