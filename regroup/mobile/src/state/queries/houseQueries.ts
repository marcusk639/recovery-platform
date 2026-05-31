import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { House } from '../../entities/House';
import { Houses } from '../../types';
import * as houseService from '../../services/house';

/**
 * House Query Hooks
 *
 * React Query hooks for managing house data from Firestore
 */

// Query Keys
export const houseKeys = {
  all: ['houses'] as const,
  lists: () => [...houseKeys.all, 'list'] as const,
  list: (filters: { attribute: string; value: string }) =>
    [...houseKeys.lists(), filters] as const,
  details: () => [...houseKeys.all, 'detail'] as const,
  detail: (houseId: string) => [...houseKeys.details(), houseId] as const,
  nearby: (lat: number, lng: number, distance: number) =>
    [...houseKeys.all, 'nearby', { lat, lng, distance }] as const,
};

/**
 * Fetch a single house by ID
 *
 * @param houseId - The house ID to fetch
 * @param enabled - Whether to enable the query (default: true)
 */
export const useHouse = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: houseKeys.detail(houseId),
    queryFn: () => houseService.getHouse(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000, // 1 minute - houses don't change often
  });
};

/**
 * Fetch houses by attribute
 *
 * @param attribute - The attribute to query on
 * @param operator - Firestore operator ('==', '>', '<', etc.)
 * @param value - The value to match
 * @param enabled - Whether to enable the query (default: true)
 */
export const useHouses = (
  attribute: string,
  operator: any,
  value: string,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: houseKeys.list({ attribute, value }),
    queryFn: () => houseService.getHouses(attribute, operator, value),
    enabled: enabled && !!attribute && !!value,
    staleTime: 60000, // 1 minute
  });
};

/**
 * Fetch houses by admin ID
 *
 * @param adminId - The admin ID
 * @param enabled - Whether to enable the query (default: true)
 */
export const useHousesByAdmin = (adminId: string, enabled: boolean = true) => {
  return useHouses('adminIds', 'array-contains', adminId, enabled);
};

/**
 * Fetch nearby houses
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param distanceInMiles - Search radius in miles
 * @param enabled - Whether to enable the query (default: true)
 */
export const useNearbyHouses = (
  lat: number,
  lng: number,
  distanceInMiles: number,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: houseKeys.nearby(lat, lng, distanceInMiles),
    queryFn: () => houseService.getNearbyHouses(lat, lng, distanceInMiles),
    enabled: enabled && !!lat && !!lng,
    staleTime: 120000, // 2 minutes
  });
};

/**
 * Update a house
 *
 * Uses optimistic updates for better UX
 */
export const useUpdateHouse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      houseId,
      values,
    }: {
      houseId: string;
      values: Partial<House>;
    }) => houseService.updateHouse(houseId, values),

    // Optimistic update
    onMutate: async ({ houseId, values }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: houseKeys.detail(houseId) });

      // Snapshot previous value
      const previousHouse = queryClient.getQueryData<House>(
        houseKeys.detail(houseId),
      );

      // Optimistically update
      if (previousHouse) {
        queryClient.setQueryData(houseKeys.detail(houseId), {
          ...previousHouse,
          ...values,
        });
      }

      return { previousHouse };
    },

    // Rollback on error
    onError: (err, { houseId }, context) => {
      if (context?.previousHouse) {
        queryClient.setQueryData(houseKeys.detail(houseId), context.previousHouse);
      }
    },

    // Refetch after mutation
    onSettled: (data, error, { houseId }) => {
      queryClient.invalidateQueries({ queryKey: houseKeys.detail(houseId) });
      queryClient.invalidateQueries({ queryKey: houseKeys.lists() });
    },
  });
};

/**
 * Create a new house
 */
export const useCreateHouse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (house: House) => houseService.createHouse(house),

    onSuccess: () => {
      // Invalidate all house lists
      queryClient.invalidateQueries({ queryKey: houseKeys.lists() });
    },
  });
};

/**
 * Update house admins
 */
export const useUpdateHouseAdmins = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ houseId, adminId }: { houseId: string; adminId: string }) =>
      houseService.updateHouseAdmins(houseId, adminId),

    onSuccess: (_, { houseId }) => {
      queryClient.invalidateQueries({ queryKey: houseKeys.detail(houseId) });
    },
  });
};
