import {useState, useEffect, useCallback} from 'react';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  isOffline: boolean;
}

/**
 * Hook to monitor network connectivity status
 * Returns real-time connectivity information
 *
 * Uses conservative approach - only shows offline when isConnected is explicitly false.
 * We don't rely on isInternetReachable as it can give false negatives on some networks.
 */
export const useNetworkStatus = (): NetworkStatus => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
    type: null,
    isOffline: false,
  });

  const handleNetworkChange = useCallback((state: NetInfoState) => {
    // Only consider offline if isConnected is explicitly false
    // Don't use isInternetReachable - it's unreliable on many networks
    // null or undefined means still determining - assume connected
    const isOffline = state.isConnected === false;

    setNetworkStatus({
      isConnected: state.isConnected ?? true,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      isOffline,
    });
  }, []);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(handleNetworkChange);

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    return () => {
      unsubscribe();
    };
  }, [handleNetworkChange]);

  return networkStatus;
};

export default useNetworkStatus;
