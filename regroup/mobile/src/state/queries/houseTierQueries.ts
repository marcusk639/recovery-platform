import { useQuery } from '@tanstack/react-query';
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
