import FirebaseFirestore from "@react-native-firebase/firestore";
import { firestore } from "../../firebase-setup";
import { Guest, GuestStatus } from "../entities/Guest";
import { Guests } from "../types/index";
import { logException } from "../util/logging";
import * as crud from "./crud";
import { find, keyBy } from "lodash";
import { House } from "../entities/House";
import { houseCollection, getHouse, removeGuestPrivileges } from "./house";
import { findGuestBed } from "../util/house";
import cloneDeep from "lodash/cloneDeep";

export const guestCollection = firestore.collection("guests");
export const archiveCollection = firestore.collection("guest-archive");

/**
 * Custom error for optimistic locking conflicts
 * FIX #2: Race condition prevention
 */
export class OptimisticLockError extends Error {
  constructor(
    message: string = "Guest was modified by another update. Please retry.",
  ) {
    super(message);
    this.name = "OptimisticLockError";
  }
}

export async function getGuest(uuid: string): Promise<Guest> {
  return crud.get<Guest>(guestCollection, uuid);
}

export function createGuestId() {
  return guestCollection.doc().id;
}

/**
 * Gets guests from db and maps them to object of key-value pairs.
 *
 * @param attribute - The field to query on (e.g., 'houseId')
 * @param value - The value to match
 */
export async function getGuests(
  attribute: string,
  value: string | number | boolean | null,
): Promise<Guests> {
  const result = await crud.getByAttribute<Guest>(
    guestCollection,
    attribute,
    "==",
    value,
  );
  return keyBy(result, "id") as Guests;
}

export async function getGuestsBlocking(
  attribute: string,
  value: string | number | boolean | null,
): Promise<Guests> {
  const result = await crud.getByAttribute<Guest>(
    guestCollection,
    attribute,
    "==",
    value,
  );
  return keyBy(result, "id") as Guests;
}

export async function updateGuest(
  guest: Partial<Guest>,
  updatedGuest: Partial<Guest>,
  retryCount: number = 3,
): Promise<Partial<Guest>> {
  if (!updatedGuest.id) {
    throw new Error("Guest must have an id for update");
  }

  const guestRef = guestCollection.doc(updatedGuest.id);

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const result = await firestore.runTransaction(async (transaction) => {
        // Read the current state from database
        const currentDoc = await transaction.get(guestRef);

        if (!currentDoc.exists) {
          throw new Error(`Guest ${updatedGuest.id} not found`);
        }

        const currentGuest = currentDoc.data() as Guest;

        // FIX #2: Merge stats instead of overwriting
        // This prevents one device's updates from overwriting another's
        const mergedGuest = mergeGuestStats(currentGuest, updatedGuest);

        // Increment version for optimistic locking
        mergedGuest.version = (currentGuest.version || 0) + 1;
        mergedGuest.updatedAt = new Date().toISOString();

        // Commit the transaction
        transaction.update(guestRef, mergedGuest as any);

        return mergedGuest;
      });

      return result;
    } catch (error: any) {
      // If it's a Firestore contention error, retry
      if (
        error.code === "aborted" ||
        error.code === "failed-precondition" ||
        error.message?.includes("contention")
      ) {
        if (attempt < retryCount - 1) {
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100),
          );
          continue;
        }
      }
      throw error;
    }
  }

  throw new OptimisticLockError();
}

/**
 * Merges guest stats from an update into the current database state.
 * This prevents race conditions where two updates could overwrite each other.
 * FIX #2: Smart merging of stats
 *
 * Merge strategy:
 * - Numeric accumulator fields (rentOwed, choreFees, step): take the max of
 *   current and update so that neither concurrent write loses a higher value.
 * - Boolean flag fields (isAdmin, infoEntered, hasJob): OR the two values so
 *   a flag that was set by one writer is never silently cleared by another.
 * - Array fields (supporters): union the two arrays to avoid losing entries.
 * - All other fields: the incoming update wins.
 * - Fields present in currentGuest but absent from updateGuest are preserved.
 */
function mergeGuestStats(
  currentGuest: Guest,
  updateGuest: Partial<Guest>,
): Partial<Guest> {
  // Start with all current fields so nothing from the DB is silently dropped,
  // then layer the incoming update on top (update wins for most fields).
  const merged: Partial<Guest> = {
    ...cloneDeep(currentGuest),
    ...cloneDeep(updateGuest),
  };

  // ── Numeric accumulator fields: take the maximum ────────────────────────────
  // These represent quantities that only grow (debt owed, fees accrued, step
  // progress). Taking the max ensures a concurrent write that already recorded
  // a higher value is never overwritten with a stale lower value.
  const numericMaxFields: Array<keyof Guest> = [
    "rentOwed",
    "choreFees",
    "step",
  ];
  for (const field of numericMaxFields) {
    const current = currentGuest[field] as number | undefined;
    const update = (updateGuest as any)[field] as number | undefined;
    if (typeof current === "number" && typeof update === "number") {
      (merged as any)[field] = Math.max(current, update);
    } else if (typeof current === "number" && update === undefined) {
      // Field not in the update — keep the DB value (already set above via spread).
      (merged as any)[field] = current;
    }
    // If only the update has the field, the spread above already used it.
  }

  // ── Boolean flag fields: OR the two values ──────────────────────────────────
  // Once a flag like isAdmin or infoEntered is set to true it should not be
  // cleared by a concurrent write that happened to still have the old false.
  const booleanOrFields: Array<keyof Guest> = [
    "isAdmin",
    "infoEntered",
    "hasJob",
  ];
  for (const field of booleanOrFields) {
    const current = currentGuest[field] as boolean | undefined;
    const update = (updateGuest as any)[field] as boolean | undefined;
    const currentBool = typeof current === "boolean" ? current : false;
    const updateBool = typeof update === "boolean" ? update : false;
    (merged as any)[field] = currentBool || updateBool;
  }

  // ── Array fields: union to avoid losing entries ─────────────────────────────
  // The supporters list can be modified by concurrent operations (e.g. adding a
  // supporter on two different devices). Unioning ensures no entry is lost.
  if (
    Array.isArray(currentGuest.supporters) ||
    Array.isArray(updateGuest.supporters)
  ) {
    const currentSupps = Array.isArray(currentGuest.supporters)
      ? currentGuest.supporters
      : [];
    const updateSupps = Array.isArray(updateGuest.supporters)
      ? updateGuest.supporters
      : [];
    merged.supporters = Array.from(new Set([...currentSupps, ...updateSupps]));
  }

  return merged;
}

export async function createGuest(newGuest: Guest): Promise<Guest> {
  const batch = firestore.batch();
  const house = await getHouse(newGuest.houseId);
  const newHouse = { ...house, currentCapacity: house.currentCapacity + 1 };
  batch.update(houseCollection.doc(house.id), newHouse);
  batch.set(guestCollection.doc(newGuest.id), newGuest);
  await batch.commit();
  return newGuest;
}

export async function deleteGuest(guest: Guest, house: House) {
  const batch = firestore.batch();
  batch.delete(guestCollection.doc(guest.id));
  batch.set(archiveCollection.doc(guest.id), guest);
  const bed = findGuestBed(guest.id, house.rooms);
  let rooms = cloneDeep(house.rooms);
  if (bed) {
    rooms = {
      ...rooms,
      [bed.roomId]: {
        ...rooms[bed.roomId],
        beds: {
          ...rooms[bed.roomId].beds,
          [bed.bed.id!]: {
            ...rooms[bed.roomId].beds[bed.bed.id!],
            guestId: null,
          },
        },
      },
    };
  }
  const guestPhase = find(house.phases, (phase) => phase.name === guest.id);
  const phases = cloneDeep(house.phases);
  if (guestPhase) {
    delete phases[guestPhase.name];
  }
  const updatedHouse: House = {
    ...house,
    currentCapacity: house.currentCapacity - 1,
    phases,
    rooms,
  };
  // batch.update(userCollection.doc(guest.userId), removeUserFromHouse());
  batch.update(houseCollection.doc(house.id), updatedHouse);
  await batch.commit();
  return { house: updatedHouse, guest };
}

export async function archiveGuest(guest: Guest): Promise<Guest> {
  return crud.create<Guest>(archiveCollection, guest, guest.id);
}

export function subscribeToGuest(
  guest: Guest,
  guestChangeHandler: (guest: Guest) => any,
  errorHandler?: (error: Error) => void,
) {
  return guestCollection.doc(guest.id).onSnapshot(
    (docSnapshot) => {
      const updatedGuest = docSnapshot.data() as Guest;
      if (updatedGuest) {
        guestChangeHandler(updatedGuest);
      }
    },
    (error: Error) => {
      if (errorHandler) {
        errorHandler(error);
      }
      // Always log even if caller doesn't provide a handler
      console.warn("[subscribeToGuest] Subscription error:", error.message);
    },
  );
}

export async function customizePhase(guest: Guest, house: House) {
  const batch = firestore.batch();
  // Field-level update — writing the whole guest object here silently dropped
  // any Firestore field not present in the in-memory copy (P0-5 data loss).
  batch.update(guestCollection.doc(guest.id), {
    phase: guest.phase,
    updatedAt: new Date().toISOString(),
  });
  batch.update(houseCollection.doc(house.id), house);
  await batch.commit();
  return { guest, house };
}

export async function dischargeGuest(
  guestId: string,
  moveOutDate: string,
  notes?: string,
): Promise<void> {
  try {
    await guestCollection.doc(guestId).update({
      status: "discharged" as GuestStatus,
      moveOutDate,
      ...(notes ? { dischargeNotes: notes } : {}),
      updatedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logException(error);
    throw new Error("Failed to discharge resident. Please try again.");
  }

  // The guest doc no longer reflects an active resident, but Firestore
  // security rules gate house access on Firebase custom claims, not a live
  // guest-doc status check. Unlike deleteGuest (which triggers claim
  // revocation via the guest doc's onWrite delete trigger), discharge keeps
  // the record — so claims must be revoked explicitly here or a discharged
  // resident retains full house-level read/write access indefinitely.
  try {
    const guest = await getGuest(guestId);
    await removeGuestPrivileges([guest]);
  } catch (error) {
    logException(error);
    throw new Error(
      "Resident was discharged, but house access could not be revoked. Please contact support.",
    );
  }
}
