/**
 * Phase Advancement Query Hooks
 *
 * Provides hooks to check phase advancement eligibility and execute
 * advancement with admin approval.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  checkAdvancementEligibility,
  advanceGuestPhase,
  AdvancementEligibility,
} from '../../services/phaseAdvancement';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import { guestKeys } from './guestQueries';

export const advancementKeys = {
  all: ['phase-advancement'] as const,
  eligibility: (guestId: string) =>
    [...advancementKeys.all, 'eligibility', guestId] as const,
  houseEligibility: (houseId: string) =>
    [...advancementKeys.all, 'house', houseId] as const,
};

/**
 * Check advancement eligibility for a single guest.
 */
export function useAdvancementEligibility(
  guest: Guest | null,
  house: House | null,
  enabled = true,
) {
  return useQuery({
    queryKey: advancementKeys.eligibility(guest?.id ?? ''),
    queryFn: () => checkAdvancementEligibility(guest!, house!),
    enabled: enabled && !!guest?.id && !!house?.id,
    staleTime: 300000, // 5 minutes — advancement status doesn't change often
  });
}

/**
 * Check advancement eligibility for all guests in a house.
 * Returns only eligible guests (filters out non-eligible and max-phase).
 */
export function useHouseAdvancementEligibility(
  guests: Guest[],
  house: House | null,
  enabled = true,
) {
  return useQuery({
    queryKey: advancementKeys.houseEligibility(house?.id ?? ''),
    queryFn: async (): Promise<AdvancementEligibility[]> => {
      const results = await Promise.all(
        guests
          .filter(g => g.status === 'active')
          .map(g => checkAdvancementEligibility(g, house!)),
      );
      return results.filter(r => r.eligible);
    },
    enabled: enabled && !!house?.id && guests.length > 0,
    staleTime: 300000,
  });
}

/**
 * Advance a guest to the next phase (admin action).
 * Invalidates guest queries and advancement eligibility after success.
 */
export function useAdvancePhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      guestId,
      nextPhaseName,
    }: {
      guestId: string;
      nextPhaseName: string;
    }) => advanceGuestPhase(guestId, nextPhaseName),

    onSuccess: (_data, { guestId }) => {
      queryClient.invalidateQueries({
        queryKey: advancementKeys.eligibility(guestId),
      });
      queryClient.invalidateQueries({
        queryKey: advancementKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: guestKeys.all,
      });
    },
  });
}
