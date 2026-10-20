import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import {
  adminCollection,
  guestCollection,
  houseCollection,
  ratsFirestore,
} from "../api/firestore";

/** Contact and health fields stripped from the guest-archive copy (policy D3). */
export const GUEST_PII_FIELDS: readonly string[] = [
  "email",
  "phoneNumber",
  "avatar",
  "displayName",
  "sobrietyDate",
  "drugOfChoice",
  "step",
  "dailyHabit",
  "supporters",
  "primarySupporterId",
  "primarySupporterName",
  "jobs",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "insuranceProvider",
  "insurancePolicyNumber",
  "referringCenterName",
  "referringCenterContact",
  "legalStatus",
  "probationOfficer",
  "probationOfficerPhone",
  "intakeNotes",
  "dischargeNotes",
  // Rent autopay links to the resident's Stripe customer and card.
  "stripeCustomerId",
  "defaultPaymentMethodId",
  "autoPayEnabled",
];

export function scrubGuestForArchive(
  guest: Record<string, unknown>,
  now: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...guest };
  for (const field of GUEST_PII_FIELDS) delete out[field];
  out.accountDeletedAt = now;
  out.userId = null;
  return out;
}

type Beds = Record<string, { guestId?: string | null } & Record<string, unknown>>;
type Rooms = Record<string, { beds?: Beds } & Record<string, unknown>>;

function clearGuestBed(rooms: Rooms, guestId: string): Rooms {
  const next: Rooms = {};
  for (const [roomId, room] of Object.entries(rooms)) {
    const beds: Beds = {};
    for (const [bedId, bed] of Object.entries(room.beds ?? {})) {
      beds[bedId] = bed.guestId === guestId ? { ...bed, guestId: null } : bed;
    }
    next[roomId] = { ...room, beds };
  }
  return next;
}

/**
 * Server-side mirror of mobile `deleteGuest`: archive the scrubbed guest, delete
 * the guest doc, free the bed and decrement house capacity, atomically.
 * Mobile also deletes a `phases[guestId]` entry; that lookup is keyed by guest id
 * (a legacy oddity), so it is intentionally not mirrored here.
 */
export async function dischargeResident(guestId: string, now: string): Promise<void> {
  const guestRef = guestCollection.doc(guestId);
  const archiveRef = ratsFirestore.collection("guest-archive").doc(guestId);
  await ratsFirestore.runTransaction(async (tx) => {
    const guestSnap = await tx.get(guestRef);
    if (!guestSnap.exists) return;
    const guest = guestSnap.data() as Record<string, unknown>;
    const houseId = guest.houseId as string | undefined;
    const houseRef = houseId ? houseCollection.doc(houseId) : undefined;
    const houseSnap = houseRef ? await tx.get(houseRef) : undefined;

    tx.set(archiveRef, scrubGuestForArchive(guest, now));
    tx.delete(guestRef);
    if (houseRef && houseSnap?.exists) {
      const house = houseSnap.data() as { currentCapacity?: number; rooms?: Rooms };
      tx.update(houseRef, {
        currentCapacity: Math.max(0, (house.currentCapacity ?? 0) - 1),
        rooms: clearGuestBed(house.rooms ?? {}, guestId),
      });
    }
  });
  logger.info("accountDeletion: resident discharged", { guestId });
}

/**
 * Scrub a `guest-archive` doc written earlier by mobile `deleteGuest` /
 * `archiveGuest`, which holds the full guest. Uses a full `set` (not merge) so
 * the stripped fields are actually removed. Idempotent.
 */
export async function scrubArchivedGuest(guestId: string, now: string): Promise<void> {
  const archiveRef = ratsFirestore.collection("guest-archive").doc(guestId);
  const snap = await archiveRef.get();
  if (!snap.exists) return;
  await archiveRef.set(scrubGuestForArchive(snap.data() as Record<string, unknown>, now));
  logger.info("accountDeletion: archived guest scrubbed", { guestId });
}

/** Remove a staff admin from every house they administer, then delete their admin doc. */
export async function removeStaffAdmin(adminId: string): Promise<void> {
  const adminRef = adminCollection.doc(adminId);
  const adminSnap = await adminRef.get();
  if (!adminSnap.exists) return;
  const houseIds = ((adminSnap.data() as { houseIds?: string[] }).houseIds ?? []);
  for (const houseId of houseIds) {
    const houseRef = houseCollection.doc(houseId);
    const houseSnap = await houseRef.get();
    if (!houseSnap.exists) continue;
    await houseRef.update({
      adminIds: admin.firestore.FieldValue.arrayRemove(adminId),
      superAdminIds: admin.firestore.FieldValue.arrayRemove(adminId),
    });
  }
  await adminRef.delete();
  logger.info("accountDeletion: staff admin removed", { adminId });
}
