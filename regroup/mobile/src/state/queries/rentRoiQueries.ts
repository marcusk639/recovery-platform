import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRentRoiMetrics, RentRoiResult } from '../../services/rentRoi';
import { logException } from '../../util/logging';

export const rentRoiKeys = {
  all: ['rentRoi'] as const,
  metrics: (houseId: string, startDate?: string) =>
    [...rentRoiKeys.all, houseId, startDate ?? 'all'] as const,
};

/** The house's rent-collection ROI from `startDate` (YYYY-MM-DD) to today, or for all time. */
export const useRentRoiMetrics = (houseId: string, startDate?: string) => {
  const result = useQuery<RentRoiResult>({
    queryKey: rentRoiKeys.metrics(houseId, startDate),
    queryFn: () => getRentRoiMetrics(houseId, startDate),
    enabled: !!houseId,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    // A manager or peer leader is refused by design (owner only); that isn't a fault.
    const code = (result.error as { code?: string } | null)?.code;
    if (result.error && !String(code).includes('permission-denied')) {
      logException(result.error);
    }
  }, [result.error]);

  return result;
};
