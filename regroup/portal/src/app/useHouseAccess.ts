import { useQuery } from '@tanstack/react-query';
import { callHttpsFunction } from '../adapter/firebase-setup';
import { hasFullHouseView } from './access';
import { useRoles } from './useRoles';

export const HOUSE_TIERS_KEY = ['portal', 'house-tiers'] as const;

type Tiers = Record<string, 'owner' | 'manager' | 'peerLeader'>;

function useHouseTiers(enabled: boolean) {
  return useQuery({
    queryKey: HOUSE_TIERS_KEY,
    queryFn: async () => (await callHttpsFunction<{ tiers: Tiers }>('myHouseTiers', {})).data.tiers,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

const needsTier = (roles: Record<string, string>) => Object.values(roles).includes('admin');

// Display only: the rules and callables still decide what can be read.
export function useHouseAccess(houseId: string): { view: 'full' | 'limited' | 'checking' } {
  const roles = useRoles();
  const tiers = useHouseTiers(needsTier(roles));
  if (roles[houseId] === 'superAdmin') return { view: 'full' };
  if (roles[houseId] === 'admin' && tiers.status === 'pending') return { view: 'checking' };
  return { view: hasFullHouseView(roles, tiers.data, houseId) ? 'full' : 'limited' };
}

export function useRoleUnknown(): boolean {
  const roles = useRoles();
  const tiers = useHouseTiers(needsTier(roles));
  return needsTier(roles) && tiers.status === 'error';
}
