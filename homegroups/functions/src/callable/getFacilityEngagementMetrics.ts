import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface GetFacilityEngagementMetricsData {
  intergroupId: string;
}

export interface FacilityEngagementMetrics {
  intergroupId: string;
  affiliatedGroupCount: number;
  meetings: {
    last7Days: number;
    last30Days: number;
  };
  milestones: {
    thirtyDay: number;
    sixtyDay: number;
    ninetyDay: number;
    oneEightyDay: number;
    total: number;
  };
  sponsorships: {
    total: number;
  };
  computedAt: string;
}

const MILESTONE_TIERS = new Set<number>([30, 60, 90, 180]);
const FIRESTORE_IN_BATCH_SIZE = 30;

export async function getFacilityEngagementMetricsHandler(
  request: CallableRequest<GetFacilityEngagementMetricsData>,
): Promise<FacilityEngagementMetrics> {
  const uid = requireAuth(request);

  const { intergroupId } = request.data ?? {};
  if (!intergroupId || typeof intergroupId !== "string") {
    throw new HttpsError("invalid-argument", "intergroupId is required");
  }

  const intergroupSnap = await db
    .collection("intergroups")
    .doc(intergroupId)
    .get();
  if (!intergroupSnap.exists) {
    throw new HttpsError("not-found", "Facility not found");
  }

  const ig = intergroupSnap.data()!;
  if (!ig.adminUids?.includes(uid)) {
    throw new HttpsError("permission-denied", "Must be a facility admin");
  }
  if (ig.type !== "treatment_center") {
    throw new HttpsError(
      "invalid-argument",
      "This intergroup is not a treatment center",
    );
  }
  if (!["active", "trialing"].includes(ig.subscriptionStatus)) {
    throw new HttpsError(
      "failed-precondition",
      "Facility subscription is not active",
    );
  }

  const affiliatedGroupIds: string[] = ig.affiliatedGroupIds ?? [];

  if (affiliatedGroupIds.length === 0) {
    return {
      intergroupId,
      affiliatedGroupCount: 0,
      meetings: { last7Days: 0, last30Days: 0 },
      milestones: {
        thirtyDay: 0,
        sixtyDay: 0,
        ninetyDay: 0,
        oneEightyDay: 0,
        total: 0,
      },
      sponsorships: { total: 0 },
      computedAt: new Date().toISOString(),
    };
  }

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const halfYearStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  let meetingsLast7Days = 0;
  let meetingsLast30Days = 0;

  for (let i = 0; i < affiliatedGroupIds.length; i += FIRESTORE_IN_BATCH_SIZE) {
    const batch = affiliatedGroupIds.slice(i, i + FIRESTORE_IN_BATCH_SIZE);
    const weekTs = admin.firestore.Timestamp.fromDate(weekStart);
    const monthTs = admin.firestore.Timestamp.fromDate(monthStart);

    const [weekSnap, monthSnap] = await Promise.all([
      db
        .collection("meetingInstances")
        .where("groupId", "in", batch)
        .where("scheduledAt", ">=", weekTs)
        .get(),
      db
        .collection("meetingInstances")
        .where("groupId", "in", batch)
        .where("scheduledAt", ">=", monthTs)
        .get(),
    ]);

    weekSnap.docs.forEach((doc: any) => {
      if (!doc.data().isCancelled) meetingsLast7Days++;
    });
    monthSnap.docs.forEach((doc: any) => {
      if (!doc.data().isCancelled) meetingsLast30Days++;
    });
  }

  const milestoneCounts: Record<number, number> = {
    30: 0,
    60: 0,
    90: 0,
    180: 0,
  };

  await Promise.all(
    affiliatedGroupIds.map(async (groupId) => {
      const milestonesSnap = await db
        .collection("groups")
        .doc(groupId)
        .collection("milestones")
        .get();

      milestonesSnap.docs.forEach((doc: any) => {
        const records: any[] = doc.data().milestones ?? [];
        records.forEach((r) => {
          if (!MILESTONE_TIERS.has(r.days)) return;
          if (!r.chipGivenAt) return;
          const chipMs =
            typeof r.chipGivenAt?.toDate === "function"
              ? r.chipGivenAt.toDate().getTime()
              : new Date(r.chipGivenAt).getTime();
          if (Number.isNaN(chipMs)) return;
          if (chipMs >= halfYearStart.getTime()) {
            milestoneCounts[r.days] = (milestoneCounts[r.days] ?? 0) + 1;
          }
        });
      });
    }),
  );

  const milestoneTotal = Object.values(milestoneCounts).reduce(
    (a, b) => a + b,
    0,
  );

  const memberUidSet = new Set<string>();
  for (let i = 0; i < affiliatedGroupIds.length; i += FIRESTORE_IN_BATCH_SIZE) {
    const batch = affiliatedGroupIds.slice(i, i + FIRESTORE_IN_BATCH_SIZE);
    const membersSnap = await db
      .collection("members")
      .where("groupId", "in", batch)
      .get();
    membersSnap.docs.forEach((doc: any) => {
      const uid = doc.data().userId;
      if (uid) memberUidSet.add(uid);
    });
  }

  const memberUIDs = Array.from(memberUidSet);
  const sponsorshipIds = new Set<string>();

  for (let i = 0; i < memberUIDs.length; i += FIRESTORE_IN_BATCH_SIZE) {
    const batch = memberUIDs.slice(i, i + FIRESTORE_IN_BATCH_SIZE);
    const snap = await db
      .collection("sponsorships")
      .where("sponsorId", "in", batch)
      .get();
    snap.docs.forEach((doc: any) => sponsorshipIds.add(doc.id));
  }

  functions.logger.info(
    `getFacilityEngagementMetrics: intergroupId=${intergroupId}, groups=${affiliatedGroupIds.length}, ` +
      `meetingsLast7Days=${meetingsLast7Days}, meetingsLast30Days=${meetingsLast30Days}, ` +
      `milestones=${milestoneTotal}, sponsorships=${sponsorshipIds.size}`,
  );

  return {
    intergroupId,
    affiliatedGroupCount: affiliatedGroupIds.length,
    meetings: { last7Days: meetingsLast7Days, last30Days: meetingsLast30Days },
    milestones: {
      thirtyDay: milestoneCounts[30],
      sixtyDay: milestoneCounts[60],
      ninetyDay: milestoneCounts[90],
      oneEightyDay: milestoneCounts[180],
      total: milestoneTotal,
    },
    sponsorships: { total: sponsorshipIds.size },
    computedAt: new Date().toISOString(),
  };
}

export const getFacilityEngagementMetrics = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 60, cpu: 1 },
  getFacilityEngagementMetricsHandler,
);
