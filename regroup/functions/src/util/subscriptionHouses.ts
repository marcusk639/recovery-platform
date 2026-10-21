import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { HouseType, TierKey } from '../config';
import OperatorSubscription from '../entities/OperatorSubscription';
import { tierAllows } from './tierPricing';
import { withinPropertyCap } from './tierCaps';

/**
 * Adds houses to a tier subscription's houses map, enforcing the multiProperty
 * capability and the maxProperties cap. Ids already in the map are skipped and
 * do not count again. Pure: returns new metadata and does no Firestore access,
 * so callers can run it inside a transaction.
 * @throws HttpsError failed-precondition when a new id would exceed the plan.
 */
export const addHousesToSubscription = (
  meta: OperatorSubscription,
  houseIds: string[],
  now: Date = new Date(),
): OperatorSubscription => {
  const houses = meta.houses ?? {};

  // A second property requires the multiProperty capability. Resolve
  // it once, fail-closed: a mismatched/grandfathered tier makes tierAllows
  // throw, which must deny the capability (and log) rather than surface a
  // 500 to the operator.
  let allowsMultiProperty = false;
  try {
    allowsMultiProperty = tierAllows(
      meta.houseType as HouseType,
      meta.tier as TierKey,
      'multiProperty',
    );
  } catch (err) {
    logger.error('addHousesToSubscription: tierAllows threw', {
      houseType: meta.houseType,
      tier: meta.tier,
      err: (err as Error)?.message,
    });
    allowsMultiProperty = false;
  }

  // Check the cap per newly-added house so a multi-id batch cannot exceed
  // the property cap in a single call (each new id must fit under the cap).
  const added = { ...houses };
  for (const id of houseIds ?? []) {
    if (id in added) continue;
    // Checked before the numeric cap so single-property tiers get a
    // capability-specific message; the cap still bounds multi-property
    // tiers (e.g. Professional adding a 4th house past maxProperties=3).
    if (Object.keys(added).length >= 1 && !allowsMultiProperty) {
      throw new HttpsError(
        'failed-precondition',
        'Your plan does not include multiple properties — upgrade to add more houses',
      );
    }
    if (!withinPropertyCap(Object.keys(added).length, meta.maxProperties ?? null)) {
      throw new HttpsError('failed-precondition', 'Property limit reached for your plan');
    }
    added[id] = { numberOfGuests: 0 };
  }
  return {
    ...meta,
    houses: added,
    lastUpdatedAt: now.toISOString(),
  } as unknown as OperatorSubscription;
};

/**
 * Removes one house from a tier subscription's houses map (a no-op if absent).
 * Pure: returns new metadata and does no Firestore access.
 */
export const removeHouseFromSubscription = (
  meta: OperatorSubscription,
  houseId: string,
  now: Date = new Date(),
): OperatorSubscription => {
  const { [houseId]: _removed, ...remaining } = meta.houses ?? {};
  return {
    ...meta,
    houses: remaining,
    lastUpdatedAt: now.toISOString(),
  } as unknown as OperatorSubscription;
};
