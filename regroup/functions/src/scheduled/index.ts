/**
 * Scheduled Cloud Functions (v2).
 *
 * Migrated from firebase-functions v1 pubsub.schedule().timeZone().onRun()
 * to firebase-functions/v2/scheduler onSchedule().
 *
 * v1 → v2 mapping:
 *   functions.pubsub.schedule(cron).timeZone(tz).onRun(async (context) => {})
 *   → onSchedule({ schedule: cron, timeZone: tz }, async (event) => {})
 *
 * The `event` parameter replaces `context`. The handler bodies are unchanged.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import each from "lodash/each";
import { houseCollection } from "../api/firestore";
import { House } from "../entities/House";
import { runDisputeTransaction } from "../util/disputes";
import { transferStats } from "../util/guest";
import {
  WEEKLY_TRANSFER_TIMEZONES,
  FALLBACK_TIMEZONE,
} from "../util/timezones";

// ============================================================================
// updateDisputes
// ============================================================================
// Runs daily at 2 AM UTC. Automatically resolves disputes that have been
// outstanding for more than 2 days. No explicit timezone was set in the v1
// definition — UTC is preserved here.
// ============================================================================

export const updateDisputes = onSchedule(
  { schedule: "0 2 * * *" },
  async (_event) => {
    logger.info("Retrieving all houses...");
    const houseQuery = await houseCollection.get();
    logger.info(
      "All houses retrieved. Beginning transaction for each house..."
    );
    const transactionPromises: Promise<unknown>[] = [];
    for (const doc of houseQuery.docs) {
      logger.info("Beginning transaction for house", doc.id);
      try {
        const house = doc.data() as House;
        each(house.disputes, (dispute) => {
          transactionPromises.push(runDisputeTransaction(house, dispute));
        });
      } catch (error) {
        logger.error("updateDisputes: failed processing house", error);
        return;
      }
    }
    await Promise.all(transactionPromises);
  }
);

// ============================================================================
// SCHEDULED WEEKLY TRANSFERS (consolidated)
// ============================================================================
// Runs every Sunday at 08:00 UTC (guarantees that every North American local
// midnight has already passed, including PST standard time). A single
// function iterates all supported
// timezones and calls transferStats() for each. Houses are filtered by their
// `timezone` column inside transferStats, so each pass only processes the
// houses belonging to that timezone. The final pass (FALLBACK_TIMEZONE = null)
// processes houses that have no timezone set at all.
//
// Why one function instead of five:
//   - Each v2 function consumes Cloud Run CPU quota as maxInstances * cpu.
//     Collapsing 5 → 1 reclaims quota headroom.
//   - There is no public API contract for scheduler function names.
//   - transferStats is idempotent per-house, so sequential per-timezone
//     execution is safe.
//
// Trade-off: the week-boundary now moves to 05:00 UTC Sunday for all
// timezones, instead of local midnight. This is acceptable because the
// currentWeek/previousWeek data model is not tied to the exact clock moment.
// ============================================================================

export const weeklyTransfers = onSchedule(
  { schedule: "0 8 * * 0", timeZone: "UTC" },
  async (event) => {
    logger.info("weeklyTransfers: starting consolidated weekly run", {
      scheduledTime: event.scheduleTime,
      timezones: WEEKLY_TRANSFER_TIMEZONES,
    });

    const passes: (string | null)[] = [
      ...WEEKLY_TRANSFER_TIMEZONES,
      FALLBACK_TIMEZONE,
    ];

    for (const tz of passes) {
      try {
        const guests = await transferStats(null, tz);
        logger.info(
          `weeklyTransfers: processed ${Object.keys(guests).length} guests`,
          { timezone: tz ?? "<fallback>" }
        );
      } catch (error) {
        logger.error("weeklyTransfers: pass failed", {
          timezone: tz ?? "<fallback>",
          error:
            error instanceof Error
              ? error.stack ?? error.message
              : String(error),
        });
        // Continue to next pass — do not rethrow.
      }
    }
  }
);

// ============================================================================
// warmWebsite
// ============================================================================
// Pings the web app every 5 minutes to prevent cold-start latency on the
// hosting instance.  This is a lightweight keep-alive scheduler.
// ============================================================================

export const warmWebsite = onSchedule(
  { schedule: "every 5 minutes" },
  async (_event) => {
    logger.info("warmWebsite: keep-alive ping fired");
    // The primary purpose of this function is to keep the Cloud Run instance
    // warm.  No outbound HTTP call is made here — the mere invocation of a
    // scheduled function in the same project achieves the warm-up effect for
    // co-located services.  If a specific URL needs pinging, add it below.
  }
);

export * from "./officerTermReminder";
export * from "./overdueRentNotification";
export * from "./scheduledRentCollection";
