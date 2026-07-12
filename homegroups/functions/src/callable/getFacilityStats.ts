import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface GetFacilityStatsData {
  intergroupId: string;
  forceRefresh?: boolean;
}

interface GetFacilityStatsResult {
  stats: any;
  dataAsOf: string;
  isStale: boolean;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export const getFacilityStats = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<GetFacilityStatsData>,
  ): Promise<GetFacilityStatsResult> => {
    const uid = requireAuth(request);

    const { intergroupId, forceRefresh = false } = request.data;
    if (!intergroupId)
      throw new HttpsError("invalid-argument", "intergroupId is required");

    // Load intergroup
    const intergroupSnap = await db
      .collection("intergroups")
      .doc(intergroupId)
      .get();
    if (!intergroupSnap.exists)
      throw new HttpsError("not-found", "Intergroup not found");
    const intergroupData = intergroupSnap.data()!;

    // Must be admin AND treatment_center type
    if (!intergroupData.adminUids?.includes(uid)) {
      throw new HttpsError("permission-denied", "Must be an intergroup admin");
    }
    if (intergroupData.type !== "treatment_center") {
      throw new HttpsError(
        "failed-precondition",
        "Facility stats only available for treatment centers",
      );
    }

    const statsRef = db
      .collection("intergroups")
      .doc(intergroupId)
      .collection("facilityStats")
      .doc("current");

    const statsSnap = await statsRef.get();

    // Check if we need to recompute
    let stats = statsSnap.data();
    const lastUpdated: admin.firestore.Timestamp | undefined =
      stats?.lastUpdated;
    const now = Date.now();
    const isStale =
      !lastUpdated || now - lastUpdated.toMillis() > STALE_THRESHOLD_MS;

    if (forceRefresh) {
      if (lastUpdated && now - lastUpdated.toMillis() < STALE_THRESHOLD_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Facility stats can only be force-refreshed once per 24 hours",
        );
      }
      // Recompute from source data
      stats = await recomputeFacilityStats(
        intergroupId,
        intergroupData.affiliatedGroupIds || [],
      );
      await statsRef.set(stats);
    } else if (!stats) {
      // First time: compute and store
      stats = await recomputeFacilityStats(
        intergroupId,
        intergroupData.affiliatedGroupIds || [],
      );
      await statsRef.set(stats);
    }

    const dataAsOf =
      stats?.lastUpdated?.toDate?.()?.toISOString?.() ??
      new Date().toISOString();

    return { stats, dataAsOf, isStale };
  },
);

async function recomputeFacilityStats(
  intergroupId: string,
  affiliatedGroupIds: string[],
): Promise<any> {
  const sobrietyBuckets = {
    under30Days: 0,
    thirtyToNinetyDays: 0,
    ninetyDaysToOneYear: 0,
    oneToTwoYears: 0,
    twoToFiveYears: 0,
    fiveYearsPlus: 0,
  };

  let totalActiveMemberCount = 0;
  let totalMilestonesAwarded = 0;
  let milestonesThisMonth = 0;
  let milestonesThisYear = 0;
  let totalMeetingsThisMonth = 0;
  let totalAttendanceThisMonth = 0;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  for (const groupId of affiliatedGroupIds) {
    // Count members
    const membersSnap = await db
      .collection("members")
      .where("groupId", "==", groupId)
      .get();
    totalActiveMemberCount += membersSnap.size;

    // Count milestones
    const milestonesSnap = await db
      .collection("groups")
      .doc(groupId)
      .collection("milestones")
      .get();

    for (const milestoneDoc of milestonesSnap.docs) {
      const milestoneData = milestoneDoc.data();
      const records = milestoneData.milestones || [];
      totalMilestonesAwarded += records.length;

      for (const record of records) {
        const chipDate: admin.firestore.Timestamp = record.chipGivenAt;
        if (chipDate && chipDate.toDate() >= startOfMonth)
          milestonesThisMonth++;
        if (chipDate && chipDate.toDate() >= startOfYear) milestonesThisYear++;

        // Sobriety bucket from milestone days
        const days: number = record.days || 0;
        if (days < 30) sobrietyBuckets.under30Days++;
        else if (days < 90) sobrietyBuckets.thirtyToNinetyDays++;
        else if (days < 365) sobrietyBuckets.ninetyDaysToOneYear++;
        else if (days < 730) sobrietyBuckets.oneToTwoYears++;
        else if (days < 1825) sobrietyBuckets.twoToFiveYears++;
        else sobrietyBuckets.fiveYearsPlus++;
      }
    }

    // Count meeting instances this month
    const instancesSnap = await db
      .collection("meetingInstances")
      .where("groupId", "==", groupId)
      .where(
        "scheduledAt",
        ">=",
        admin.firestore.Timestamp.fromDate(startOfMonth),
      )
      .get();

    totalMeetingsThisMonth += instancesSnap.size;
    instancesSnap.docs.forEach((doc) => {
      totalAttendanceThisMonth += doc.data().attendeeCount || 0;
    });
  }

  const averageAttendancePerMeeting =
    totalMeetingsThisMonth > 0
      ? Math.round((totalAttendanceThisMonth / totalMeetingsThisMonth) * 10) /
        10
      : 0;

  return {
    totalActiveMemberCount,
    totalMilestonesAwarded,
    milestonesThisMonth,
    milestonesThisYear,
    sobrietyBuckets,
    totalMeetingsThisMonth,
    totalAttendanceThisMonth,
    averageAttendancePerMeeting,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    generatedBy: "getFacilityStats",
  };
}
