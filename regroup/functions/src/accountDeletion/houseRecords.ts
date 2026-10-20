import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { houseCollection, ratsFirestore } from '../api/firestore';

/**
 * House records that outlive a deleted account but must stop pointing at it:
 * Oxford officer seats and votes, staff notes the user wrote as staff, and
 * `admin-archive` copies of their staff admin record. All writes are updates
 * scoped to the user's own ids; nothing here deletes a house record, and each
 * function is idempotent (a second run finds nothing left to change).
 * Logs ids and counts only.
 */

type Data = Record<string, unknown>;
type Ref = { update(data: Data): Promise<unknown> };
type Snap = { id: string; ref: Ref; exists?: boolean; data(): Data | undefined };

const fieldValue = () => admin.firestore.FieldValue;
const unique = (ids: string[]) => [...new Set(ids.filter(Boolean))];

/** Shown on a staff note whose stored author name is the author's email. */
export const FORMER_STAFF_NAME = 'Former staff member';

/** Contact fields removed from an `admin-archive` copy; names, houses and roles stay. */
export const ADMIN_ARCHIVE_SCRUBBED_FIELDS: readonly string[] = ['email', 'phoneNumber', 'avatar'];

/**
 * Vacate every Oxford officer seat (`houses/{h}/officers`) held by the user.
 * Officers are linked by auth uid (OfficerManagement writes `guest.userId`).
 * Role and term dates are kept; the seat becomes inactive, so the active-officer
 * views and the term reminder skip it. Onboarding seats carry only a typed name
 * and no `userId`, so they cannot be matched and are left alone.
 */
export async function vacateOfficerSeats(uid: string, now: string): Promise<number> {
  const snap = await ratsFirestore.collectionGroup('officers').where('userId', '==', uid).get();
  for (const doc of snap.docs) {
    await doc.ref.update({
      userId: fieldValue().delete(),
      name: fieldValue().delete(),
      isActive: false,
      vacatedAt: now,
    });
  }
  return snap.docs.length;
}

/**
 * Unlink the user's ballots from Oxford votes (`houses/{h}/votes`) in the houses
 * they lived in. castOxfordVote keys `individualVotes` and `voterIds` by guest
 * id, so every one of the user's guest ids is removed. `results` and `passed`
 * are not touched: the house's decisions and tallies stand.
 */
export async function unlinkCastVotes(guestIds: string[], houseIds: string[]): Promise<number> {
  const mineAll = unique(guestIds);
  if (mineAll.length === 0) return 0;
  let updated = 0;
  for (const houseId of unique(houseIds)) {
    const votes = await houseCollection.doc(houseId).collection('votes').get();
    for (const doc of votes.docs as unknown as Snap[]) {
      const data = doc.data() ?? {};
      const voterIds = Array.isArray(data.voterIds) ? (data.voterIds as unknown[]) : [];
      const individual = (data.individualVotes ?? {}) as Data;
      const voted = mineAll.filter((g) => voterIds.includes(g));
      const named = mineAll.filter((g) => Object.prototype.hasOwnProperty.call(individual, g));
      if (voted.length === 0 && named.length === 0) continue;
      const update: Data = {};
      if (voted.length > 0) update.voterIds = fieldValue().arrayRemove(...voted);
      for (const g of named) update[`individualVotes.${g}`] = fieldValue().delete();
      await doc.ref.update(update);
      updated++;
    }
  }
  return updated;
}

/**
 * Staff notes the user wrote as house staff stay (they are the house's
 * operational record), but lose the `authorId` link to the deleted account.
 * `authorName` is kept when it is a name; mobile falls back to the author's
 * email when Auth has no display name, and that is replaced.
 * Notes written ABOUT the user as a resident hold only the guest id and staff
 * text, so they are kept unchanged.
 */
export async function unlinkStaffNoteAuthor(uid: string): Promise<number> {
  const snap = await ratsFirestore.collection('staffNotes').where('authorId', '==', uid).get();
  for (const doc of snap.docs) {
    const name = (doc.data() ?? {}).authorName;
    const update: Data = { authorId: fieldValue().delete() };
    if (typeof name !== 'string' || !name.trim() || name.includes('@')) {
      update.authorName = FORMER_STAFF_NAME;
    }
    await doc.ref.update(update);
  }
  return snap.docs.length;
}

/**
 * Scrub `admin-archive` copies of the user's staff admin record (written by
 * mobile `deleteAdmin`, which copies the whole admin doc): contact fields go,
 * names and house links stay, as for `guest-archive`. Matched by `userId`, and
 * by the user's admin ids for legacy copies that have no `userId`.
 */
export async function scrubArchivedAdmins(
  uid: string,
  adminIds: string[],
  now: string,
): Promise<number> {
  const archive = ratsFirestore.collection('admin-archive');
  const linked = await archive.where('userId', '==', uid).get();
  const docs = new Map<string, Data>(linked.docs.map((d) => [d.id, d.data() ?? {}]));
  for (const id of unique(adminIds)) {
    if (docs.has(id)) continue;
    const snap = await archive.doc(id).get();
    const data = snap.exists ? (snap.data() ?? {}) : undefined;
    // Linked to another user (the user's own were matched above), or already scrubbed.
    if (!data || data.userId || data.accountDeletedAt) continue;
    docs.set(id, data);
  }
  for (const [id, data] of docs) {
    const out: Data = { ...data };
    for (const field of ADMIN_ARCHIVE_SCRUBBED_FIELDS) delete out[field];
    out.userId = null;
    out.accountDeletedAt = data.accountDeletedAt ?? now;
    await archive.doc(id).set(out);
  }
  return docs.size;
}

/** The members-step work on house records, for one user. */
export async function unlinkHouseRecords(
  uid: string,
  guestIds: string[],
  houseIdsByGuest: Record<string, string>,
  adminIds: string[],
  now: string,
): Promise<void> {
  const houses = guestIds.map((g) => houseIdsByGuest[g]).filter(Boolean);
  const counts = {
    officerSeats: await vacateOfficerSeats(uid, now),
    votes: await unlinkCastVotes(guestIds, houses),
    staffNotes: await unlinkStaffNoteAuthor(uid),
    archivedAdmins: await scrubArchivedAdmins(uid, adminIds, now),
  };
  logger.info('accountDeletion: house records unlinked', counts);
}
