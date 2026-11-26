import type { QueryClient } from '@tanstack/react-query';
import { houseKeys } from '../state/queries/houseKeys';

/**
 * Invalidates the queries SubscriptionGate decides from (the user, the
 * houses and the paywall kill switch), so the gate re-decides after
 * the plan changed on the web. Used when the app returns to the foreground
 * and when a checkout hand-back link arrives (launch P5 Task 10).
 */
export function refreshPlanState(
  queryClient: QueryClient,
  user: { id?: string | null } | null | undefined,
): void {
  if (user?.id) {
    queryClient.invalidateQueries({ queryKey: ['user', user.id] });
  }
  // Every house detail, not just user.houseId: the gate reads the selected
  // house (state.houses.selectedHouseId), which differs for an operator with
  // several houses.
  queryClient.invalidateQueries({ queryKey: houseKeys.details() });
  queryClient.invalidateQueries({ queryKey: ['paywall', 'config'] });
}
