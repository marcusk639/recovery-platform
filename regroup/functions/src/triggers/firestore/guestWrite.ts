import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { adminCollection, guestCollection, ratsFirestore } from '../../api/firestore';
import { revokeHouseRoles } from '../../util/claims';
import { markTicketUsed } from '../../util/admission';
import {
  isActiveGuestDoc,
  isPlausibleUid,
  selectLegitimateGuests,
} from '../../util/guestMembership';
import { eventAgeMinutes, isStaleEvent, RETRY_CUTOFF_MS } from '../../util/eventAge';

// ─────────────────────────────────────────────────────────────────────────────
// onGuestWrite
//
// Fires on every create, update or delete of guests/{guestId}.
//
// DELETE: revokes the account's guest claim for the house, and its admin
//   claim, unless something still entitles the account to them:
//   - an ACTIVE guest doc of the account in the house (isActiveGuestDoc: not
//     moved out, inactive, expelled or discharged) keeps both claims, and is
//     logged as a warning. That doc may be a self-created duplicate; until
//     duplicates are marked (phase 2), it still keeps the claims;
//   - an admins/{id} doc of the account listing the house keeps the admin
//     claim.
//   The check reads current state, so a redelivery after the resident was
//   re-added finds their new active doc and revokes nothing. An account that
//   no longer exists (auth/user-not-found; account deletion removes the guest
//   doc, then the user) has no claims, so that counts as done.
//   Delete events ignore the age cutoff for this step, because skipping a
//   late delete would leave a departed resident's claims in place. A late
//   delete's cleanup is attempted once: on failure it logs an error (ids
//   only) and is not retried, so retrying stays bounded by the cutoff.
// CREATE: marks the account's admission ticket for the house used (the
//   self-create rule needs an unused one), once, in a transaction.
// ALL WRITES: re-splits the event's EES week over counted residents (see
//   resplitEES). Stale events (older than RETRY_CUTOFF_MS) skip this step.
//
// Registered with retry: true. Any failure of a fresh event is re-thrown after
// the other step has run, so the event is redelivered; both steps recompute
// from current state. Claims are last-writer-wins: a grant that lands between
// the cleanup's reads and its write can still be revoked.
// ─────────────────────────────────────────────────────────────────────────────
export const onGuestWrite = onDocumentWritten(
  { document: 'guests/{guestId}', retry: true },
  async (event) => {
    const isDelete = !event.data?.after?.exists;
    const guestData = event.data?.after?.data() ?? event.data?.before?.data();
    if (!guestData) return;
    const guestId = event.params.guestId;
    const houseId = typeof guestData.houseId === 'string' ? guestData.houseId : '';
    const stale = isStaleEvent(event.time);
    const ageInfo = { guestId, eventId: event.id, ageMinutes: eventAgeMinutes(event.time) };
    const isCreate = !isDelete && !event.data?.before?.exists;

    // The first guest doc created for an account in a house uses up its
    // admission ticket (util/admission), so the self-create rule refuses a
    // second one. Runs even for a late event (a missed mark would leave the
    // ticket open until it expires); a late failure is logged, not retried.
    if (isCreate && houseId && isPlausibleUid(guestData.userId)) {
      try {
        await markTicketUsed(guestData.userId, houseId, guestId);
      } catch (err) {
        if (!stale) throw err;
        logger.error('onGuestWrite: late create event; admission ticket not marked used', {
          ...ageInfo,
          houseId,
          error: (err as Error).message,
        });
      }
    }

    if (stale && !isDelete) {
      logger.warn(
        `onGuestWrite: event older than ${RETRY_CUTOFF_MS / 3600000}h retry cutoff; skipped`,
        ageInfo,
      );
      return;
    }

    let failure: Error | null = null;
    const remember = (step: string, err: unknown) => {
      const e = err as Error;
      failure = failure ?? e;
      logger.error(`onGuestWrite: ${step} failed`, { guestId, houseId, error: e.message });
    };

    if (isDelete && houseId && isPlausibleUid(guestData.userId)) {
      if (stale) logger.warn('onGuestWrite: late delete event; claims cleanup still runs', ageInfo);
      await revokeIfNoLongerEntitled(guestData.userId, houseId, guestId).catch((e) => {
        if (!stale) {
          remember('auth claims cleanup', e);
          return;
        }
        logger.error('onGuestWrite: late delete event; claims cleanup failed, not retried', {
          ...ageInfo,
          houseId,
          error: (e as Error).message,
        });
      });
    }

    if (!stale && houseId) {
      await resplitEES(houseId, event.time).catch((e) => remember('EES recalculation', e));
    }

    if (failure) throw failure;
  },
);

async function revokeIfNoLongerEntitled(
  uid: string,
  houseId: string,
  deletedGuestId: string,
): Promise<void> {
  const [guestSnap, adminSnap] = await Promise.all([
    guestCollection.where('userId', '==', uid).get(),
    adminCollection.where('userId', '==', uid).get(),
  ]);
  // Current state: a doc re-created with the deleted id counts like any other.
  const activeDoc = guestSnap.docs.find(
    (d) => d.data().houseId === houseId && isActiveGuestDoc(d.data()),
  );
  if (activeDoc) {
    logger.warn('onGuestWrite: account still has an active guest doc in the house; claims kept', {
      guestId: deletedGuestId,
      houseId,
      keptByGuestId: activeDoc.id,
    });
    return;
  }
  const listsHouse = (v: unknown) => Array.isArray(v) && v.includes(houseId);
  const stillAdmin = adminSnap.docs.some(
    (d) => listsHouse(d.data().houseIds) || listsHouse(d.data().superAdmin),
  );
  try {
    await revokeHouseRoles(uid, [houseId], stillAdmin ? ['guest'] : ['guest', 'admin']);
  } catch (err) {
    // No account, no claims: nothing left to revoke.
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      logger.info('onGuestWrite: account no longer exists; no claims to revoke', {
        guestId: deletedGuestId,
        houseId,
      });
      return;
    }
    throw err;
  }
}

/** ISO Monday (UTC) of the week containing `time`, as YYYY-MM-DD. */
export function isoWeekStartUtc(time: string | undefined, nowMs = Date.now()): string {
  const parsed = time ? Date.parse(time) : NaN;
  const d = new Date(Number.isNaN(parsed) ? nowMs : parsed);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Re-splits the EES week of the event (from event.time, so a redelivery after
 * midnight still targets the event's own week) over counted residents: active
 * guest docs whose account holds a claim for the house, or admin-entered docs
 * with no account.
 *
 * Writes only the unpaid records of counted residents. Left untouched:
 * - paid records (not read: the query filters paid == false);
 * - records of guest docs that are not counted: ghost (no claim), duplicate
 *   (second doc of the same account), moved-out, inactive, expelled or
 *   discharged;
 * - records whose guest doc no longer exists.
 * Weeks whose records carry no totalExpenses (every app-created record today)
 * are left alone entirely.
 *
 * Each update carries a lastUpdateTime precondition, so a record marked paid
 * (or otherwise changed) between the query and the commit fails the batch
 * instead of being overwritten; the event is then retried and recomputes.
 */
async function resplitEES(houseId: string, eventTime: string | undefined): Promise<void> {
  const guestsSnap = await guestCollection.where('houseId', '==', houseId).get();
  // docId is the guest doc id, which EES records store as guestId.
  const activeGuests = guestsSnap.docs
    .map((d) => {
      const g = d.data();
      return {
        docId: d.id,
        userId: g.userId as unknown,
        houseId: g.houseId as unknown,
        moveOutDate: g.moveOutDate as unknown,
        status: g.status as unknown,
      };
    })
    .filter((g) => isActiveGuestDoc(g));
  if (activeGuests.length === 0) return;

  const weekStart = isoWeekStartUtc(eventTime);
  const eesSnap = await ratsFirestore
    .collection('ees-records')
    .where('houseId', '==', houseId)
    .where('weekStart', '==', weekStart)
    .where('paid', '==', false)
    .get();
  if (eesSnap.empty) return;

  // App-created records carry a per-resident amount but no totalExpenses.
  // Reading the missing total as 0 used to zero every unpaid record.
  const totalExpenses = eesSnap.docs[0].data().totalExpenses;
  if (typeof totalExpenses !== 'number' || !Number.isFinite(totalExpenses)) {
    logger.warn('onGuestWrite: EES records have no totalExpenses; skipped', {
      houseId,
      recordCount: eesSnap.docs.length,
    });
    return;
  }

  // Checked after the EES query and the total check so most writes cost no
  // Auth lookups.
  const counted = await selectLegitimateGuests(activeGuests, houseId);
  const activeCount = counted.length;
  if (activeCount === 0) return;

  // Same rounding as mobile calculateEES (services/oxford/ees.ts). The divisor
  // is every counted resident, including any whose record is already paid or
  // missing, so the unpaid shares need not sum to the total (EES v2 fixes it).
  const newAmount = totalExpenses > 0 ? Math.round((totalExpenses / activeCount) * 100) / 100 : 0;

  const countedIds = new Set(counted.map((g) => g.docId));
  const targets = eesSnap.docs.filter((doc) => countedIds.has(doc.data().guestId));
  const leftAlone = eesSnap.docs.length - targets.length;

  if (targets.length > 0) {
    const batch = ratsFirestore.batch();
    targets.forEach((doc) => {
      batch.update(
        doc.ref,
        { amount: newAmount, residentCount: activeCount },
        { lastUpdateTime: doc.updateTime },
      );
    });
    await batch.commit();
  }

  logger.info(
    `onGuestWrite: EES recalculated for house ${houseId} week ${weekStart}: ${activeCount} residents, $${newAmount.toFixed(
      2,
    )} each; updated ${targets.length}, left ${leftAlone} unpaid record(s) untouched (ghost, duplicate, moved-out/inactive/expelled/discharged or deleted guest docs)`,
  );
}
