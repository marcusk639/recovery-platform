import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface GetMemberEngagementMetricsData {
  groupId: string;
}

interface EngagementWindow {
  windowDays: 30 | 60 | 90;
  activeCount: number;
  totalMembers: number;
  percentage: number;
}

interface GetMemberEngagementMetricsResult {
  groupId: string;
  totalMembers: number;
  windows: EngagementWindow[];
  dataAvailabilityNote?: string;
  computedAt: string;
}

const MAX_MEMBERS = 500;

export const getMemberEngagementMetrics = onCall(
  async (request: CallableRequest<GetMemberEngagementMetricsData>) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { groupId } = request.data;
    if (!groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
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
        "Only group admins can view engagement metrics.",
      );
    }
    assertGroupActive(groupData);

    try {
      // Get all member userIds
      let memberDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      let isApproximate = false;

      try {
        const gmSnap = await db
          .collection("members")
          .where("groupId", "==", groupId)
          .get();
        memberDocs = gmSnap.docs;
      } catch {
        try {
          const gmSnap = await db
            .collection("groups")
            .doc(groupId)
            .collection("members")
            .get();
          memberDocs = gmSnap.docs;
        } catch {
          memberDocs = [];
        }
      }

      const totalMembers = memberDocs.length;
      let cappedDocs = memberDocs;
      if (memberDocs.length > MAX_MEMBERS) {
        // Random sample of MAX_MEMBERS
        cappedDocs = memberDocs
          .sort(() => Math.random() - 0.5)
          .slice(0, MAX_MEMBERS);
        isApproximate = true;
      }

      // Load user docs in batches of 10
      const BATCH_SIZE = 10;
      const userActivityDates: (Date | null)[] = [];
      let missingDataCount = 0;

      for (let i = 0; i < cappedDocs.length; i += BATCH_SIZE) {
        const batch = cappedDocs.slice(i, i + BATCH_SIZE);
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
            userActivityDates.push(null);
            missingDataCount++;
            return;
          }
          const userData = userSnap.data()!;
          const lastActivity = userData.lastActivityAt;
          if (lastActivity) {
            const lastDate = lastActivity.toDate
              ? lastActivity.toDate()
              : new Date(lastActivity);
            userActivityDates.push(lastDate);
          } else {
            userActivityDates.push(null);
            missingDataCount++;
          }
        });
      }

      const now = new Date();
      const windowDays: Array<30 | 60 | 90> = [30, 60, 90];
      const windows: EngagementWindow[] = windowDays.map((days) => {
        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() - days);
        const activeCount = userActivityDates.filter(
          (date) => date !== null && date >= windowStart,
        ).length;
        const percentage =
          totalMembers > 0 ? Math.round((activeCount / totalMembers) * 100) : 0;
        return {
          windowDays: days,
          activeCount,
          totalMembers,
          percentage,
        };
      });

      let dataAvailabilityNote: string | undefined;
      if (missingDataCount > 0 && isApproximate) {
        dataAvailabilityNote = `Showing data for a sample of ${MAX_MEMBERS} of ${totalMembers} members; activity data available for ${MAX_MEMBERS - missingDataCount} of the sampled members`;
      } else if (isApproximate) {
        dataAvailabilityNote = `Showing data for a sample of ${MAX_MEMBERS} members (group has ${totalMembers} members)`;
      } else if (missingDataCount > 0) {
        dataAvailabilityNote = `Activity data available for ${totalMembers - missingDataCount} of ${totalMembers} members`;
      }

      const result: GetMemberEngagementMetricsResult = {
        groupId,
        totalMembers,
        windows,
        dataAvailabilityNote,
        computedAt: new Date().toISOString(),
      };

      return result;
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error(
        `Error computing engagement metrics for group ${groupId}:`,
        error,
      );
      throw new HttpsError("internal", "Failed to compute engagement metrics.");
    }
  },
);
