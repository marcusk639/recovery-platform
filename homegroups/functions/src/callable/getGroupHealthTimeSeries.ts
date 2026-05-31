import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface GetGroupHealthTimeSeriesData {
  groupId: string;
  months: 3 | 6 | 12;
}

interface MonthlyDataPoint {
  month: string; // "YYYY-MM"
  value: number;
}

interface GetGroupHealthTimeSeriesResult {
  groupId: string;
  months: number;
  retention: {
    activeCount: number;
    inactiveCount: number;
    totalMembers: number;
  };
  attendanceTrend: MonthlyDataPoint[];
  treasuryTrend: { month: string; income: number; expenses: number }[];
  engagementTrend: MonthlyDataPoint[];
  computedAt: string;
}

function generateMonthBuckets(
  monthsBack: number,
): Array<{ start: Date; end: Date; label: string }> {
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({ start, end, label });
  }
  return buckets;
}

export const getGroupHealthTimeSeries = onCall(
  async (request: CallableRequest<GetGroupHealthTimeSeriesData>) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { groupId, months } = request.data;
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
        "Only group admins can view health metrics.",
      );
    }
    assertGroupActive(groupData);

    const buckets = generateMonthBuckets(months);
    const rangeStart = buckets[0].start;

    try {
      // ---- Attendance Trend ----
      const attendanceTrend: MonthlyDataPoint[] = [];
      for (const bucket of buckets) {
        try {
          const instancesSnap = await db
            .collection("meetingInstances")
            .where("groupId", "==", groupId)
            .where("scheduledAt", ">=", bucket.start)
            .where("scheduledAt", "<", bucket.end)
            .where("isCancelled", "==", false)
            .get();

          let totalAttendees = 0;
          let instanceCount = 0;
          instancesSnap.forEach((doc) => {
            const data = doc.data();
            const count =
              typeof data.attendeeCount === "number" ? data.attendeeCount : 0;
            totalAttendees += count;
            instanceCount++;
          });
          const avg =
            instanceCount > 0 ? Math.round(totalAttendees / instanceCount) : 0;
          attendanceTrend.push({ month: bucket.label, value: avg });
        } catch {
          attendanceTrend.push({ month: bucket.label, value: 0 });
        }
      }

      // ---- Treasury Trend ----
      const treasuryTrend: {
        month: string;
        income: number;
        expenses: number;
      }[] = [];
      for (const bucket of buckets) {
        try {
          const txSnap = await db
            .collection("transactions")
            .where("groupId", "==", groupId)
            .where("createdAt", ">=", bucket.start)
            .where("createdAt", "<", bucket.end)
            .get();

          let income = 0;
          let expenses = 0;
          txSnap.forEach((doc) => {
            const data = doc.data();
            const amount = data.amount || 0;
            if (data.type === "income") {
              income += amount;
            } else if (data.type === "expense") {
              expenses += amount;
            }
          });
          treasuryTrend.push({ month: bucket.label, income, expenses });
        } catch {
          treasuryTrend.push({ month: bucket.label, income: 0, expenses: 0 });
        }
      }

      // ---- Engagement Trend ----
      // Get total member count for percentage calculation
      let totalMembers = 0;
      try {
        const membersSnap = await db
          .collection("members")
          .where("groupId", "==", groupId)
          .get();
        totalMembers = membersSnap.size;
      } catch {
        // members may be under groups/{groupId}/members
        try {
          const membersSnap = await db
            .collection("groups")
            .doc(groupId)
            .collection("members")
            .get();
          totalMembers = membersSnap.size;
        } catch {
          totalMembers = groupData.memberCount || 0;
        }
      }

      const engagementTrend: MonthlyDataPoint[] = [];
      for (const bucket of buckets) {
        try {
          const messagesSnap = await db
            .collection("group_chats")
            .doc(groupId)
            .collection("messages")
            .where("sentAt", ">=", bucket.start)
            .where("sentAt", "<", bucket.end)
            .get();

          const uniqueSenders = new Set<string>();
          messagesSnap.forEach((doc) => {
            const data = doc.data();
            if (data.senderId) {
              uniqueSenders.add(data.senderId);
            }
          });
          const percentage =
            totalMembers > 0
              ? Math.round((uniqueSenders.size / totalMembers) * 100)
              : 0;
          engagementTrend.push({ month: bucket.label, value: percentage });
        } catch {
          engagementTrend.push({ month: bucket.label, value: 0 });
        }
      }

      // ---- Retention ----
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      let activeCount = 0;
      let inactiveCount = 0;
      let retentionTotalMembers = totalMembers;

      try {
        // Try members top-level collection first
        let memberDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        try {
          const gmSnap = await db
            .collection("members")
            .where("groupId", "==", groupId)
            .get();
          memberDocs = gmSnap.docs;
          retentionTotalMembers = memberDocs.length;
        } catch {
          try {
            const gmSnap = await db
              .collection("groups")
              .doc(groupId)
              .collection("members")
              .get();
            memberDocs = gmSnap.docs;
            retentionTotalMembers = memberDocs.length;
          } catch {
            // Use already-computed totalMembers
          }
        }

        // Load user docs in batches of 10
        const MAX_MEMBERS = 200;
        const cappedDocs = memberDocs.slice(0, MAX_MEMBERS);
        const batchSize = 10;
        for (let i = 0; i < cappedDocs.length; i += batchSize) {
          const batch = cappedDocs.slice(i, i + batchSize);
          const userSnaps = await Promise.all(
            batch.map((memberDoc) => {
              const membData = memberDoc.data();
              const uid = membData.userId || memberDoc.id;
              return db
                .collection("users")
                .doc(uid)
                .get()
                .catch(() => null);
            }),
          );
          userSnaps.forEach((userSnap) => {
            if (!userSnap || !userSnap.exists) {
              inactiveCount++;
              return;
            }
            const userData = userSnap.data()!;
            const lastActivity = userData.lastActivityAt;
            if (lastActivity) {
              const lastDate = lastActivity.toDate
                ? lastActivity.toDate()
                : new Date(lastActivity);
              if (lastDate >= ninetyDaysAgo) {
                activeCount++;
              } else {
                inactiveCount++;
              }
            } else {
              inactiveCount++;
            }
          });
        }
      } catch {
        // Fallback to basic estimate
        activeCount = Math.round(retentionTotalMembers * 0.7);
        inactiveCount = retentionTotalMembers - activeCount;
      }

      const result: GetGroupHealthTimeSeriesResult = {
        groupId,
        months,
        retention: {
          activeCount,
          inactiveCount,
          totalMembers: retentionTotalMembers,
        },
        attendanceTrend,
        treasuryTrend,
        engagementTrend,
        computedAt: new Date().toISOString(),
      };

      return result;
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error(
        `Error computing health time series for group ${groupId}:`,
        error,
      );
      throw new HttpsError("internal", "Failed to compute health time series.");
    }
  },
);
