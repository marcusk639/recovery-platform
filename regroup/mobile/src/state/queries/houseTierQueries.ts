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
export const useMayEditRentMoney = (houseId: string): boolean => {
  const { data } = useQuery({
    queryKey: houseTierKeys.mine,
    queryFn: getMyHouseTiers,
    enabled: !!houseId,
    staleTime: 5 * 60 * 1000,
  });
  return !!houseId && RENT_MONEY_TIERS.has(data?.[houseId] ?? '');
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
