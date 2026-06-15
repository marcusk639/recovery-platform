import { logger } from "firebase-functions";
import {
  guestCollection,
  houseCollection,
  weekSummariesCollection,
  reportCollection,
  ratsFirestore,
} from "../api/firestore";
import { Guest, Guests } from "../entities/Guest";
import { House } from "../entities/House";
import { calculateWeeklyHealth } from "./house";
import { buildWeekId, getCurrentWeekStart, getNextWeekStart } from "./week";

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

interface TransferFailure {
  guestId: string;
  houseId: string;
  error: string;
  timestamp: string;
  attempts: number;
}

const failedTransfers: TransferFailure[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffDelay = (attempt: number): number => {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
};

// ---------------------------------------------------------------------------
// New normalized transfer — advances currentWeekId + currentWeekStartDate
// ---------------------------------------------------------------------------

/**
 * Advance a guest's week reference in a Firestore transaction.
 * Updates currentWeekId and currentWeekStartDate to point at the next week.
 * Pre-creates an empty week-summary document for the new week.
 */
export async function advanceGuestWeek(
  guestRef: FirebaseFirestore.DocumentReference,
  guest: Guest,
): Promise<Guest> {
  const currentWeekStart = guest.currentWeekStartDate ?? getCurrentWeekStart();
  const nextWeekStart = getNextWeekStart(currentWeekStart);
  const nextWeekId = buildWeekId(guest.id, nextWeekStart);
  const nextWeekEndDate = new Date(nextWeekStart + "T00:00:00Z");
  nextWeekEndDate.setUTCDate(nextWeekEndDate.getUTCDate() + 6);
  const nextWeekEnd = nextWeekEndDate.toISOString().split("T")[0];
  const currentMonday = getCurrentWeekStart();

  return ratsFirestore.runTransaction(async (transaction) => {
    const currentDoc = await transaction.get(guestRef);
    if (!currentDoc.exists) {
      throw new Error(`Guest ${guest.id} no longer exists`);
    }

    const currentGuest = currentDoc.data() as Guest;

    // Only advance if the week has actually ended
    if (currentGuest.currentWeekStartDate === currentMonday) {
      logger.info(`Guest ${guest.id} week is current, skipping`);
      return currentGuest;
    }

    // Update guest week reference
    transaction.update(guestRef, {
      currentWeekId: nextWeekId,
      currentWeekStartDate: nextWeekStart,
      lastUpdated: new Date().toISOString(),
    });

    // Pre-create empty week-summary document for the new week
    const summaryRef = weekSummariesCollection.doc(nextWeekId);
    transaction.set(
      summaryRef,
      {
        id: nextWeekId,
        guestId: guest.id,
        houseId: guest.houseId,
        startDate: nextWeekStart,
        endDate: nextWeekEnd,
        stats: {
          choresCompleted: 0,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        },
        dailyStats: {},
        lastUpdated: new Date().toISOString(),
        activityCount: 0,
      },
      { merge: true },
    );

    logger.info("Advanced guest week", {
      guestId: guest.id,
      from: currentWeekStart,
      to: nextWeekStart,
    });

    return {
      ...currentGuest,
      currentWeekId: nextWeekId,
      currentWeekStartDate: nextWeekStart,
    };
  });
}

// ---------------------------------------------------------------------------
// Per-guest transfer with retry
// ---------------------------------------------------------------------------

const transferGuestWeekWithRetry = async (
  guestDoc: FirebaseFirestore.QueryDocumentSnapshot,
  house: House,
): Promise<{ success: boolean; guest?: Guest; error?: string }> => {
  const guest = guestDoc.data() as Guest;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const updatedGuest = await advanceGuestWeek(guestDoc.ref, guest);
      return { success: true, guest: updatedGuest };
    } catch (error: any) {
      const isRetryable =
        error.code === "aborted" ||
        error.code === "unavailable" ||
        error.code === "deadline-exceeded" ||
        error.message?.includes("contention") ||
        error.message?.includes("UNAVAILABLE");

      if (isRetryable && attempt < RETRY_CONFIG.maxRetries - 1) {
        const delay = getBackoffDelay(attempt);
        logger.warn(
          `Retrying transfer for guest ${guest.id} after ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
          error.message,
        );
        await sleep(delay);
        continue;
      }

      const failure: TransferFailure = {
        guestId: guest.id,
        houseId: house.id,
        error: error.message || "Unknown error",
        timestamp: new Date().toISOString(),
        attempts: attempt + 1,
      };
      failedTransfers.push(failure);

      logger.error(
        `Failed to transfer week for guest ${guest.id} after ${attempt + 1} attempts`,
        error,
      );

      return { success: false, error: error.message };
    }
  }

  return { success: false, error: "Max retries exceeded" };
};

// ---------------------------------------------------------------------------
// Main transfer function — called by scheduled Cloud Functions
// ---------------------------------------------------------------------------

export const transferStats = async (
  context: unknown,
  timezone?: string | null,
  houseId?: string,
): Promise<Guests> => {
  logger.info("Starting weekly transfer...", { timezone, houseId });

  failedTransfers.length = 0;

  let houseQuery: FirebaseFirestore.QuerySnapshot;
  const guests: Guests = {};
  const results = {
    totalGuests: 0,
    successfulTransfers: 0,
    skippedTransfers: 0,
    failedTransfers: 0,
  };

  try {
    if (houseId) {
      houseQuery = await houseCollection.where("id", "==", houseId).get();
    } else if (timezone) {
      houseQuery = await houseCollection
        .where("timezone", "==", timezone)
        .get();
    } else {
      houseQuery = await houseCollection.get();
    }

    logger.info(`Found ${houseQuery.size} houses to process`);

    for (const houseDoc of houseQuery.docs) {
      const house = houseDoc.data() as House;

      if (!houseId && !timezone && house.timezone) {
        continue;
      }

      logger.info(`Processing house: ${house.name} (${house.id})`);

      try {
        const guestQuery = await guestCollection
          .where("houseId", "==", house.id)
          .where("status", "==", "active")
          .get();

        results.totalGuests += guestQuery.size;
        logger.info(
          `Found ${guestQuery.size} active guests in house ${house.name}`,
        );

        // Update house health
        try {
          calculateWeeklyHealth(guestQuery, house);
          await houseDoc.ref.update(JSON.parse(JSON.stringify(house)));
        } catch (healthError) {
          logger.warn(
            `Failed to update house health for ${house.name}`,
            healthError,
          );
        }

        // Advance each guest's week reference
        for (const guestDoc of guestQuery.docs) {
          const result = await transferGuestWeekWithRetry(guestDoc, house);

          if (result.success) {
            if (result.guest) {
              guests[result.guest.id] = result.guest;
            }
            results.successfulTransfers++;
          } else {
            results.failedTransfers++;
          }
        }
      } catch (houseError) {
        logger.error(`Error processing house ${house.name}`, houseError);
      }
    }
  } catch (error) {
    logger.error("Critical error in transferStats", error);
    throw error;
  }

  logger.info("Weekly transfer completed", results);

  if (failedTransfers.length > 0) {
    logger.error(
      `${failedTransfers.length} guest transfers failed`,
      failedTransfers,
    );
  }

  return guests;
};

export const getFailedTransfers = (): TransferFailure[] => {
  return [...failedTransfers];
};
