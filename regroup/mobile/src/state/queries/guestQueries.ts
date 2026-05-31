import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Guest } from '../../entities/Guest';
import { Guests } from '../../types';
import * as guestService from '../../services/guest';

/**
 * Guest Query Hooks
 *
 * React Query hooks for managing guest data from Firestore
 */

// Query Keys
export const guestKeys = {
  all: ['guests'] as const,
  lists: () => [...guestKeys.all, 'list'] as const,
  list: (houseId: string) => [...guestKeys.lists(), houseId] as const,
  details: () => [...guestKeys.all, 'detail'] as const,
  detail: (guestId: string) => [...guestKeys.details(), guestId] as const,
};

/**
 * Fetch all guests for a house
 *
 * @param houseId - The house ID to fetch guests for
 * @param enabled - Whether to enable the query (default: true)
 */
export const useGuests = (houseId: string, enabled: boolean = true) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: guestKeys.list(houseId),
    queryFn: async () => {
      const guests = await guestService.getGuests('houseId', houseId);
      return guests;
    },
    enabled: enabled && !!houseId,
    staleTime: 30000, // 30 seconds
  });
};

/**
 * Fetch all guests for a house (blocking version)
 * Only use when you need server-confirmed data
 *
 * @param houseId - The house ID to fetch guests for
 * @param enabled - Whether to enable the query (default: true)
 */
export const useGuestsBlocking = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [...guestKeys.list(houseId), 'blocking'],
    queryFn: () => guestService.getGuestsBlocking('houseId', houseId),
    enabled: enabled && !!houseId,
    staleTime: 30000,
  });
};

/**
 * Fetch a single guest by ID
 *
 * @param guestId - The guest ID to fetch
 * @param enabled - Whether to enable the query (default: true)
 */
export const useGuest = (guestId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: guestKeys.detail(guestId),
    queryFn: () => guestService.getGuest(guestId),
    enabled: enabled && !!guestId,
    staleTime: 30000,
  });
};

/**
 * Update a guest
 *
 * Uses optimistic updates for better UX
 */
export const useUpdateGuest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      guest,
      updatedGuest,
      retryCount = 3,
    }: {
      guest: Partial<Guest>;
      updatedGuest: Partial<Guest>;
      retryCount?: number;
    }) => guestService.updateGuest(guest, updatedGuest, retryCount),

    // Optimistic update
    onMutate: async ({ updatedGuest }) => {
      if (!updatedGuest.id) return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: guestKeys.detail(updatedGuest.id) });

      // Snapshot previous value
      const previousGuest = queryClient.getQueryData(
        guestKeys.detail(updatedGuest.id),
      );

      // Optimistically update
      queryClient.setQueryData(guestKeys.detail(updatedGuest.id), updatedGuest);

      // Also update in the list if it exists
      if (updatedGuest.houseId) {
        const previousGuests = queryClient.getQueryData<Guests>(
          guestKeys.list(updatedGuest.houseId),
        );
        if (previousGuests) {
          queryClient.setQueryData(guestKeys.list(updatedGuest.houseId), {
            ...previousGuests,
            [updatedGuest.id]: updatedGuest,
          });
        }
      }

      return { previousGuest, previousGuests: previousGuest };
    },

    // Rollback on error
    onError: (err, { updatedGuest }, context) => {
      if (context?.previousGuest && updatedGuest.id) {
        queryClient.setQueryData(
          guestKeys.detail(updatedGuest.id),
          context.previousGuest,
        );
      }
    },

    // Refetch after mutation
    onSettled: (data, error, { updatedGuest }) => {
      if (updatedGuest.id) {
        queryClient.invalidateQueries({ queryKey: guestKeys.detail(updatedGuest.id) });
      }
      if (updatedGuest.houseId) {
        queryClient.invalidateQueries({ queryKey: guestKeys.list(updatedGuest.houseId) });
      }
    },
  });
};

/**
 * Create a new guest
 */
export const useCreateGuest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (guest: Guest) => guestService.createGuest(guest),

    onSuccess: (newGuest) => {
      // Invalidate the house's guest list
      if (newGuest.houseId) {
        queryClient.invalidateQueries({ queryKey: guestKeys.list(newGuest.houseId) });
      }
    },
  });
};

/**
 * Delete a guest
 */
export const useDeleteGuest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ guest, house }: { guest: Guest; house: any }) =>
      guestService.deleteGuest(guest, house),

    onSuccess: (_, { guest }) => {
      // Invalidate all guest queries
      queryClient.invalidateQueries({ queryKey: guestKeys.all });
      if (guest.houseId) {
        queryClient.invalidateQueries({ queryKey: guestKeys.list(guest.houseId) });
      }
    },
  });
};

/**
 * Archive a guest
 */
export const useArchiveGuest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (guest: Guest) => guestService.archiveGuest(guest),

    onSuccess: (_, guest) => {
      // Invalidate the house's guest list
      if (guest.houseId) {
        queryClient.invalidateQueries({ queryKey: guestKeys.list(guest.houseId) });
      }
    },
  });
};
