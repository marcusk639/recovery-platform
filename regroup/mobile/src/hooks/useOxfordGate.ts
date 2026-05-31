import { useAppSelector } from '../state/store';
import { useSelectedHouse } from './useSelectedHouse';

/**
 * Gate for Oxford-House feature access.
 *
 * Oxford governance tools are subscription-gated. Screens that render
 * Oxford-specific UI MUST check this gate so deep-links and stale
 * navigation state can not bypass the subscription check.
 *
 * Returns `{ allowed: boolean }`. If `allowed === false`, the screen should
 * render an early-return (e.g., an empty state or an upgrade prompt) and
 * avoid fetching / rendering Oxford data.
 *
 * Gating criteria (both must hold):
 *   1. A house is selected and its `houseType === 'oxford'`.
 *   2. The current user's subscriptionMetadata has `oxfordEnabled === true`.
 */
export function useOxfordGate(): { allowed: boolean; houseId: string } {
  const { house } = useSelectedHouse();
  const oxfordEnabled = useAppSelector(
    s => s.user.user?.subscriptionMetadata?.oxfordEnabled ?? false,
  );
  const allowed = !!house && house.houseType === 'oxford' && oxfordEnabled;
  return { allowed, houseId: house?.id ?? '' };
}
