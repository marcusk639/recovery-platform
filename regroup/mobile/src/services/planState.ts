import type { QueryClient } from '@tanstack/react-query';
import { houseKeys } from '../state/queries/houseKeys';

/**
 * Invalidates the queries SubscriptionGate decides from (the user, the
 * selected house and the paywall kill switch), so the gate re-decides after
 * the plan changed on the web. Used when the app returns to the foreground
 * and when a checkout hand-back link arrives (launch P5 Task 10).
 */
export function refreshPlanState(
  queryClient: QueryClient,
  user: { id?: string | null; houseId?: string | null } | null | undefined,
): void {
  if (user?.id) {
    queryClient.invalidateQueries({ queryKey: ['user', user.id] });
  }
  if (user?.houseId) {
    queryClient.invalidateQueries({ queryKey: houseKeys.detail(user.houseId) });
  }
  queryClient.invalidateQueries({ queryKey: ['paywall', 'config'] });
}
