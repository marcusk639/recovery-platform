/** React Query keys for house data (houseQueries.ts re-exports them). */
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
