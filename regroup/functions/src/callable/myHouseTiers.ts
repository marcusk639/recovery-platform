import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { houseTierOf } from '../util/houseRoles';
import { holds, liveClaims } from '../util/houseRoleStore';

const staffHouseIds = (claims: Record<string, unknown>): string[] => {
  const ids = new Set<string>();
  for (const role of ['admin', 'superAdmin'] as const) {
    const value = claims[role];
    const candidates = Array.isArray(value) ? value : Object.keys((value as object) ?? {});
    for (const houseId of candidates) if (holds(claims, role, houseId)) ids.add(houseId);
  }
  return [...ids];
};

/**
 * The caller's own tier in each house they hold a staff claim for. Managers and
 * peer leaders hold the same admin claim and house-roles is server-only, so this
 * is how the operator portal decides what to show. Display only: rules and
 * callables enforce access, and this reports on the caller alone.
 */
export const myHouseTiers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
  const uid = request.auth.uid;
  const claims = ((await liveClaims(uid)) ?? {}) as Record<string, unknown>;
  const houseIds = staffHouseIds(claims);
  const tiers = await Promise.all(houseIds.map((houseId) => houseTierOf(uid, houseId)));
  return { tiers: Object.fromEntries(houseIds.map((houseId, i) => [houseId, tiers[i]])) };
});
