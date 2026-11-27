import { useQuery } from '@tanstack/react-query';
import { getHouseListing } from '../../services/houseListings';

export const houseListingKeys = {
  all: ['houseListings'] as const,
  detail: (houseId: string) => [...houseListingKeys.all, 'detail', houseId] as const,
};

/** A house's public listing, for the signed-out house summary (EMU-009). */
export const useHouseListing = (houseId: string | null | undefined) =>
  useQuery({
    queryKey: houseListingKeys.detail(houseId ?? ''),
    queryFn: () => getHouseListing(houseId ?? ''),
    enabled: !!houseId,
    staleTime: 60000,
  });
