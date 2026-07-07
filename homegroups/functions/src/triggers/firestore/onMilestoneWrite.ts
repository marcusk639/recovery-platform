import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "../../utils/firebase";
import * as admin from "firebase-admin";

/**
 * onMilestoneWrite — Firestore trigger
 *
 * When a milestone document is written, checks if the group is affiliated with
 * a treatment center intergroup and updates the facility stats counters.
 * Only updates numeric counters — no PII is stored.
 *
 * Idempotency (D-6): v2 Firestore triggers retry on uncaught exceptions and
 * on partial-completion failures (timeout, OOM, network blip between the
 * increment landing and the function returning normally). Each retry uses
 * the SAME `event.id`. Without an idempotency guard, retries would silently
 * double-count `totalMilestonesAwarded`, `milestonesThisMonth`, and
 * `milestonesThisYear` — directly inflating the treatment-center facility
 * dashboard metrics that are sold to facilities at $99–$999/mo.
 *
 * The fix: claim an atomic lock keyed by `event.id` in a new
 * `processed_milestone_events` collection. Same pattern as
 * `onTransactionWrite` and `stripeWebhook`.
 */
export const onMilestoneWrite = onDocumentWritten(
  "groups/{groupId}/milestones/{memberId}",
  async (event) => {
    const groupId = event.params.groupId;
    const memberId = event.params.memberId;
    const eventId = event.id;

    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    const beforeCount = (beforeData?.milestones || []).length;
    const afterCount = (afterData?.milestones || []).length;
    const delta = afterCount - beforeCount;

    if (delta === 0) return;

    const lockRef = db.collection("processed_milestone_events").doc(eventId);

    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        logger.info(
          `onMilestoneWrite: event ${eventId} already processed; skipping.`,
        );
        return;
      }

      // Get the group to check for orgId
      const groupSnap = await tx.get(db.collection("groups").doc(groupId));
      if (!groupSnap.exists) return;
      const groupData = groupSnap.data()!;

      const orgId: string | undefined = groupData.orgId;
      if (!orgId) return; // Not affiliated with any intergroup

      // Check that the intergroup is a treatment center
      const intergroupSnap = await tx.get(
        db.collection("intergroups").doc(orgId),
      );
      if (!intergroupSnap.exists) return;
      if (intergroupSnap.data()?.type !== "treatment_center") return;

      const statsRef = db
        .collection("intergroups")
        .doc(orgId)
        .collection("facilityStats")
        .doc("current");

      const updates: Record<string, any> = {
        totalMilestonesAwarded: admin.firestore.FieldValue.increment(delta),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        generatedBy: "onMilestoneWrite",
      };

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      if (delta > 0 && afterData?.milestones) {
        const newMilestones = afterData.milestones.slice(beforeCount);
        const thisMonthNew = newMilestones.filter((m: any) => {
          const chipDate = m.chipGivenAt?.toDate?.() ?? new Date(0);
          return chipDate >= startOfMonth;
        }).length;
        if (thisMonthNew > 0) {
          updates.milestonesThisMonth =
            admin.firestore.FieldValue.increment(thisMonthNew);
        }

        const thisYearNew = newMilestones.filter((m: any) => {
          const chipDate = m.chipGivenAt?.toDate?.() ?? new Date(0);
          return chipDate >= startOfYear;
        }).length;
        if (thisYearNew > 0) {
          updates.milestonesThisYear =
            admin.firestore.FieldValue.increment(thisYearNew);
        }
      }

      tx.set(lockRef, {
        groupId,
        memberId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processed",
      });
      tx.set(statsRef, updates, { merge: true });

      logger.info(
        `Facility stats updated for intergroup ${orgId}: delta=${delta}`,
      );
    });
  },
);
