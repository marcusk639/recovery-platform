import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";

interface GetMilestonesData {
  groupId: string;
}

export interface MilestoneRecordResult {
  days: number;
  chipGivenAt: string; // ISO string
  chipGivenBy: string;
  notes?: string;
}

export interface MilestoneDocumentResult {
  memberId: string;
  userId: string;
  displayName: string;
  sobrietyDate: string; // ISO string
  milestones: MilestoneRecordResult[];
  nextMilestoneDate?: string;
  nextMilestoneDays?: number;
}

export interface RecentMilestoneResult extends MilestoneRecordResult {
  memberId: string;
  displayName: string;
}

interface GetMilestonesResult {
  all: MilestoneDocumentResult[];
  upcoming: MilestoneDocumentResult[];
  recent: RecentMilestoneResult[];
}

/**
 * Internal handler — exported for testing.
 * getMilestones callable: returns milestone data for all members of a group.
 *
 * Auth: caller must be a member of the group.
 * Returns:
 *   - all: all milestone docs
 *   - upcoming: members whose nextMilestoneDate is within 30 days, sorted by date
 *   - recent: last 10 chip records across all members
 */
export async function getMilestonesHandler(
  request: CallableRequest<GetMilestonesData>,
): Promise<GetMilestonesResult> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const callerId = request.auth.uid;
  const { data } = request;

  if (!data.groupId) {
    throw new HttpsError("invalid-argument", "groupId is required.");
  }

  const { groupId } = data;

  // --- Verify caller is a member ---
  const callerMemberDocId = `${groupId}_${callerId}`;
  const callerMemberDoc = await db
    .collection("members")
    .doc(callerMemberDocId)
    .get();

  if (!callerMemberDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "You must be a member of this group to view milestones.",
    );
  }

  // --- Fetch all milestone docs ---
  const milestonesSnap = await db
    .collection("groups")
    .doc(groupId)
    .collection("milestones")
    .get();

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const all: MilestoneDocumentResult[] = [];
  const upcoming: MilestoneDocumentResult[] = [];
  const recentRecords: (RecentMilestoneResult & { _chipMs: number })[] = [];

  milestonesSnap.docs.forEach((doc) => {
    const d = doc.data();
    const memberId = doc.id;

    const milestoneRecords: MilestoneRecordResult[] = (d.milestones || []).map(
      (r: any) => ({
        days: r.days,
        chipGivenAt:
          typeof r.chipGivenAt?.toDate === "function"
            ? r.chipGivenAt.toDate().toISOString()
            : new Date(r.chipGivenAt).toISOString(),
        chipGivenBy: r.chipGivenBy,
        ...(r.notes ? { notes: r.notes } : {}),
      }),
    );

    const entry: MilestoneDocumentResult = {
      memberId,
      userId: d.userId,
      displayName: d.displayName,
      sobrietyDate:
        typeof d.sobrietyDate?.toDate === "function"
          ? d.sobrietyDate.toDate().toISOString()
          : new Date(d.sobrietyDate).toISOString(),
      milestones: milestoneRecords,
    };

    if (d.nextMilestoneDate) {
      const nextDate: Date =
        typeof d.nextMilestoneDate?.toDate === "function"
          ? d.nextMilestoneDate.toDate()
          : new Date(d.nextMilestoneDate);
      entry.nextMilestoneDate = nextDate.toISOString();
      entry.nextMilestoneDays = d.nextMilestoneDays;

      // Include in upcoming if within 30 days and in the future
      if (nextDate >= now && nextDate <= thirtyDaysFromNow) {
        upcoming.push(entry);
      }
    }

    all.push(entry);

    // Collect all records for "recent" calculation
    milestoneRecords.forEach((r: MilestoneRecordResult) => {
      recentRecords.push({
        ...r,
        memberId,
        displayName: d.displayName as string,
        _chipMs: new Date(r.chipGivenAt).getTime(),
      });
    });
  });

  // Sort upcoming by nextMilestoneDate ascending
  upcoming.sort((a, b) => {
    const aDate = a.nextMilestoneDate
      ? new Date(a.nextMilestoneDate).getTime()
      : 0;
    const bDate = b.nextMilestoneDate
      ? new Date(b.nextMilestoneDate).getTime()
      : 0;
    return aDate - bDate;
  });

  // Sort all records by chipGivenAt descending, take last 10
  recentRecords.sort((a, b) => b._chipMs - a._chipMs);
  const recent: RecentMilestoneResult[] = recentRecords
    .slice(0, 10)
    .map(({ _chipMs: _ignored, ...rest }) => rest);

  logger.info(
    `getMilestones: groupId=${groupId}, all=${all.length}, upcoming=${upcoming.length}, recent=${recent.length}`,
  );

  return { all, upcoming, recent };
}

export const getMilestones = onCall(getMilestonesHandler);
