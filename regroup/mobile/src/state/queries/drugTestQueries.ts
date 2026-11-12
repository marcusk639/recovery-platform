import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  logDrugTest,
  getDrugTestsForGuest,
  getDrugTestsForHouse,
  getPositiveTestCount,
} from '../../services/drugTests';
import { DrugTest } from '../../entities/DrugTest';

export const drugTestKeys = {
  all: ['drug-tests'] as const,
  guestTests: (houseId: string, guestId: string) =>
    [...drugTestKeys.all, 'guest', houseId, guestId] as const,
  houseTests: (houseId: string) =>
    [...drugTestKeys.all, 'house', houseId] as const,
  positiveCount: (houseId: string, guestId: string) =>
    [...drugTestKeys.all, 'positive-count', houseId, guestId] as const,
};

export function useGuestDrugTests(
  houseId: string,
  guestId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: drugTestKeys.guestTests(houseId, guestId),
    queryFn: () => getDrugTestsForGuest(houseId, guestId),
    enabled: enabled && !!houseId && !!guestId,
    staleTime: 30000,
  });
}

export function useHouseDrugTests(houseId: string, enabled = true) {
  return useQuery({
    queryKey: drugTestKeys.houseTests(houseId),
    queryFn: () => getDrugTestsForHouse(houseId),
    enabled: enabled && !!houseId,
    staleTime: 30000,
  });
}

export function usePositiveTestCount(
  houseId: string,
  guestId: string,
  sinceDays = 90,
) {
  return useQuery({
    queryKey: [...drugTestKeys.positiveCount(houseId, guestId), sinceDays],
    queryFn: () => getPositiveTestCount(houseId, guestId, sinceDays),
    enabled: !!houseId && !!guestId,
    staleTime: 60000,
  });
}

export function useLogDrugTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      test: Omit<DrugTest, 'id' | 'createdAt' | 'escalationTriggered'>,
    ) => logDrugTest(test),
    onSuccess: result => {
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.guestTests(result.houseId, result.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.houseTests(result.houseId),
      });
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.positiveCount(result.houseId, result.guestId),
      });
    },
  });
}
