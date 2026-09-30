import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

/** Subscription statuses that grant access outright. */
export const ENTITLED_STATUSES = ['active', 'trialing'];

/**
 * Minimal house fields needed for an entitlement decision.
 *
 * `guestGraceEndsAt` is written by the Stripe webhook on
 * `invoice.payment_failed` but is not declared on the House entity, so it is
 * typed here at the point of use (same pattern as `HouseAdminFields`).
 */
export interface HouseEntitlementFields {
  subscriptionStatus?: string | null;
  guestGraceEndsAt?: string | null;
}

export type EntitlementReason =
  | 'active'
  | 'trialing'
  | 'grace'
  | 'absent_status'
  | 'canceled'
  | 'unpaid'
  | 'expired_grace'
  | 'unknown_status'
  | 'kill_switch_off';

export interface EntitlementVerdict {
  entitled: boolean;
  reason: EntitlementReason;
}

/**
 * Decide whether a house is entitled to write access, from its stored
 * subscription state. Pure: no I/O, so every branch is directly testable.
 */
export function evaluateEntitlement(
  house: HouseEntitlementFields,
  now: number = Date.now(),
): EntitlementVerdict {
  const status = house.subscriptionStatus;

  // Phase A. A house with no status either predates the paywall or was never
  // backfilled. Grant access and flag it, so the size of that population can be
  // measured in production before this branch becomes a denial.
  if (status === undefined || status === null || status === '') {
    return { entitled: true, reason: 'absent_status' };
  }

  if (status === 'active' || status === 'trialing') {
    return { entitled: true, reason: status };
  }

  if (status === 'past_due') {
    const graceEndsAt = house.guestGraceEndsAt ? Date.parse(house.guestGraceEndsAt) : NaN;
    // An absent or unparseable deadline is not an unbounded grace period.
    if (Number.isFinite(graceEndsAt) && now < graceEndsAt) {
      return { entitled: true, reason: 'grace' };
    }
    return { entitled: false, reason: 'expired_grace' };
  }

  if (status === 'canceled' || status === 'unpaid') {
    return { entitled: false, reason: status };
  }

  // Anything unrecognized is denied rather than assumed benign — a typo or a
  // new Stripe status should not silently become free access.
  return { entitled: false, reason: 'unknown_status' };
}

/**
 * Throw unless the house is entitled. Returns the verdict so callers can log or
 * branch on the reason.
 */
export function assertHouseEntitled(
  house: HouseEntitlementFields,
  houseId: string,
  now: number = Date.now(),
): EntitlementVerdict {
  const verdict = evaluateEntitlement(house, now);

  if (verdict.reason === 'absent_status') {
    // Phase A signal. Every one of these is a house that will be denied once
    // enforcement goes fail-closed; drive the backfill off this count and only
    // flip the branch above once it reaches zero.
    logger.warn('entitlement.absent_status', {
      houseId,
      subscriptionStatus: house.subscriptionStatus ?? null,
    });
  }

  if (!verdict.entitled) {
    throw new HttpsError('failed-precondition', 'This house does not have an active subscription');
  }

  return verdict;
}

// ── Kill switch ──────────────────────────────────────────────────────────────
//
// paywall/config.enabled is the emergency override. It is read here with the
// Admin SDK, which bypasses security rules — the client-side hook reading the
// same document is denied by rules today (there is no `match /paywall/...`
// block), so a client-only switch cannot be relied on.

const KILL_SWITCH_TTL_MS = 60_000;

let cachedSwitch: { enabled: boolean; readAt: number } | null = null;

/** Test seam — the module-level cache would otherwise leak between cases. */
export function __resetPaywallCacheForTests(): void {
  cachedSwitch = null;
}

/**
 * Whether the paywall is currently enforced. Fails closed: if the config
 * document is missing, malformed, or unreadable, the paywall stays ON. An
 * unreadable switch must never be mistaken for "switched off".
 */
export async function isPaywallEnabled(now: number = Date.now()): Promise<boolean> {
  if (cachedSwitch && now - cachedSwitch.readAt < KILL_SWITCH_TTL_MS) {
    return cachedSwitch.enabled;
  }

  try {
    const snapshot = await admin.firestore().collection('paywall').doc('config').get();
    const raw = snapshot.exists
      ? (snapshot.data() as { enabled?: unknown } | undefined)
      : undefined;
    const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : true;
    cachedSwitch = { enabled, readAt: now };
    return enabled;
  } catch (err) {
    logger.error('entitlement.kill_switch_read_failed', {
      error: (err as Error)?.message,
    });
    cachedSwitch = { enabled: true, readAt: now };
    return true;
  }
}

/**
 * The gate callables should use: consults the kill switch first, then applies
 * the entitlement ladder. Throws when the house is not entitled.
 */
export async function enforceHouseEntitlement(
  house: HouseEntitlementFields,
  houseId: string,
  now: number = Date.now(),
): Promise<EntitlementVerdict> {
  if (!(await isPaywallEnabled(now))) {
    return { entitled: true, reason: 'kill_switch_off' };
  }
  return assertHouseEntitled(house, houseId, now);
}
