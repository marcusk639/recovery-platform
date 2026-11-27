import { useQuery } from '@tanstack/react-query';
import { auth } from '../../../firebase-setup';
import { getMyHouseTiers } from '../../services/houseTiers';

export const houseTierKeys = {
  mine: ['houseTiers', 'mine'] as const,
};

/** Same as the rules' callerRank >= 2 (rentMoneyByManager). */
const RENT_MONEY_TIERS = new Set(['owner', 'manager']);

/**
 * Whether the caller may change residents' rent and chore balances in this
 * house. False while the tier is loading or could not be read, so a field the
 * rules would refuse is never offered.
 */
const useMyHouseTiers = (enabled: boolean) =>
  useQuery({
    queryKey: houseTierKeys.mine,
    queryFn: getMyHouseTiers,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

export const useMayEditRentMoney = (houseId: string): boolean => {
  const { data } = useMyHouseTiers(!!houseId);
  return !!houseId && RENT_MONEY_TIERS.has(data?.[houseId] ?? '');
};

/**
 * The same check for a screen that must wait for the answer
 * (RequireHouseRole): 'checking' while the tier loads, 'no' once it is known
 * to be a peer leader's, missing, or could not be read.
 */
export const useHouseMoneyAccess = (
  houseId: string,
  enabled = true,
): 'yes' | 'no' | 'checking' => {
  const { data, status } = useMyHouseTiers(enabled && !!houseId);
  if (!enabled || !houseId) return 'no';
  if (status === 'pending') return 'checking';
  if (status === 'error') return 'no';
  return RENT_MONEY_TIERS.has(data?.[houseId] ?? '') ? 'yes' : 'no';
};

/**
 * Whether the caller may see the house's payment records: owners and
 * managers, not peer leaders (owner decision 2026-11-09). The payments read
 * rule checks the same tiers (callerRank >= 2). False while the tier is
 * loading or could not be read, so a screen the rules would refuse is never
 * offered.
 */
export const useMayViewHouseMoney = useMayEditRentMoney;

/**
 * Whether the caller may change this resident's rent rate or balance: a
 * manager or above in their house, and never on their own record, whatever
 * their rank (the rules' rentMoneyByManager and ownMoneyUnchanged).
 */
export const useMayEditGuestMoney = (
  guest: { houseId?: string; userId?: string } | null | undefined,
): boolean => {
  const mayEdit = useMayEditRentMoney(guest?.houseId ?? '');
  const own = !!guest?.userId && guest.userId === auth.currentUser?.uid;
  return mayEdit && !own;
};

/**
 * Whether the caller may review and decide the house's resident applications:
 * owners and managers, not peer leaders (owner decision 2026-11-27). The
 * applications rules check the same tiers (callerRank >= 2). False while the
 * tier is loading or could not be read, so an entry point the rules would
 * refuse is never offered.
 */
export const useMayReviewApplications = useMayEditRentMoney;

export type ApplicationsAccess = 'yes' | 'no' | 'checking' | 'error';

/**
 * The same check for the application screens, which wait for the answer:
 * 'checking' while the tier loads, 'error' when it could not be read (the
 * screen offers a retry rather than telling a manager they may not), 'no'
 * once it is known to be a peer leader's or missing.
 */
export const useApplicationsAccess = (
  houseId: string,
): { access: ApplicationsAccess; retry: () => void } => {
  const { data, status, refetch } = useMyHouseTiers(!!houseId);
  const retry = () => {
    refetch();
  };
  if (!houseId) return { access: 'no', retry };
  if (status === 'pending') return { access: 'checking', retry };
  if (status === 'error') return { access: 'error', retry };
  return { access: RENT_MONEY_TIERS.has(data?.[houseId] ?? '') ? 'yes' : 'no', retry };
};
