import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '../state/store';
import { useSelectedHouse } from './useSelectedHouse';
import { subscriptionIsActive } from '../util/subscription';
import { logException } from '../util/logging';
import { paywallConfigRef } from '../services/paywall';
import { toDateSafe } from '../util/firestore';
import { User } from '../entities/User';

/**
 * Possible outcomes of the subscription gate check.
 *
 * - allowed              — user may access the main app
 * - subscription_required — operator's subscription has lapsed
 * - grace_period         — guest's operator lapsed but grace window is open
 * - grace_expired        — guest's operator lapsed and grace window has closed
 * - loading              — house data not yet available; caller should suspend
 */
export type GateStatus =
  | 'allowed'
  | 'subscription_required'
  | 'grace_period'
  | 'grace_expired'
  | 'loading';

export type GateResult =
  | { status: 'allowed' }
  | { status: 'subscription_required' }
  | { status: 'grace_period'; endsAt: Date }
  | { status: 'grace_expired' }
  | { status: 'loading' };

/**
 * Kill-switch hook — reads `paywall/config` from Firestore.
 *
 * If `enabled` is explicitly `false` the paywall is bypassed globally.
 * On fetch failure or missing document the switch defaults to `true`
 * (fail-closed: paywall stays on).
 *
 * Returns `{ killSwitchEnabled: boolean; isLoading: boolean }`.
 */
export function usePaywallKillSwitch(): {
  killSwitchEnabled: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['paywall', 'config'],
    queryFn: async () => {
      try {
        const doc = await paywallConfigRef.get();
        if (!doc.exists) {
          return { enabled: true };
        }
        const raw = doc.data();
        // Default to true (fail closed) if field absent or not boolean
        const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : true;
        return { enabled };
      } catch (error) {
        logException(error);
        // Fail closed — paywall remains active on error
        return { enabled: true };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — low churn config doc
    retry: false, // We already handle errors above; no retry loop needed
  });

  return {
    killSwitchEnabled: data?.enabled ?? true,
    isLoading,
  };
}

/**
 * Evaluates whether the current user should be shown the full app or a
 * subscription-blocked screen.
 *
 * Reads from already-loaded Redux / React Query state only — no extra
 * Firestore fetches beyond the kill-switch config doc.
 *
 * Logic:
 *   anonymous / potentialSuperAdmin           → allowed (short-circuit)
 *   kill switch disabled                       → allowed
 *   admin | superAdmin: subscriptionIsActive   → allowed  else → subscription_required
 *   guest: house not loaded                    → loading
 *          active | trialing | '' | undefined  → allowed
 *          lapsed + grace window open          → grace_period (with endsAt)
 *          lapsed + grace expired              → grace_expired
 */
export function useSubscriptionGate(): GateResult {
  const user = useAppSelector(s => s.user.user) as Partial<User> | null;
  const anonymous = useAppSelector(s => s.user.anonymous);
  const { house, isLoading: houseLoading } = useSelectedHouse();
  const { killSwitchEnabled, isLoading: killSwitchLoading } =
    usePaywallKillSwitch();

  // Anonymous users — always allowed (pre-auth state)
  if (anonymous || user?.isAnonymous) {
    return { status: 'allowed' };
  }

  // potentialSuperAdmin — mid-onboarding, not yet operator; allow through
  if (user?.potentialSuperAdmin) {
    return { status: 'allowed' };
  }

  // Kill switch loading — show spinner while the config doc is fetched.
  // Using 'loading' here is fail-closed: access is never granted before
  // the kill-switch check completes. The 5-min staleTime means this only
  // blocks on the very first cold start; subsequent opens resolve instantly.
  if (killSwitchLoading) {
    return { status: 'loading' };
  }

  // Kill switch explicitly disabled — bypass all subscription checks
  if (!killSwitchEnabled) {
    return { status: 'allowed' };
  }

  // --- Operator gate (admin / superAdmin) ---
  if (user?.isAdmin || user?.isSuperAdmin) {
    if (subscriptionIsActive(user as User)) {
      return { status: 'allowed' };
    }
    return { status: 'subscription_required' };
  }

  // --- Guest gate ---
  if (user?.isGuest) {
    if (houseLoading) {
      return { status: 'loading' };
    }

    // No house loaded yet after houseLoading=false — treat as loading
    // (can happen on first render before selectedHouseId is set)
    if (!house) {
      return { status: 'loading' };
    }

    const houseStatus = house.subscriptionStatus;

    // Active, trialing, or not set — allow
    if (
      !houseStatus ||
      houseStatus === 'active' ||
      houseStatus === 'trialing'
    ) {
      return { status: 'allowed' };
    }

    // Lapsed statuses: canceled, past_due, unpaid
    const endsAt = toDateSafe(house.guestGraceEndsAt);
    if (endsAt && endsAt > new Date()) {
      return { status: 'grace_period', endsAt };
    }

    return { status: 'grace_expired' };
  }

  // User record loaded but no role flags set — loading / transitional state
  return { status: 'loading' };
}
