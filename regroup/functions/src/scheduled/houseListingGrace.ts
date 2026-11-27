/**
 * houseListingGraceSweep: takes a past-due house out of signed-out search once
 * the app's guest grace (guestGraceEndsAt) ends (owner decision 2026-11-27).
 *
 * onHouseListingSync re-plans a listing on every house write, but nothing
 * writes the house when its grace runs out. This sweep re-plans each past_due
 * house through the same syncHouseListing, so the listing rule stays in one
 * place (houses/houseListing.ts). A house that becomes active again is written
 * by the webhook, and the trigger lists it again.
 *
 * A past_due house with no guestGraceEndsAt (one set past_due by
 * setOperatorHousesStatus or the status migration, which write no deadline) is
 * delisted at once, as the paywall denies it (owner decision 2026-11-27).
 *
 * Cost: one equality query on subscriptionStatus that reads only
 * guestGraceEndsAt. Houses whose grace still runs are skipped in memory; for
 * the rest one batched read finds which still have a listing, and only those
 * are re-planned (two reads each) and deleted.
 */
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { houseCollection, houseListingCollection, ratsFirestore } from '../api/firestore';
import { syncHouseListing } from '../triggers/firestore/houseListing';
import { evaluateEntitlement } from '../util/entitlement';

/** Houses re-planned at once. */
const CONCURRENCY = 10;

export interface GraceSweepResult {
  /** past_due houses read. */
  checked: number;
  /** Of those, grace ended (or no deadline) and a listing still exists: re-planned. */
  resynced: number;
  written: number;
  deleted: number;
  unchanged: number;
  failed: number;
}

/** Listing documents read in one batched call. */
const READ_BATCH = 100;

/** The grace has ended or has no readable deadline: the paywall's own rule. */
function graceOver(deadline: unknown, now: number): boolean {
  return !evaluateEntitlement(
    {
      subscriptionStatus: 'past_due',
      guestGraceEndsAt: typeof deadline === 'string' ? deadline : null,
    },
    now,
  ).entitled;
}

/** Which of these houses still have a listing, in batched reads. */
async function stillListed(houseIds: string[]): Promise<string[]> {
  const listed: string[] = [];
  for (let i = 0; i < houseIds.length; i += READ_BATCH) {
    const refs = houseIds.slice(i, i + READ_BATCH).map((id) => houseListingCollection.doc(id));
    const snaps = await ratsFirestore.getAll(...refs);
    for (const snap of snaps) if (snap.exists) listed.push(snap.id);
  }
  return listed;
}

export async function resyncPastDueListings(now: number = Date.now()): Promise<GraceSweepResult> {
  const snap = await houseCollection
    .where('subscriptionStatus', '==', 'past_due')
    .select('guestGraceEndsAt')
    .get();
  const expired: string[] = snap.docs
    .filter((d: { data: () => Record<string, unknown> }) => graceOver(d.data().guestGraceEndsAt, now))
    .map((d: { id: string }) => d.id);
  const ids = await stillListed(expired);
  const result: GraceSweepResult = {
    checked: snap.docs.length,
    resynced: ids.length,
    written: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
  };
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + CONCURRENCY).map(async (houseId) => {
        try {
          // The same plan as the trigger: the listing rule lives in one place.
          const kind = await syncHouseListing(houseId, now);
          if (kind === 'write') result.written += 1;
          else if (kind === 'delete') result.deleted += 1;
          else result.unchanged += 1;
        } catch (error) {
          result.failed += 1;
          logger.error('house_listing_grace.house_failed', { houseId, error });
        }
      }),
    );
  }
  return result;
}

export const houseListingGraceSweep = onSchedule(
  { schedule: '15 * * * *', timeZone: 'UTC', timeoutSeconds: 300 },
  async () => {
    const result = await resyncPastDueListings();
    logger.info('house_listing_grace.swept', { ...result });
    // Every other house was still swept; failing the run makes it visible.
    if (result.failed > 0) throw new Error('house_listing_grace.failed');
  },
);
