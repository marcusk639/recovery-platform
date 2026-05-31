import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface GetGroupDashboardMetricsData {
  groupId: string;
  period: "week" | "month" | "all_time";
}

export const getGroupDashboardMetrics = onCall(
  async (request: CallableRequest<GetGroupDashboardMetricsData>) => {
    const { groupId, period } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
    }
    if (!period || !["week", "month", "all_time"].includes(period)) {
      throw new HttpsError(
        "invalid-argument",
        "Period must be 'week', 'month', or 'all_time'.",
      );
    }

    // Verify user is a group admin
    const groupRef = db.collection("groups").doc(groupId);
    const groupSnap = await groupRef.get();

    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const groupData = groupSnap.data()!;
    const admins: string[] = groupData.admins || [];

    if (!admins.includes(userId)) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can view dashboard metrics.",
      );
    }
    assertGroupActive(groupData);

    // Determine period boundaries
    const now = new Date();
    let periodStart: Date;
    const periodEnd = now;

    if (period === "week") {
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 7);
    } else if (period === "month") {
      periodStart = new Date(now);
      periodStart.setMonth(periodStart.getMonth() - 1);
    } else {
      // all_time — use group creation date or a far past date
      periodStart = groupData.createdAt
        ? groupData.createdAt.toDate()
        : new Date(0);
    }

    try {
      // ---- Messages ----
      let messageCount = 0;
      try {
        const messagesQuery = db
          .collection("group_chats")
          .doc(groupId)
          .collection("messages")
          .where("createdAt", ">=", periodStart)
          .where("createdAt", "<=", periodEnd);
        const messagesSnap = await messagesQuery.get();
        messageCount = messagesSnap.size;
      } catch {
        // messages collection may not exist yet
      }

      // ---- Announcements ----
      let announcementCount = 0;
      try {
        const announcementsQuery = db
          .collection("announcements")
          .where("groupId", "==", groupId)
          .where("createdAt", ">=", periodStart)
          .where("createdAt", "<=", periodEnd);
        const announcementsSnap = await announcementsQuery.get();
        announcementCount = announcementsSnap.size;
      } catch {
        // announcements collection may not exist yet
      }

      // ---- Members ----
      const membersSnap = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .get();
      const totalMembers = membersSnap.size;

      let newMembers = 0;
      let membersLeft = 0;
      let activeMembers = 0;

      membersSnap.forEach((doc) => {
        const data = doc.data();
        if (data.joinedAt) {
          const joinedAt = data.joinedAt.toDate
            ? data.joinedAt.toDate()
            : new Date(data.joinedAt);
          if (joinedAt >= periodStart && joinedAt <= periodEnd) {
            newMembers++;
          }
        }
        if (data.leftAt) {
          const leftAt = data.leftAt.toDate
            ? data.leftAt.toDate()
            : new Date(data.leftAt);
          if (leftAt >= periodStart && leftAt <= periodEnd) {
            membersLeft++;
          }
        }
        // Consider a member active if they joined before period end and haven't left
        if (!data.leftAt) {
          activeMembers++;
        }
      });

      // ---- Treasury ----
      let treasuryBalance = 0;
      let periodIncome = 0;
      let periodExpenses = 0;
      let transactionCount = 0;

      try {
        const treasuryRef = db
          .collection("groups")
          .doc(groupId)
          .collection("treasury");
        const treasurySnap = await treasuryRef.limit(1).get();
        if (!treasurySnap.empty) {
          const treasuryData = treasurySnap.docs[0].data();
          treasuryBalance = treasuryData.balance || 0;
        }

        const transactionsQuery = db
          .collection("groups")
          .doc(groupId)
          .collection("transactions")
          .where("date", ">=", periodStart)
          .where("date", "<=", periodEnd);
        const transactionsSnap = await transactionsQuery.get();
        transactionCount = transactionsSnap.size;

        transactionsSnap.forEach((doc) => {
          const data = doc.data();
          const amount = data.amount || 0;
          if (data.type === "income") {
            periodIncome += amount;
          } else if (data.type === "expense") {
            periodExpenses += amount;
          }
        });
      } catch {
        // treasury/transactions may not exist yet
      }

      // ---- Meeting Instances ----
      let meetingsHeld = 0;
      let meetingsCancelled = 0;
      let totalAttendance = 0;

      try {
        const instancesQuery = db
          .collectionGroup("instances")
          .where("groupId", "==", groupId)
          .where("scheduledAt", ">=", periodStart)
          .where("scheduledAt", "<=", periodEnd);
        const instancesSnap = await instancesQuery.get();

        instancesSnap.forEach((doc) => {
          const data = doc.data();
          if (data.isCancelled) {
            meetingsCancelled++;
          } else {
            meetingsHeld++;
            if (typeof data.attendance === "number") {
              totalAttendance += data.attendance;
            }
          }
        });
      } catch {
        // instances may not exist yet
      }

      const memberEngagementRate =
        totalMembers > 0
          ? Math.round((activeMembers / totalMembers) * 100) / 100
          : undefined;

      const averageAttendance =
        meetingsHeld > 0
          ? Math.round((totalAttendance / meetingsHeld) * 10) / 10
          : undefined;

      return {
        groupId,
        period,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        messageCount,
        announcementCount,
        activeMembers,
        totalMembers,
        treasuryBalance,
        periodIncome,
        periodExpenses,
        transactionCount,
        meetingsHeld,
        meetingsCancelled,
        totalAttendance,
        newMembers,
        membersLeft,
        memberEngagementRate,
        averageAttendance,
        computedAt: now.toISOString(),
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        `Error computing dashboard metrics for group ${groupId}:`,
        error,
      );

      throw new HttpsError("internal", "Failed to compute dashboard metrics.");
    }
  },
);
