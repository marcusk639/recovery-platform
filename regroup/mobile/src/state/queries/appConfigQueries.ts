import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getMinimumVersion } from '../../services/appConfig';

export const appConfigKeys = {
  minVersion: (platform: string) => ['appConfig', 'minVersion', platform] as const,
};

/**
 * The minimum app version for this platform, or null for none. Fetched once
 * per launch (VersionGate refetches it on foreground). Null while loading and
 * on any failure: the version gate fails open.
 */
export function useMinimumVersion(): string | null {
  const { data } = useQuery({
    queryKey: appConfigKeys.minVersion(Platform.OS),
    queryFn: () => getMinimumVersion(Platform.OS),
    staleTime: Infinity,
    retry: false, // getMinimumVersion never throws; no retry loop needed
  });
  return data ?? null;
}
