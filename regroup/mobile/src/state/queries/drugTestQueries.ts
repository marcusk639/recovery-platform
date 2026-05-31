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
  guestTests: (guestId: string) =>
    [...drugTestKeys.all, 'guest', guestId] as const,
  houseTests: (houseId: string) =>
    [...drugTestKeys.all, 'house', houseId] as const,
  positiveCount: (guestId: string) =>
    [...drugTestKeys.all, 'positive-count', guestId] as const,
};

export function useGuestDrugTests(guestId: string, enabled = true) {
  return useQuery({
    queryKey: drugTestKeys.guestTests(guestId),
    queryFn: () => getDrugTestsForGuest(guestId),
    enabled: enabled && !!guestId,
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

export function usePositiveTestCount(guestId: string, sinceDays = 90) {
  return useQuery({
    queryKey: [...drugTestKeys.positiveCount(guestId), sinceDays],
    queryFn: () => getPositiveTestCount(guestId, sinceDays),
    enabled: !!guestId,
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
        queryKey: drugTestKeys.guestTests(result.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.houseTests(result.houseId),
      });
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.positiveCount(result.guestId),
      });
    },
  });
}
