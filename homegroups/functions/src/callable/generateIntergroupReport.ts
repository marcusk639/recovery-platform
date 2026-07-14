import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";
import { requireAuth } from "../utils/callableWrapper";

interface GenerateReportData {
  groupId: string;
  reportMonth: string; // "2026-01"
}

interface GenerateReportResult {
  reportId: string;
  reportData: any;
}

/**
 * generateIntergroupReport — Callable Cloud Function
 *
 * Generates a pre-populated monthly intergroup/district report.
 * Auth: must be admin of groupId.
 * 1. Loads group data
 * 2. Loads service positions for officers snapshot
 * 3. Loads milestones — filter to anniversaries in reportMonth
 * 4. Loads treasury transactions — sum 7th tradition
 * 5. Loads meeting instances — count + average attendance
 * 6. Creates/overwrites intergroup_reports/{groupId}_{reportMonth} with status: 'draft'
 * Returns the populated document.
 */
export const generateIntergroupReport = onCall(
  async (
    request: CallableRequest<GenerateReportData>,
  ): Promise<GenerateReportResult> => {
    const { data } = request;
    const callerId = requireAuth(request);

    if (!data.groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!data.reportMonth || !/^\d{4}-\d{2}$/.test(data.reportMonth)) {
      throw new HttpsError(
        "invalid-argument",
        "reportMonth must be in YYYY-MM format.",
      );
    }

    // Load group and verify admin access
    const groupDoc = await db.collection("groups").doc(data.groupId).get();
    if (!groupDoc.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    const groupData = groupDoc.data()!;

    if (!groupData.admins?.includes(callerId)) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can generate intergroup reports.",
      );
    }

    assertGroupActive(groupData);

    const groupName: string = groupData.name || "Group";

    // Parse report month
    const [yearStr, monthStr] = data.reportMonth.split("-");
    const reportYear = parseInt(yearStr, 10);
    const reportMonthNumber = parseInt(monthStr, 10);

    // Calculate date range for the report month
    const monthStart = new Date(reportYear, reportMonthNumber - 1, 1);
    const monthEnd = new Date(reportYear, reportMonthNumber, 1); // exclusive

    const monthStartTs = admin.firestore.Timestamp.fromDate(monthStart);
    const monthEndTs = admin.firestore.Timestamp.fromDate(monthEnd);

    // 1. Load service positions (officers)
    const positionsSnapshot = await db
      .collection("groups")
      .doc(data.groupId)
      .collection("servicePositions")
      .get();

    const officers: { positionName: string; holderName: string }[] = [];
    positionsSnapshot.docs.forEach((doc) => {
      const pos = doc.data();
      if (pos.currentHolderId && pos.currentHolderName) {
        officers.push({
          positionName: pos.name || "Position",
          holderName: pos.currentHolderName,
        });
      }
    });

    // 2. Load milestones for sobriety birthdays in this month
    const sobrietyBirthdays: { memberName: string; years: number }[] = [];
    try {
      const milestonesSnapshot = await db
        .collection("groups")
        .doc(data.groupId)
        .collection("milestones")
        .get();

      milestonesSnapshot.docs.forEach((doc) => {
        const milestone = doc.data();
        if (!milestone.sobrietyDate) return;

        const sobrietyDate =
          typeof milestone.sobrietyDate.toDate === "function"
            ? milestone.sobrietyDate.toDate()
            : new Date(milestone.sobrietyDate);

        // Check if anniversary falls in report month
        const anniversaryThisYear = new Date(
          reportYear,
          sobrietyDate.getMonth(),
          sobrietyDate.getDate(),
        );

        if (
          anniversaryThisYear >= monthStart &&
          anniversaryThisYear < monthEnd
        ) {
          const years = reportYear - sobrietyDate.getFullYear();
          if (years > 0) {
            sobrietyBirthdays.push({
              memberName: milestone.displayName || "Member",
              years,
            });
          }
        }
      });
    } catch (err) {
      logger.warn("Error loading milestones for intergroup report:", err);
    }

    // 3. Load treasury transactions — sum 7th tradition income
    let totalSeventhTraditionCollected = 0;
    try {
      const transactionsSnapshot = await db
        .collection("transactions")
        .where("groupId", "==", data.groupId)
        .where("type", "==", "income")
        .where("createdAt", ">=", monthStartTs)
        .where("createdAt", "<", monthEndTs)
        .get();

      transactionsSnapshot.docs.forEach((doc) => {
        const tx = doc.data();
        const category: string = (tx.category || "").toLowerCase();
        const description: string = (tx.description || "").toLowerCase();
        if (
          category.includes("seventh") ||
          category.includes("7th") ||
          category.includes("tradition") ||
          description.includes("7th") ||
          description.includes("seventh tradition")
        ) {
          totalSeventhTraditionCollected += tx.amount || 0;
        }
      });
    } catch (err) {
      logger.warn("Error loading transactions for intergroup report:", err);
    }

    // 4. Load meeting instances for this month
    let averageAttendance = 0;
    let numberOfMeetingsHeld = 0;
    try {
      const instancesSnapshot = await db
        .collection("meetingInstances")
        .where("groupId", "==", data.groupId)
        .where("scheduledAt", ">=", monthStartTs)
        .where("scheduledAt", "<", monthEndTs)
        .get();

      const nonCancelled = instancesSnapshot.docs.filter(
        (doc) => !doc.data().isCancelled,
      );
      numberOfMeetingsHeld = nonCancelled.length;

      if (numberOfMeetingsHeld > 0) {
        const totalAttendance = nonCancelled.reduce((sum, doc) => {
          return sum + (doc.data().attendeeCount || 0);
        }, 0);
        averageAttendance = Math.round(totalAttendance / numberOfMeetingsHeld);
      }
    } catch (err) {
      logger.warn(
        "Error loading meeting instances for intergroup report:",
        err,
      );
    }

    // Determine meeting info from group data
    const meetings = groupData.meetings || [];
    let meetingDay = "";
    let meetingTime = "";
    let meetingLocation = groupData.location || groupData.address || "";
    let isOnlineMeeting = false;

    if (meetings.length > 0) {
      const firstMeeting = meetings[0];
      meetingDay = firstMeeting.day || "";
      meetingTime = firstMeeting.time || "";
      isOnlineMeeting = firstMeeting.isOnline || false;
      if (!meetingLocation && firstMeeting.location) {
        meetingLocation = firstMeeting.location;
      }
    }

    const reportId = `${data.groupId}_${data.reportMonth}`;
    const now = admin.firestore.FieldValue.serverTimestamp();

    const reportData = {
      id: reportId,
      groupId: data.groupId,
      groupName,
      reportMonth: data.reportMonth,
      reportYear,
      reportMonthNumber,
      groupType: groupData.type || "AA",
      meetingDay,
      meetingTime,
      meetingLocation,
      isOnlineMeeting,
      gsrName: "",
      gsrPhoneNumber: "",
      averageAttendance,
      numberOfMeetingsHeld,
      totalSeventhTraditionCollected,
      sobrietyBirthdays,
      officers,
      groupNotes: "",
      status: "draft",
      createdBy: callerId,
      createdAt: now,
      updatedAt: now,
    };

    // Create or overwrite the report document
    await db
      .collection("intergroup_reports")
      .doc(reportId)
      .set(reportData, { merge: false });

    logger.info(
      `Intergroup report generated: reportId=${reportId} groupId=${data.groupId} by=${callerId}`,
    );

    return { reportId, reportData };
  },
);
