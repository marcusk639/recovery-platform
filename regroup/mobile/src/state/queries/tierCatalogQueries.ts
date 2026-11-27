import { useQuery } from '@tanstack/react-query';
import { getTierCatalog } from '../../services/tierCatalog';

export const tierCatalogKeys = {
  all: ['tierCatalog'] as const,
};

/**
 * The public tier catalog: prices, trial length and the sales switch. `data`
 * is null when the callable failed (getTierCatalog never throws), and
 * undefined while loading or disabled; either way, show no number.
 */
export const useTierCatalog = (enabled = true) =>
  useQuery({
    queryKey: tierCatalogKeys.all,
    queryFn: getTierCatalog,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
