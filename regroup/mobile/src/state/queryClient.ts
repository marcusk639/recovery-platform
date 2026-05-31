import { QueryClient } from '@tanstack/react-query';

/**
 * Global React Query client configuration
 *
 * Default options optimized for Firebase real-time data:
 * - staleTime: 30s - data is considered fresh for 30 seconds
 * - cacheTime: 5min - inactive data stays in cache for 5 minutes
 * - retry: 2 - retry failed queries twice before giving up
 * - refetchOnWindowFocus: false - don't refetch when app comes to foreground (we use real-time listeners)
 * - refetchOnReconnect: true - refetch when network connection is restored
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      retry: 2,
      refetchOnWindowFocus: false, // Mobile apps don't need this
      refetchOnReconnect: true, // Important for mobile
    },
    mutations: {
      retry: 1, // Retry mutations once on failure
    },
  },
});
