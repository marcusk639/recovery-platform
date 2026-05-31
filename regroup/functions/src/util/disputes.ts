import { Dispute } from "../entities/Dispute";
import _ from "lodash";
import { getTodaysDate, dateIsInWeek, dayDiff } from "./date";
import { Guest, Activity } from "../entities/Guest";
import Week from "../entities/Week";
import { Day } from "../entities/Day";
import {
  updateDispute,
  guestCollection,
  ratsFirestore,
} from "../api/firestore";
import { House } from "../entities/House";
import { logger } from "firebase-functions";

// ---------------------------------------------------------------------------
// Legacy guest shape — the normalized model stores week data in a separate
// collection, but older documents embed week objects directly on the guest.
// ---------------------------------------------------------------------------
interface LegacyGuestFields {
  currentWeek?: Week & { startDate: string; endDate: string };
  previousWeek?: Week;
  [key: string]: unknown;
}

type LegacyGuest = Guest & LegacyGuestFields;

// ---------------------------------------------------------------------------
// Day helpers — handle missing day objects in legacy embedded week data
// ---------------------------------------------------------------------------

/** Creates a default Day instance with all required fields initialized. */
const createDefaultDay = (date: string): Day => {
  return new Day(date);
};

/**
 * Safely retrieves a day from a week's days map.
 * Returns a default Day when the week or the specific date entry is absent,
 * preventing null-reference errors when accessing day fields on legacy data.
 */
const getSafeDay = (week: Week | undefined, date: string): Day => {
  if (!week || !week.days || !week.days[date]) {
    return createDefaultDay(date);
  }
  return week.days[date];
};

// ---------------------------------------------------------------------------
// Dispute state-transition logic
// ---------------------------------------------------------------------------

/**
 * Determines the outcome of a dispute.
 *
 * State-transition rules:
 * - "none":    dispute is fewer than 2 days old, or not active — no action taken yet.
 * - "success": dispute is at least 2 days old, active, and has fewer challenges than
 *              the activity's underDispute count — the disputed activity is reversed.
 * - "fail":    dispute is at least 2 days old, active, and has been sufficiently
 *              challenged — the disputed activity stands.
 *
 * Supports both old and new field names for forward/backward compatibility:
 *   - initiatedDate (old) / createdDate (new)
 *   - active (old boolean) / status === "pending" (new string)
 */
export const disputeResult = function (
  dispute: Dispute,
  activity: Activity
): "success" | "fail" | "none" {
  const disputeDate = dispute.initiatedDate || (dispute as any).createdDate;
  const dateDifference = dayDiff(disputeDate, getTodaysDate());
  logger.info("DATE DIFF", dateDifference, dispute);

  const isActive =
    dispute.active !== undefined
      ? dispute.active
      : (dispute as any).status === "pending";

  let result: "success" | "fail" | "none" = "none";
  if (dateDifference >= 2 && isActive) {
    if (
      dispute.challenges &&
      dispute.challenges.length &&
      dispute.challenges.length >= activity.underDispute
    ) {
      result = "fail";
    } else {
      result = "success";
    }
  }
  return result;
};

/**
 * Marks the dispute as resolved and returns a copy of the house disputes map
 * along with a deep clone of the resolved dispute for audit logging.
 */
const updateHouseDisputes = function (
  house: House,
  dispute: Dispute,
  resolution: "overturned" | "allowed"
) {
  logger.info("Updating house disputes", house, dispute, resolution);
  dispute.active = false;
  dispute.resolution = resolution;
  const disputes = { id: house.id, disputes: { ...house.disputes } };
  const resolvedDispute = _.cloneDeep(disputes.disputes[dispute.id]);
  return { disputes, resolvedDispute };
};

/**
 * Decrements the underDispute counter on the matching activity and records
 * the final dispute result. Returns a new activities array (immutable update).
 */
const updateActivity = function (
  week: Week,
  dispute: Dispute,
  result: "success" | "fail"
) {
  logger.info("Updating guest activity", dispute);
  const index = week.activities.findIndex(
    (activity) => activity.id === dispute.activityId
  );
  const activities = _.cloneDeep(week.activities);
  if (index > -1) {
    activities[index].underDispute = activities[index].underDispute - 1;
    activities[index].disputeResult = result;
  }
  return activities;
};

/**
 * Reverses a single stat on the guest's day entry for the dispute date.
 * Used when a dispute succeeds and the originally-recorded activity must be undone.
 *
 * @param guest - the guest whose record is being updated
 * @param week - "currentWeek" or "previousWeek" (legacy embedded field name)
 * @param stat - the day-level field to reset (e.g. "choreCompleted", "meeting")
 * @param value - the new value to write for that field
 * @param dispute - the dispute being resolved (provides the date)
 */
const reverseGuestStat = function (
  guest: Guest,
  week: string,
  stat: string,
  value: unknown,
  dispute: Dispute
): Guest {
  logger.info("Reversing guest stat", guest, stat, value);

  const legacyGuest = guest as LegacyGuest;
  const guestWeek = legacyGuest[week] as Week | undefined;
  if (!guestWeek) {
    logger.warn(`Week ${week} not found on guest ${guest.id}`);
    return guest;
  }

  const existingDay = getSafeDay(guestWeek, dispute.disputeDate);

  return {
    ...guest,
    [week]: {
      ...guestWeek,
      days: {
        ...(guestWeek.days || {}),
        [dispute.disputeDate]: {
          ...existingDay,
          [stat]: value,
        },
      },
    },
  };
};

/**
 * Resolves a dispute by:
 * 1. Loading the affected guest from Firestore within the provided transaction.
 * 2. Determining whether the dispute period has elapsed and the outcome.
 * 3. If the dispute succeeded, reversing the guest's recorded activity.
 * 4. Persisting the updated guest, activity list, and house dispute map.
 *
 * Returns early (no-op) when guards fail: missing guest ID, guest not found,
 * missing week data, or the dispute outcome is still "none".
 */
export const determineDisputeResult = async (
  house: House,
  dispute: Dispute,
  transaction: FirebaseFirestore.Transaction
) => {
  logger.info("Determining dispute result...", house, dispute);

  // Support both old (victimId) and new (guestId) field names.
  const guestId = dispute.victimId || (dispute as any).guestId;
  if (!guestId) {
    logger.error("No guest ID found on dispute", dispute);
    return;
  }

  const guestQuery = await transaction.get(
    guestCollection.where("id", "==", guestId)
  );

  if (guestQuery.empty || !guestQuery.docs[0]) {
    logger.error(`Guest ${guestId} not found for dispute ${dispute.id}`);
    return;
  }

  const guest = guestQuery.docs[0].data() as Guest;
  logger.info("Retrieved victim", guest.firstName, guest.lastName, "of dispute");

  // currentWeek is a legacy embedded field; the normalized model uses currentWeekId instead.
  const legacyGuest = guest as LegacyGuest;
  if (!legacyGuest.currentWeek) {
    logger.error(`Guest ${guestId} has no currentWeek`);
    return;
  }

  // Determine which embedded week object contains the dispute date.
  const week = dateIsInWeek(
    dispute.disputeDate,
    legacyGuest.currentWeek.startDate,
    legacyGuest.currentWeek.endDate
  )
    ? "currentWeek"
    : "previousWeek";

  const guestWeek = legacyGuest[week] as Week | undefined;
  if (!guestWeek) {
    logger.error(`Guest ${guestId} has no ${week}`);
    return;
  }

  const activities = guestWeek.activities || [];
  const activity = activities.find((a) => a.id === dispute.activityId);

  if (!activity) {
    logger.warn(
      `Activity ${dispute.activityId} not found in guest ${guestId}'s ${week}`
    );
    return;
  }

  logger.info("ACTIVITY", activity);
  const result = disputeResult(dispute, activity);
  let victim: Guest = guest;

  if (result === "success") {
    const disputeType = dispute.type;
    const safeDay = getSafeDay(guestWeek, dispute.disputeDate);

    if (disputeType === "chore_completed" || disputeType === "choreCompleted") {
      // Normalize legacy "chore_completed" snake_case to camelCase field name.
      const statKey = disputeType === "chore_completed" ? "choreCompleted" : disputeType;
      victim = reverseGuestStat(guest, week, statKey, false, dispute);
    }

    if (disputeType === "meeting_attended" || disputeType === "meeting") {
      const meetings = _.cloneDeep(safeDay.meeting || []);
      const index = meetings.findIndex((m) => m.name === dispute.meetingName);
      if (index > -1) {
        meetings.splice(index, 1);
      }
      victim = reverseGuestStat(guest, week, "meeting", meetings, dispute);
    }

    if (disputeType === "medication_taken" || disputeType === "medication") {
      victim = reverseGuestStat(guest, week, "medication", false, dispute);
    }

    if (disputeType === "supporter_met" || disputeType === "metPrimarySupporter") {
      victim = reverseGuestStat(guest, week, "metPrimarySupporter", false, dispute);
    }

    if (disputeType === "hours_worked" || disputeType === "hoursWorked") {
      victim = reverseGuestStat(guest, week, "hoursWorked", {}, dispute);
    }
  }

  if (result !== "none") {
    const victimLegacy = victim as LegacyGuest;
    const victimWeek = victimLegacy[week] as Week | undefined;
    if (victimWeek) {
      victimWeek.activities = updateActivity(victimWeek, dispute, result);
    }

    const { disputes, resolvedDispute } = updateHouseDisputes(
      house,
      dispute,
      result === "fail" ? "overturned" : "allowed"
    );
    logger.info("Committing updated disputes to database", disputes, victim);
    updateDispute(disputes, victim, [], transaction, resolvedDispute);
  }
};

/**
 * Wraps determineDisputeResult in a Firestore transaction with error logging.
 */
export const runDisputeTransaction = (house: House, dispute: Dispute) => {
  return ratsFirestore.runTransaction(async (transaction) => {
    logger.info(
      "Beginning dispute updates for house with id and name",
      house.id,
      house.name
    );
    try {
      return determineDisputeResult(house, dispute, transaction);
    } catch (error) {
      logger.info("Transaction failed for dispute", dispute, error);
      return;
    }
  });
};
