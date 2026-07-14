import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";
import { requireAuth } from "../utils/callableWrapper";

interface GetAttendanceAnalyticsData {
  groupId: string;
  meetingId?: string;
  months: 3 | 6 | 12;
}

interface MonthlyDataPoint {
  month: string;
  value: number;
}

interface MeetingAttendanceSummary {
  meetingId: string;
  meetingName: string;
  dayOfWeek: string;
  avgAttendance: number;
  maxAttendance: number;
  minAttendance: number;
  instanceCount: number;
  trend: MonthlyDataPoint[];
}

interface AttendanceByDayOfWeek {
  day: string;
  avgCount: number;
  instanceCount: number;
}

interface GetAttendanceAnalyticsResult {
  groupId: string;
  months: number;
  meetings: MeetingAttendanceSummary[];
  byDayOfWeek: AttendanceByDayOfWeek[];
  overallAvg: number;
  bestAttendedMeetingId?: string;
  computedAt: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export const getAttendanceAnalytics = onCall(
  async (request: CallableRequest<GetAttendanceAnalyticsData>) => {
    const userId = requireAuth(request);

    const { groupId, meetingId, months } = request.data;
    if (!groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!months || ![3, 6, 12].includes(months)) {
      throw new HttpsError("invalid-argument", "months must be 3, 6, or 12.");
    }

    // Verify admin
    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    const groupData = groupSnap.data()!;
    const admins: string[] = groupData.admins || [];
    if (!admins.includes(userId)) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can view attendance analytics.",
      );
    }
    assertGroupActive(groupData);

    // Compute range start
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - months);
    rangeStart.setDate(1);
    rangeStart.setHours(0, 0, 0, 0);

    try {
      // Query meetingInstances
      let query = db
        .collection("meetingInstances")
        .where("groupId", "==", groupId)
        .where("scheduledAt", ">=", rangeStart)
        .where("isCancelled", "==", false);

      const instancesSnap = await query.get();

      // Group by meetingId
      const meetingGroups: Record<string, any[]> = {};
      instancesSnap.forEach((doc) => {
        const data = doc.data();
        const mId = data.meetingId || "unknown";
        if (!meetingGroups[mId]) {
          meetingGroups[mId] = [];
        }
        meetingGroups[mId].push(data);
      });

      // If meetingId filter specified, narrow down
      const meetingIdsToProcess = meetingId
        ? [meetingId]
        : Object.keys(meetingGroups);

      const meetings: MeetingAttendanceSummary[] = [];
      const dayOfWeekTotals: Record<number, { total: number; count: number }> =
        {};

      for (const mId of meetingIdsToProcess) {
        const instances = meetingGroups[mId] || [];
        if (instances.length === 0) continue;

        const attendanceCounts = instances.map((inst) =>
          typeof inst.attendeeCount === "number" ? inst.attendeeCount : 0,
        );
        const avgAttendance =
          attendanceCounts.length > 0
            ? Math.round(
                attendanceCounts.reduce((a, b) => a + b, 0) /
                  attendanceCounts.length,
              )
            : 0;
        const maxAttendance = Math.max(...attendanceCounts, 0);
        const minAttendance =
          attendanceCounts.length > 0 ? Math.min(...attendanceCounts) : 0;

        // Build trend by month
        const monthTotals: Record<string, { total: number; count: number }> =
          {};

        instances.forEach((inst) => {
          const scheduledDate = inst.scheduledAt?.toDate
            ? inst.scheduledAt.toDate()
            : new Date(inst.scheduledAt);
          const monthLabel = getMonthLabel(scheduledDate);
          if (!monthTotals[monthLabel]) {
            monthTotals[monthLabel] = { total: 0, count: 0 };
          }
          const count =
            typeof inst.attendeeCount === "number" ? inst.attendeeCount : 0;
          monthTotals[monthLabel].total += count;
          monthTotals[monthLabel].count++;

          // Day of week tracking
          const dayOfWeekIndex = scheduledDate.getDay();
          if (!dayOfWeekTotals[dayOfWeekIndex]) {
            dayOfWeekTotals[dayOfWeekIndex] = { total: 0, count: 0 };
          }
          dayOfWeekTotals[dayOfWeekIndex].total += count;
          dayOfWeekTotals[dayOfWeekIndex].count++;
        });

        const trend: MonthlyDataPoint[] = Object.entries(monthTotals)
          .map(([month, { total, count }]) => ({
            month,
            value: count > 0 ? Math.round(total / count) : 0,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));

        // Get meeting name and day from first instance
        const firstInst = instances[0];
        const meetingName =
          firstInst.name || firstInst.meetingName || "Meeting";
        const scheduledDate = firstInst.scheduledAt?.toDate
          ? firstInst.scheduledAt.toDate()
          : new Date(firstInst.scheduledAt);
        const dayOfWeek = DAY_NAMES[scheduledDate.getDay()] || "Unknown";

        meetings.push({
          meetingId: mId,
          meetingName,
          dayOfWeek,
          avgAttendance,
          maxAttendance,
          minAttendance,
          instanceCount: instances.length,
          trend,
        });
      }

      // byDayOfWeek
      const byDayOfWeek: AttendanceByDayOfWeek[] = DAY_SHORT.map(
        (day, idx) => ({
          day,
          avgCount: dayOfWeekTotals[idx]
            ? Math.round(
                dayOfWeekTotals[idx].total / dayOfWeekTotals[idx].count,
              )
            : 0,
          instanceCount: dayOfWeekTotals[idx] ? dayOfWeekTotals[idx].count : 0,
        }),
      );

      // Overall avg
      const totalInstances = meetings.reduce(
        (sum, m) => sum + m.instanceCount,
        0,
      );
      const totalAttendance = meetings.reduce(
        (sum, m) => sum + m.avgAttendance * m.instanceCount,
        0,
      );
      const overallAvg =
        totalInstances > 0 ? Math.round(totalAttendance / totalInstances) : 0;

      // Best attended meeting
      const bestMeeting =
        meetings.length > 0
          ? meetings.reduce(
              (best, m) => (m.avgAttendance > best.avgAttendance ? m : best),
              meetings[0],
            )
          : undefined;

      const result: GetAttendanceAnalyticsResult = {
        groupId,
        months,
        meetings,
        byDayOfWeek,
        overallAvg,
        bestAttendedMeetingId: bestMeeting?.meetingId,
        computedAt: new Date().toISOString(),
      };

      return result;
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error(
        `Error computing attendance analytics for group ${groupId}:`,
        error,
      );
      throw new HttpsError(
        "internal",
        "Failed to compute attendance analytics.",
      );
    }
  },
);
